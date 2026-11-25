// Company administration (safety administrators): see the team and the seats used, add a person, switch a person off or on.
//   GET  /api/company                                  the company, seats used, and its people
//   POST /api/company { action:'add_member', email, displayName, role }   creates the account (with a temporary password shown once)
//   POST /api/company { action:'set_active', id, active }                 turns a person's access off or on
import { requireUser, ROLES } from '../auth.js';
import { HttpError, send, handle, readJson } from '../http.js';
import { dbError } from '../supabase.js';
import { tempPassword, EMAIL_RE } from '../company.js';

const MEMBER = 'id,email,display_name,role,approved,created_at';
const shape = (p) => ({ id: p.id, email: p.email, displayName: p.display_name, role: p.role, active: !!p.approved, createdAt: p.created_at });

async function seats(admin, companyId) {
  const { data, error } = await admin.from('profiles').select('id').eq('company_id', companyId).eq('approved', true).limit(5000);
  if (error) throw dbError(error);
  return (data || []).length;
}

// Shared with api/owner.js: creates a sign-in account and attaches it to a company. Returns { member, temporaryPassword }.
export async function createMember(admin, companyId, { email, displayName, role }, seatLimit = null) {
  const addr = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(addr) || addr.length > 200) throw new HttpError(400, 'invalid_email');
  if (!ROLES.includes(role)) throw new HttpError(400, 'invalid_role');
  if (seatLimit != null && (await seats(admin, companyId)) >= seatLimit) throw new HttpError(409, 'seat_limit_reached', { seatLimit });
  const name = String(displayName || '').trim().slice(0, 120) || addr.split('@')[0];
  const password = tempPassword();
  const { data, error } = await admin.auth.admin.createUser({ email: addr, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error || !data || !data.user) {
    if (error && /already|registered|exists/i.test(String(error.message || ''))) throw new HttpError(409, 'email_in_use');
    throw new HttpError(502, 'account_create_failed');
  }
  const uid = data.user.id;
  const fields = { company_id: companyId, role, approved: true, display_name: name, email: addr, is_owner: false };
  const { data: updated, error: ue } = await admin.from('profiles').update(fields).eq('id', uid).select(MEMBER);
  if (ue) throw dbError(ue);
  let row = (updated || [])[0];
  if (!row) {                                   // the sign-up trigger did not create a profile; create it
    const { data: ins, error: ie } = await admin.from('profiles').insert({ id: uid, ...fields }).select(MEMBER);
    if (ie) throw dbError(ie);
    row = (ins || [])[0];
  }
  return { member: shape(row), temporaryPassword: password };
}

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req, { roles: ['safety'] });
  const { admin, company } = me;

  if (method === 'GET') {
    const { data, error } = await admin.from('profiles').select(MEMBER).eq('company_id', company.id).order('created_at', { ascending: true }).limit(1000);
    if (error) throw dbError(error);
    const members = (data || []).map(shape);
    return send(res, 200, { company: { name: company.name, tier: company.tier, status: company.status, seatLimit: company.seat_limit }, seatsUsed: members.filter((m) => m.active).length, members });
  }

  const body = await readJson(req);
  if (body.action === 'add_member') {
    return send(res, 201, await createMember(admin, company.id, body, company.seat_limit));
  }
  if (body.action === 'set_active') {
    const { data: target, error } = await admin.from('profiles').select(MEMBER).eq('id', String(body.id || '')).eq('company_id', company.id).maybeSingle();
    if (error) throw dbError(error);
    if (!target) throw new HttpError(404, 'not_found');
    const active = body.active === true;
    if (target.id === me.user.id && !active) throw new HttpError(400, 'cannot_deactivate_self');
    if (active && !target.approved && company.seat_limit != null && (await seats(admin, company.id)) >= company.seat_limit) throw new HttpError(409, 'seat_limit_reached', { seatLimit: company.seat_limit });
    const { data: after, error: ue } = await admin.from('profiles').update({ approved: active }).eq('id', target.id).eq('company_id', company.id).select(MEMBER).single();
    if (ue) throw dbError(ue);
    return send(res, 200, { member: shape(after) });
  }
  throw new HttpError(400, 'unknown_action');
});
