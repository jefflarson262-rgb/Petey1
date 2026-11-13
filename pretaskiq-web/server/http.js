// Small helpers shared by the serverless functions in /api. Plain Node request/response objects, no framework.

export class HttpError extends Error {
  constructor(status, error, extra = {}) {
    super(error);
    this.status = status;
    this.error = error;
    this.extra = extra;
  }
}

export const send = (res, status, body, headers = {}) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
};

const MAX_BODY_CHARS = 3_500_000; // Vercel refuses bodies over roughly 4.5 MB before our code runs

export async function readJson(req) {
  if (req.body !== undefined) {              // Vercel has already parsed it
    try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new HttpError(400, 'invalid_json'); }
  }
  let text = '';                                                    // plain Node (dev server, tests): read the stream
  for await (const chunk of req) {
    text += chunk;
    if (text.length > MAX_BODY_CHARS) throw new HttpError(413, 'request_too_large');
  }
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'invalid_json'); }
}

// Wraps a handler so an HttpError becomes a clean JSON reply and anything unexpected becomes a generic 500
// (details go to the server log, never to the browser).
export const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.error, ...e.extra });
    if (process.env.NODE_ENV !== 'test') console.error('[api] unexpected error:', e && e.message);
    return send(res, 500, { error: 'server_error' });
  }
};
