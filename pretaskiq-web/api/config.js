// Tells the browser how people sign in on this site. Public: it only returns values that are safe to show.
import { readConfig, publicConfig } from '../server/config.js';
import { send, handle } from '../server/http.js';

export default handle(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return send(res, 405, { error: 'method_not_allowed' }); }
  return send(res, 200, publicConfig(readConfig()));
});
