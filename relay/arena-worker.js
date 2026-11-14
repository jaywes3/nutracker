// OpenPhase Arena relay for Cloudflare Workers. Configure ALLOWED_ORIGIN as described in ARENA-SETUP.md.
// The client supplies its own Arena key on each request; this worker does not store keys or prompts.
const UPSTREAM = 'https://api.arena.ai/v1/chat/completions';
const MAX_BYTES = 8 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGIN || '').trim().replace(/\/$/, '');
    const cors = { 'Access-Control-Allow-Origin': allowed, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Cache-Control': 'no-store' };
    const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (request.method === 'GET') return new Response('OpenPhase Arena relay is running.', {headers: {'Cache-Control': 'no-store'}});
    if (!allowed || !origin || origin !== allowed) return new Response('Origin not allowed. Configure ALLOWED_ORIGIN.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json(405, { error: 'Only POST is supported.' });
    const auth = request.headers.get('Authorization') || '';
    if (!/^Bearer [^\s]{1,2048}$/.test(auth)) return json(401, { error: 'Enter your Arena API key in OpenPhase.' });
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BYTES) return json(413, {error:'Photo or request is too large; try a smaller photo.'});
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > MAX_BYTES) return json(413, {error:'Photo or request is too large; try a smaller photo.'});
      const body = JSON.parse(raw);
      if (!body || typeof body.model !== 'string' || body.model.length > 150 || !/^[a-zA-Z0-9._\/-]+$/.test(body.model) || !Array.isArray(body.messages) || body.messages.length !== 1 || body.messages[0]?.role !== 'user' || !Array.isArray(body.messages[0]?.content) || body.messages[0].content.length > 2) return json(400, {error:'Invalid Arena request.'});
      const res = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: body.model, messages: body.messages, max_tokens: 2048 }),
        signal: AbortSignal.timeout(90000),
      });
      const result = await res.text();
      return new Response(result, { status: res.status, headers: {...cors, 'Content-Type': 'application/json'} });
    } catch (error) {
      if (error instanceof SyntaxError) return json(400, {error:'Invalid request JSON.'});
      return json(502, {error:'Could not reach Arena. Please try again.'});
    }
  }
};
