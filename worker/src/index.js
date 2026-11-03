const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    if (!env.CONTROL_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.CONTROL_TOKEN}`)
      return json({ error: 'Unauthorized' }, 401);

    const match = url.pathname.match(/^\/api\/devices\/([a-z0-9-]{1,48})\/state$/);
    if (!match) return json({ error: 'Unknown route' }, 404);
    const id = match[1];
    const configText = await env.OUTLET_KV.get(`device:${id}`);
    if (!configText) return json({ error: 'Device is not registered in KV' }, 404);
    const config = JSON.parse(configText);
    if (!config.url || !config.token) return json({ error: 'Device configuration is incomplete' }, 500);

    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }
      if (typeof body.on !== 'boolean') return json({ error: 'Field "on" must be boolean' }, 400);
      const response = await fetch(`${config.url.replace(/\/$/, '')}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Token': config.token },
        body: JSON.stringify({ on: body.on }),
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);
      if (!response?.ok) return json({ error: 'Device unreachable or rejected command' }, 502);
      const state = await response.json();
      await env.OUTLET_KV.put(`state:${id}`, JSON.stringify({ ...state, seenAt: new Date().toISOString() }), { expirationTtl: 86400 });
      return json(state);
    }

    if (request.method === 'GET') {
      const response = await fetch(`${config.url.replace(/\/$/, '')}/api/state`, {
        headers: { 'X-Device-Token': config.token }, signal: AbortSignal.timeout(5000)
      }).catch(() => null);
      if (response?.ok) {
        const state = await response.json();
        await env.OUTLET_KV.put(`state:${id}`, JSON.stringify({ ...state, seenAt: new Date().toISOString() }), { expirationTtl: 86400 });
        return json(state);
      }
      const cached = await env.OUTLET_KV.get(`state:${id}`);
      return cached ? json({ ...JSON.parse(cached), stale: true }) : json({ error: 'Device unreachable; no cached state' }, 502);
    }
    return json({ error: 'Method not allowed' }, 405);
  }
};
