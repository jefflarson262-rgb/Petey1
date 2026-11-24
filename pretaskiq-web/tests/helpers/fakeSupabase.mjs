// A small stand-in for Supabase, used only by the tests. It speaks just enough of the two Supabase web interfaces the app uses:
//   /auth/v1/...   sign-in with a password, and "who owns this token?"
//   /rest/v1/...   reading and writing the tables (select / insert / update / upsert, with the filters the app uses)
// It is NOT the real thing: it proves the app asks Supabase the right questions, not that your Supabase project is set up right.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const makeJwt = (sub, email, ttl = 3600) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + ttl })}.fakesig`;

export async function startFakeSupabase({ publishableKey = 'sb_publishable_test', secretKey = 'sb_secret_test' } = {}) {
  const state = { users: [], tables: { profiles: [], plans: [], plan_revisions: [], ai_usage: [], alerts: [], kb_entries: [], incident_reports: [], protection_checklists: [], protection_observations: [] }, requests: [], failTable: null };
  let identity = 1;
  const defaults = {
    plans: () => ({ id: randomUUID(), current_revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), title: 'Untitled plan' }),
    plan_revisions: () => ({ id: randomUUID(), created_at: new Date().toISOString() }),
    ai_usage: () => ({ id: identity++, used_at: new Date().toISOString() }),
    kb_entries: () => ({ id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null, client_key: null }),
    incident_reports: () => ({ id: randomUUID(), status: 'preliminary', full_report: null, client_key: null, completed_at: null, kb_entry_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    protection_checklists: () => ({ id: randomUUID(), status: 'draft', approved_at: null, archived_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    protection_observations: () => ({ id: randomUUID(), created_at: new Date().toISOString(), client_key: null }),
    alerts: () => ({ id: randomUUID(), status: 'open', created_at: new Date().toISOString(), acknowledged_at: null }),
    profiles: () => ({ created_at: new Date().toISOString() }),
  };

  // Mimics the sign-up trigger from setup.sql: first user is the approved safety admin, everyone else starts unapproved.
  const addUser = (email, password, { role, approved, displayName } = {}) => {
    const user = { id: randomUUID(), email, password };
    state.users.push(user);
    const first = state.tables.profiles.length === 0;
    state.tables.profiles.push({ id: user.id, email, display_name: displayName || email.split('@')[0], role: role || (first ? 'safety' : 'foreman'), approved: approved ?? first, created_at: new Date().toISOString() });
    return user;
  };

  const userFromAuth = (req) => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ''); if (!m) return null;
    try {
      const payload = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString());
      if (payload.exp * 1000 < Date.now()) return null;
      return state.users.find((u) => u.id === payload.sub) || null;
    } catch { return null; }
  };

  const cmp = (row, col, op, raw) => {
    const v = row[col]; const num = (x) => (typeof v === 'number' ? Number(x) : x);
    switch (op) {
      case 'eq': return String(v) === raw;
      case 'is': return raw === 'null' ? v === null || v === undefined : String(v) === raw;
      case 'gte': return v >= num(raw);
      case 'gt': return v > num(raw);
      case 'in': return raw.replace(/^\(|\)$/g, '').split(',').includes(String(v));
      default: throw new Error('fake supabase: unsupported filter ' + op);
    }
  };
  const filters = (sp) => { const out = []; for (const [k, val] of sp) { if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue; const i = val.indexOf('.'); out.push([k, val.slice(0, i), val.slice(i + 1)]); } return out; };
  const pick = (row, select) => { if (!select || select === '*') return row; const cols = select.split(','); return Object.fromEntries(cols.map((c) => [c, row[c]])); };

  const rest = (req, res, url, body) => {
    const apikey = req.headers.apikey;
    if (apikey !== secretKey) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ message: 'Invalid API key', hint: 'only the secret key is accepted here in the fake' })); }
    const table = url.pathname.replace('/rest/v1/', '');
    state.requests.push({ method: req.method, table, search: url.search });
    const err = (status, code, message) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code, message, details: null, hint: null })); };
    if (!(table in state.tables) || state.failTable === table) return err(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);
    const rows = state.tables[table];
    const sp = url.searchParams; const fs = filters(sp); const select = sp.get('select');
    const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || '');
    const respond = (status, list) => {
      const headers = { 'content-type': 'application/json', 'content-range': `0-${Math.max(list.length - 1, 0)}/${list.length}` };
      if (wantsObject) {
        if (list.length !== 1) return err(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
        res.writeHead(status, headers); return res.end(JSON.stringify(list[0]));
      }
      res.writeHead(status, headers); res.end(req.method === 'HEAD' ? '' : JSON.stringify(list));
    };
    const matching = () => rows.filter((r) => fs.every(([c, op, raw]) => cmp(r, c, op, raw)));

    if (req.method === 'GET' || req.method === 'HEAD') {
      let list = matching();
      const order = sp.get('order'); if (order) { const [c, dir] = order.split('.'); list = [...list].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
      const limit = sp.get('limit'); if (limit) list = list.slice(0, Number(limit));
      const total = list.length;
      if (req.method === 'HEAD') { res.writeHead(200, { 'content-range': `0-${Math.max(total - 1, 0)}/${total}` }); return res.end(); }
      return respond(200, list.map((r) => pick(r, select)));
    }
    if (req.method === 'POST') {
      const incoming = [].concat(JSON.parse(body || '{}'));
      const onConflict = sp.get('on_conflict'); const merge = /merge-duplicates/.test(req.headers.prefer || '');
      const out = [];
      for (const item of incoming) {
        if (table === 'plans' && !state.tables.profiles.find((p) => p.id === item.created_by)) return err(409, '23503', 'foreign key violation');
        if (onConflict && merge) {
          const keys = onConflict.split(',');
          const existing = rows.find((r) => keys.every((k) => String(r[k]) === String(item[k])));
          if (existing) { Object.assign(existing, item); out.push(existing); continue; }
        }
        const row = { ...defaults[table](), ...item }; rows.push(row); out.push(row);
      }
      if (!/return=representation/.test(req.headers.prefer || '')) { res.writeHead(201); return res.end(); }
      return respond(201, out.map((r) => pick(r, select)));
    }
    if (req.method === 'PATCH') {
      const patch = JSON.parse(body || '{}'); const list = matching(); list.forEach((r) => Object.assign(r, patch));
      if (!/return=representation/.test(req.headers.prefer || '')) { res.writeHead(204); return res.end(); }
      return respond(200, list.map((r) => pick(r, select)));
    }
    return err(405, 'X', 'unsupported in fake');
  };

  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      res.setHeader('access-control-allow-origin', req.headers.origin || '*'); res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || '*'); res.setHeader('access-control-allow-methods', '*');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const { email, password } = JSON.parse(body || '{}');
        const user = state.users.find((u) => u.email === email && u.password === password);
        if (!user) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })); }
        const access_token = makeJwt(user.id, user.email);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ access_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rt_' + user.id, user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }));
      }
      if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
        const user = userFromAuth(req);
        if (!user) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' })); }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }));
      }
      if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
      if (url.pathname.startsWith('/rest/v1/')) return rest(req, res, url, body);
      res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'fake: no route ' + url.pathname }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, publishableKey, secretKey, state, addUser, close: () => new Promise((r) => server.close(r)) };
}
