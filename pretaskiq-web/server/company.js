// Company separation. Every table that holds a company's data has a company_id. Handlers get `me.db` (from requireUser), a wrapper that
// adds "this company only" to every read and update, and stamps the company on every insert, so a handler cannot forget it.
import { randomInt } from 'node:crypto';

export const COMPANY_TABLES = ['plans', 'plan_revisions', 'alerts', 'kb_entries', 'incident_reports', 'protection_checklists', 'protection_observations', 'audit_templates', 'audits', 'jobs', 'job_scopes', 'job_documents'];

export function companyDb(admin, companyId) {
  if (!companyId) throw new Error('companyDb needs a company id');
  const stamp = (rows) => (Array.isArray(rows) ? rows.map((r) => ({ ...r, company_id: companyId })) : { ...rows, company_id: companyId });
  return {
    companyId,
    from(table) {
      if (!COMPANY_TABLES.includes(table)) throw new Error(`"${table}" is not a company table; use the admin client deliberately for it`);
      const t = admin.from(table);
      return {
        select: (...a) => t.select(...a).eq('company_id', companyId),
        insert: (rows, ...a) => t.insert(stamp(rows), ...a),
        upsert: (rows, ...a) => t.upsert(stamp(rows), ...a),
        update: (vals, ...a) => t.update(vals, ...a).eq('company_id', companyId),
        delete: (...a) => t.delete(...a).eq('company_id', companyId),
      };
    },
  };
}

// A temporary password for a newly created account (no look-alike characters).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const tempPassword = (n = 14) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
