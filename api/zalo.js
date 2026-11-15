// HOANTUYET - Gop 4 API Zalo thanh 1 Vercel Function.
// Giu nguyen 4 dia chi public thong qua rewrites trong vercel.json.
// Moi handler goc duoc tai rieng de tranh anh huong cheo.

const actions = Object.freeze({
  callback: () => import('../lib/zalo/callback.js'),
  'get-token': () => import('../lib/zalo/get-token.js'),
  send: () => import('../lib/zalo/send.js'),
  webhook: () => import('../lib/zalo/webhook.js')
});

export default async function handler(req, res) {
  const routeValue = req.query?.__zalo_action;
  const action = typeof routeValue === 'string' ? routeValue : '';
  if (!Object.prototype.hasOwnProperty.call(actions, action)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ ok: false, error: 'Zalo endpoint not found' });
  }

  try {
    const mod = await actions[action]();
    return await mod.default(req, res);
  } catch (error) {
    console.error('ZALO ROUTER ERROR:', action, error);
    if (res.headersSent) return;
    return res.status(500).json({ ok: false, error: 'Zalo server error' });
  }
}
