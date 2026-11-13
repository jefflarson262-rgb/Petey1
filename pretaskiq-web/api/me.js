// Who am I? Returns the signed-in person's profile and role.
import { requireUser } from '../server/auth.js';
import { send, handle } from '../server/http.js';

export default handle(async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { user, profile } = await requireUser(req);
  return send(res, 200, { user: { id: user.id, email: user.email || profile.email || null }, profile: { role: profile.role, displayName: profile.display_name || null } });
});
