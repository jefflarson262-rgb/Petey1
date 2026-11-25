// Platform owner tools (only the account flagged is_owner): create a company with its first administrator, change its tier, seats or status.
//   GET  /api/owner                                                      every company with seats used
//   POST /api/owner { action:'create_company', name, tier, seatLimit, admin:{ email, displayName } }
//   POST /api/owner { action:'update_company', id, tier?, seatLimit?, status? }
import { requireUser } from '../server/auth.js';
import { HttpError, send, handle, readJson } from '../server/http.js';
import { dbError } from '../server/supabase.js';
import { isTier, COMPANY_STATUSES, TIERS } from '../src/shared/licensing.js';
import { createMember } from './company.js';

const COLS = 'id,name,tier,seat_limit,status,created_at';
const shape = (c, used = 0) => ({ id: c.id, name: c.name, tier: c.tier, tierLabel: (TIERS[c.tier] || {}).label || c.tier, seatLimit: c.seat_limit, status: c.status, seatsUsed: used, createdAt: c.created_at });
const seatLimitOf = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 100000) throw new HttpError(400, 'invalid_seat_limit');
  return n;
};

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req, { allowInactive: true });
  if (!me.isOwner) throw new HttpError(403, 'owner_only');
  const { admin } = me;

  if (method === 'GET') {
    const { data: cs, error } = await admin.from('companies').select(COLS).order('created_at', { ascending: true }).limit(1000);
    if (error) throw dbError(error);
    const { data: ps, error: pe } = await admin.from('profiles').select('company_id,approved').eq('approved', true).limit(100000);
    if (pe) throw dbError(pe);
    const used = {}; for (const p of ps || []) used[p.company_id] = (used[p.company_id] || 0) + 1;
    return send(res, 200, { companies: (cs || []).map((c) => shape(c, used[c.id] || 0)) });
  }

  const body = await readJson(req);
  if (body.action === 'create_company') {
    const name = String(body.name || '').trim().slice(0, 120);
    if (!name) throw new HttpError(400, 'name_required');
    if (!isTier(body.tier)) throw new HttpError(400, 'invalid_tier');
    const seatLimit = seatLimitOf(body.seatLimit);
    if (!body.admin || !body.admin.email) throw new HttpError(400, 'admin_required');
    const { data: company, error } = await admin.from('companies').insert({ name, tier: body.tier, seat_limit: seatLimit }).select(COLS).single();
    if (error) throw dbError(error);
    try {
      const out = await createMember(admin, company.id, { email: body.admin.email, displayName: body.admin.displayName, role: 'safety' });
      return send(res, 201, { company: shape(company, 1), admin: out.member, temporaryPassword: out.temporaryPassword });
    } catch (e) {
      await admin.from('companies').delete().eq('id', company.id);       // do not leave a company with no administrator
      throw e;
    }
  }
  if (body.action === 'update_company') {
    const patch = {};
    if (body.tier !== undefined) { if (!isTier(body.tier)) throw new HttpError(400, 'invalid_tier'); patch.tier = body.tier; }
    if (body.seatLimit !== undefined) patch.seat_limit = seatLimitOf(body.seatLimit);
    if (body.status !== undefined) { if (!COMPANY_STATUSES.includes(body.status)) throw new HttpError(400, 'invalid_status'); patch.status = body.status; }
    if (body.name !== undefined) { const n = String(body.name).trim().slice(0, 120); if (!n) throw new HttpError(400, 'name_required'); patch.name = n; }
    if (!Object.keys(patch).length) throw new HttpError(400, 'nothing_to_update');
    if (patch.status === 'suspended' && String(body.id) === me.company.id) throw new HttpError(400, 'cannot_suspend_own_company');
    const { data, error } = await admin.from('companies').update(patch).eq('id', String(body.id || '')).select(COLS);
    if (error) throw dbError(error);
    if (!data || !data[0]) throw new HttpError(404, 'not_found');
    return send(res, 200, { company: shape(data[0]) });
  }
  throw new HttpError(400, 'unknown_action');
});
