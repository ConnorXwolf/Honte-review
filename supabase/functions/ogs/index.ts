// Honte · OGS proxy (Supabase Edge Function, name: ogs) — OPTIONAL.
// The English review page calls online-go.com directly from the browser. Only if that request is
// blocked (a strict network, an extension) does it retry through this function.
// Deploy: Supabase → Edge Functions → New function "ogs" → paste this file → Deploy,
// then turn OFF "Verify JWT" for the function.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const ALLOWED = /^\/api\/v1\/(players\/(\?[^#]*|\d+\/(games\/(\?[^#]*)?)?)|games\/\d+\/sgf)$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return new Response(JSON.stringify({ ok: true, msg: 'Honte ogs function is deployed' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const { path } = await req.json();
    if (typeof path !== 'string' || !ALLOWED.test(path)) return new Response(JSON.stringify({ error: 'path not allowed' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 10000);
    const r = await fetch('https://online-go.com' + path, { signal: ac.signal, headers: { 'User-Agent': 'Honte-Review/1.0 (+https://github.com/ConnorXwolf/Honte-Benshou)', Accept: path.endsWith('/sgf') ? 'application/x-go-sgf, text/plain' : 'application/json' } });
    clearTimeout(t);
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { ...CORS, 'Content-Type': path.endsWith('/sgf') ? 'text/plain; charset=utf-8' : 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
