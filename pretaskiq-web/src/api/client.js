import { clearStoredCode, getStoredCode, requestAccessCode, storeCode } from './accessCode.js';

// Where the prototype sends its AI requests. Default: our own serverless function on the same site.
export const API_URL = import.meta.env.VITE_API_URL || '/api/claude';

const sameUrl = (a, b) => new URL(a, location.href).href === new URL(b, location.href).href;

// The prototype prints "API error <status>: <body>" in the chat when a request fails. For a missing or wrong access
// code, swap the raw server reply for a sentence a foreman can act on.
const codeProblem = (wrong) => new Response(
  wrong ? 'That access code was not accepted. Send your message again to try another code.'
        : 'An access code is needed for live AI answers. Send your message again to enter it.',
  { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });

// The prototype's scripts call fetch() directly (they read window.PRETASKIQ_API_URL). Rather than edit all five call
// sites, wrap fetch once: requests to the proxy carry the access code, and a 401 on a POST opens the code dialog once and retries.
export function installApiClient() {
  window.PRETASKIQ_API_URL = API_URL;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!sameUrl(url, API_URL)) return nativeFetch(input, init);

    const method = (init.method || 'GET').toUpperCase();
    const send = (code) => {
      const headers = new Headers(init.headers || {});
      if (code) headers.set('x-access-code', code);
      return nativeFetch(input, { ...init, headers });
    };

    let response = await send(getStoredCode());
    if (response.status === 401 && method === 'POST') {
      const stored = getStoredCode();
      if (stored) clearStoredCode();                       // the saved code stopped working
      const code = await requestAccessCode({ wrong: Boolean(stored) });
      if (!code) return codeProblem(false);                // cancelled
      response = await send(code);
      if (response.status === 401) return codeProblem(true); // typed a wrong code
      storeCode(code);
    }
    return response;
  };
}
