// Who am I? Returns the signed-in person's profile and role, and their company's license (name, tier, what it includes, whether it is active).
import { requireUser } from '../auth.js';
import { send, handle } from '../http.js';
import { TIERS } from '../../src/shared/licensing.js';

export default handle(async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method_not_allowed' }); }
  const { user, profile, company, features, isOwner } = await requireUser(req, { allowInactive: true });
  return send(res, 200, {
    user: { id: user.id, email: user.email || profile.email || null },
    profile: { role: profile.role, displayName: profile.display_name || null, isOwner },
    company: { name: company.name, tier: company.tier, tierLabel: (TIERS[company.tier] || {}).label || company.tier, status: company.status, features: company.status === 'active' ? features : [] },
  });
});
