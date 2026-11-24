// Customizable safety audits: a template is a list of items; an audit answers each item Pass / Fail / N/A.
// Rules enforced here (and again by the server): every item is answered, and a Fail needs a comment. Photos are small JPEGs, capped in number and size.
// Score = passed / (passed + failed). N/A items are left out. (Assumption: confirm with the safety team that this is how they want N/A handled.)
export const MAX_ITEMS = 60;
export const MAX_PHOTOS_PER_ITEM = 4;
export const MAX_PHOTOS_PER_AUDIT = 16;
export const MAX_PHOTO_CHARS = 160_000;          // about 120 KB of picture after base64
export const MIN_FAIL_COMMENT = 3;
export const RESULTS = ['pass', 'fail', 'na'];

const s = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
const photoOk = (p) => typeof p === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p) && p.length <= MAX_PHOTO_CHARS;

// A template is { title, description, items: [{ text, section? }] }. An item's id comes from its wording, so reordering keeps ids and results stay comparable.
export function cleanTemplate(input) {
  const seen = new Set(); const items = [];
  (Array.isArray(input && input.items) ? input.items : []).forEach((it) => {
    const text = s(it && it.text, 300); if (!text) return;
    let id = 'a' + hash(text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()); while (seen.has(id)) id += '_'; seen.add(id);
    items.push({ id, text, section: s(it.section, 60) });
  });
  return { title: s(input && input.title, 100), description: s(input && input.description, 300), items: items.slice(0, MAX_ITEMS) };
}

// Checks answers against a template. Returns { answers (cleaned), missing: [text], ok, score, counts }. Never throws.
export function checkAudit(template, rawAnswers) {
  const items = (template && Array.isArray(template.items)) ? template.items : [];
  const byId = new Map((Array.isArray(rawAnswers) ? rawAnswers : []).map((a) => [a && a.id, a]));
  const answers = []; const missing = []; let photosTotal = 0;
  items.forEach((it, i) => {
    const a = byId.get(it.id) || {}; const result = RESULTS.includes(a.result) ? a.result : '';
    const comment = s(a.comment, 600);
    const photos = (Array.isArray(a.photos) ? a.photos : []).filter(photoOk).slice(0, MAX_PHOTOS_PER_ITEM);
    photosTotal += photos.length;
    if (!result) missing.push('Item ' + (i + 1) + ' has no answer: ' + it.text);
    else if (result === 'fail' && comment.length < MIN_FAIL_COMMENT) missing.push('Item ' + (i + 1) + ' failed and needs a comment: ' + it.text);
    answers.push({ id: it.id, text: it.text, section: it.section || '', result, comment, photos });
  });
  if (photosTotal > MAX_PHOTOS_PER_AUDIT) missing.push('Too many photos (' + photosTotal + '). The limit is ' + MAX_PHOTOS_PER_AUDIT + ' per audit.');
  const pass = answers.filter((a) => a.result === 'pass').length, fail = answers.filter((a) => a.result === 'fail').length, na = answers.filter((a) => a.result === 'na').length;
  const score = pass + fail > 0 ? Math.round((pass / (pass + fail)) * 1000) / 10 : null;
  return { answers, missing, ok: missing.length === 0 && items.length > 0, score, counts: { pass, fail, na, total: items.length }, photos: photosTotal };
}
