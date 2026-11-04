// Honte (本手) · in-browser KataGo engine adapter (no server needed) — English messages.
// Uses katago-web's (MIT) KataGoEngineClient: TF.js reads the .bin.gz weights directly.
// Models load from katago/models/; if the standard b10 file isn't in this repo, it is fetched from the Honte-Benshou site instead.
(function () {
  const BASE = new URL('.', document.currentScript ? document.currentScript.src : location.href).href;
  const MODELS = [
    { id: 'b10', label: 'Standard b10', file: 'kata1-b10c128.bin.gz', fallback: 'https://connorxwolf.github.io/Honte-Benshou/katago/models/kata1-b10c128.bin.gz' },
    { id: 'b6', label: 'Light b6c96 (fast, works on phones)', url: 'https://huggingface.co/ConnerXwolf/katago_b6/resolve/main/kata1-b6c96-s175395328-d26788732.txt.gz' },
    { id: 'b40', label: 'Strong b40c256 (~170 MB, desktop WebGPU only, slow)', url: 'https://huggingface.co/ConnerXwolf/katago-models/resolve/main/kata1-b40c256-s11385575424-d2784196062.bin.gz', heavy: true },
    { id: 'custom', label: 'Custom model URL (.bin.gz or .txt.gz)', file: '' }
  ];
  const LIB = BASE + 'lib/katago-web.js';
  let lib = null, client = null, loadedKey = '', loadedUrl = '', loading = null, accel = '';

  async function getLib() {
    if (lib) return lib;
    try { lib = await import(LIB); } catch (e) { throw new Error('Failed to load the KataGo library: ' + e.message + '. Check that katago/lib/katago-web.js exists.'); }
    if (!lib.KataGoEngineClient) throw new Error('KataGoEngineClient not found in katago-web.js — rebuild the library with build-legacy.mjs.');
    return lib;
  }
  function modelUrl(id, custom) {
    if (id === 'custom') { if (!custom) throw new Error('Enter a custom model URL.'); return new URL(custom, location.href).href; }
    const m = MODELS.find(x => x.id === id) || MODELS[0];
    return m.url || BASE + 'models/' + m.file;
  }
  async function check(url, what) {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
    if (!r || !r.ok) throw new Error('Missing ' + what + ' (HTTP ' + (r ? r.status : 'network error') + '): ' + url);
    return +r.headers.get('content-length') || 0;
  }

  async function load(id, custom, onProgress, onStatus) {
    let url = modelUrl(id, custom); const key = url;
    if (client && loadedKey === key) return client;
    if (loading && loading.key === key) return loading.p;
    const say = t => { if (onStatus) try { onStatus(t); } catch (e) {} };
    const p = (async () => {
      const L = await getLib();
      await check(BASE + 'lib/worker.js', 'katago/lib/worker.js');
      const mm = MODELS.find(x => x.id === id) || {};
      const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if (mm.heavy && (!navigator.gpu || mobile)) throw new Error('b40c256 needs WebGPU in a desktop browser (Chrome / Edge). On phones or browsers without WebGPU, use b10 or b6.');
      if (!mm.url) { try { await check(url, 'model file'); } catch (e) { if (!mm.fallback) throw e; url = mm.fallback; say('Model not in this repo — loading it from ' + new URL(url).host + '…'); } }
      const tries = mm.heavy ? ['webgpu'] : navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
      let lastErr;
      for (const a of tries) {
        if (client) { try { client.dispose(); } catch (e) {} }
        client = null; loadedKey = '';
        const c = new L.KataGoEngineClient();
        const off = c.onLoadProgress ? c.onLoadProgress(pr => {
          const f = pr && (pr.fraction ?? pr.progress);
          if (f != null && onProgress) try { onProgress(f); } catch (e) {}
          say('Loading model (' + a + ')' + (pr && pr.stage ? ': ' + pr.stage : '') + (f != null ? ' ' + Math.round(f * 100) + '%' : '') + '…');
        }) : null;
        say('Starting engine (' + a + ')…');
        let tm;
        try {
          await Promise.race([c.init(url, a), new Promise((_, rej) => { tm = setTimeout(() => rej(new Error(a + ' start-up timed out')), mm.heavy ? 600000 : 180000); })]);
          clearTimeout(tm); off && off();
          client = c; accel = (c.getEngineInfo && c.getEngineInfo().backend) || a; loadedKey = key; loadedUrl = url;
          say('Engine ready (' + accel + ')'); return c;
        } catch (e) {
          clearTimeout(tm); off && off(); lastErr = e;
          console.warn('[Honte KataGo] ' + a + ' failed:', e);
          try { c.dispose(); } catch (x) {}
        }
      }
      throw new Error((lastErr && lastErr.message) || String(lastErr));
    })();
    loading = { key, p };
    try { return await p; } finally { loading = null; }
  }

  // board: N×N array ([y][x], y=0 is the top row) of 'black' / 'white' / null; player: 'black' / 'white'
  async function analyze(q) {
    if (!client) throw new Error('The engine is not loaded yet.');
    const N = q.board.length;
    const board = q.board.map(r => r.map(v => (v === 'black' || v === 'white') ? v : null));
    const rk = String(q.rules || '').toLowerCase();
    const rules = /jap|日/.test(rk) ? 'japanese' : /kor|韓/.test(rk) ? 'korean' : 'chinese';
    const r = await client.analyze({
      modelUrl: loadedUrl, board, currentPlayer: q.player === 'white' ? 'white' : 'black',
      moveHistory: [], komi: q.komi ?? 7.5, rules,
      visits: Math.max(1, q.visits | 0 || 50), maxTimeMs: 60000, topK: 3, analysisPvLen: 1, ownershipMode: 'none'
    });
    const c = (r.moves || [])[0];
    let best = null;
    if (c) best = (c.x < 0 || c.y < 0 || c.x >= N || c.y >= N) ? 'PASS' : 'ABCDEFGHJKLMNOPQRST'[c.x] + (N - c.y);
    return { wr: Math.round(r.rootWinRate * 1000) / 10, lead: Math.round(r.rootScoreLead * 10) / 10, best };
  }

  window.WQKata = { MODELS, load, analyze, backend: () => accel || (navigator.gpu ? 'webgpu' : 'wasm'), loadedKey: () => loadedKey };
})();
