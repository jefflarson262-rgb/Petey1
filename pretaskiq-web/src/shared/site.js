// Public-site settings.
// CONTACT_EMAIL: where the landing page's "Request a Demo" button sends email. While it is empty the button is not shown.
// It can also be set on the host as VITE_CONTACT_EMAIL (it is public either way: anyone can read it on the page).
export const CONTACT_EMAIL = (import.meta.env && import.meta.env.VITE_CONTACT_EMAIL) || '';
export const demoMailto = (email = CONTACT_EMAIL) => (email
  ? `mailto:${email}?subject=${encodeURIComponent('PreTaskIQ demo request')}&body=${encodeURIComponent('Company:\nYour name:\nTrade or type of work:\nRoughly how many crews:\n\nWhat would you like to see?\n')}`
  : '');
