// Job folders: what a job's documents can be, and how expiry is judged. Shared by the server and the screens.
export const CATEGORIES = {
  scope:    { label: 'Scope documents', one: 'Scope document', statuses: ['current', 'superseded'], hasNumber: false },
  rfi:      { label: 'RFIs',            one: 'RFI',            statuses: ['open', 'answered', 'closed'], hasNumber: true },
  revision: { label: 'Revisions',       one: 'Drawing revision', statuses: ['current', 'superseded'], hasNumber: true },
  permit:   { label: 'Permits',         one: 'Permit',         statuses: ['active', 'closed'], hasNumber: true, hasExpiry: true },
  ticket811:{ label: '811 tickets',     one: '811 ticket',     statuses: ['active', 'closed'], hasNumber: true, hasExpiry: true },
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES);
export const defaultStatus = (category) => CATEGORIES[category].statuses[0];

export const FILE_TYPES = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };
export const MAX_FILE_BYTES = 15 * 1024 * 1024;       // per file (Supabase's free plan allows up to 50 MB; this keeps uploads quick on a phone)
export const SOON_DAYS = 7;                            // "expiring soon" window; change here if you want a longer or shorter warning

// 'YYYY-MM-DD' is a real calendar date?
export function isDateString(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// 'expired' (the date has passed), 'soon' (within SOON_DAYS), or null. `today` is 'YYYY-MM-DD' (the caller's calendar day).
export function expiryStatus(expiresOn, today, soonDays = SOON_DAYS) {
  if (!expiresOn || !isDateString(expiresOn) || !isDateString(today)) return null;
  if (expiresOn < today) return 'expired';
  const days = Math.round((new Date(expiresOn + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
  return days <= soonDays ? 'soon' : null;
}
