// Honte Review — data layer.
// window.WQBoot(mode) returns the API the review component uses:
//   'cloud' — Supabase: accounts are created from an OGS player and signed into with a 12-character code
//   'demo'  — sample data, nothing is saved
// window.WQOgs.call({ action: 'user' | 'list' | 'sgf', ... }) talks to OGS (online-go.com).
(function () {
  const OGS = 'https://online-go.com';
  const EMAIL_DOMAIN = '@code.honte-review.app';
  const cfg = () => window.WQ_CONFIG || {};
  const sbBase = () => String(cfg().url || '').trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
  const configured = () => { const u = cfg().url; return !!(u && !/YOUR-PROJECT/.test(u) && cfg().anonKey); };
  const hasCloud = () => configured() && !!window.supabase;

  // ── OGS ──────────────────────────────────────────────────────────────
  // OGS's REST API normally allows browser requests (CORS). If a browser or network blocks it,
  // the request is retried through the optional Supabase Edge Function "ogs" (supabase/functions/ogs).
  async function viaProxy(path, text) {
    if (!configured()) throw new Error("Can't reach OGS from this browser, and no Supabase proxy is configured.");
    const key = String(cfg().anonKey).trim();
    const r = await fetch(sbBase() + '/functions/v1/ogs', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key }, body: JSON.stringify({ path }) });
    if (r.status === 404) throw new Error("Can't reach OGS directly, and the Supabase function “ogs” is not deployed.");
    if (r.status === 401) throw new Error('The “ogs” function refused the request (401). Turn off “Verify JWT” for it in Supabase.');
    const t = await r.text();
    if (!r.ok) throw new Error('OGS proxy error (HTTP ' + r.status + '): ' + t.slice(0, 120));
    return text ? t : JSON.parse(t);
  }
  async function ogsGet(path, text) {
    let r;
    try { r = await fetch(OGS + path, { headers: { Accept: text ? 'application/x-go-sgf, text/plain, */*' : 'application/json' } }); }
    catch (e) { return viaProxy(path, text); }
    if (r.status === 404) { const err = new Error('Not found on OGS.'); err.status = 404; throw err; }
    if (r.status === 429) throw new Error('OGS is rate-limiting requests. Wait a minute and try again.');
    if (r.status === 403) throw new Error('OGS refused access (HTTP 403). The game may be private.');
    if (!r.ok) throw new Error('OGS error (HTTP ' + r.status + ').');
    return text ? r.text() : r.json();
  }
  const rankStr = v => { const r = Math.floor(Number(v)); if (v == null || !isFinite(r)) return ''; return r < 30 ? (30 - r) + 'k' : (r - 29) + 'd'; };
  const dur = s => { s = Number(s) || 0; if (!s) return '0'; if (s % 86400 === 0) return s / 86400 + 'd'; if (s >= 3600 && s % 3600 === 0) return s / 3600 + 'h'; if (s >= 60) return Math.round(s / 60 * 10) / 10 + ' min'; return s + 's'; };
  function timeText(tc) {
    try { if (typeof tc === 'string') tc = JSON.parse(tc); } catch (e) { return ''; }
    if (!tc) return '';
    const sys = tc.system || tc.time_control;
    if (sys === 'byoyomi') return dur(tc.main_time) + ' + ' + (tc.periods || 0) + '×' + dur(tc.period_time);
    if (sys === 'fischer') return dur(tc.initial_time) + ' + ' + dur(tc.time_increment) + '/move';
    if (sys === 'canadian') return dur(tc.main_time) + ' + ' + dur(tc.period_time) + '/' + (tc.stones_per_period || '?') + ' stones';
    if (sys === 'simple') return dur(tc.per_move) + '/move';
    if (sys === 'absolute') return dur(tc.total_time) + ' total';
    if (sys === 'none') return 'No time limit';
    return '';
  }
  const pad = n => String(n).padStart(2, '0');
  const localIso = t => { const d = new Date(t); return isNaN(d) ? '' : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  function normGame(g) {
    const pl = g.players || {}, b = pl.black || {}, w = pl.white || {};
    const bl = !!g.black_lost, wl = !!g.white_lost;
    return { id: g.id, name: g.name || '', black: b.username || ('#' + (g.black || '?')), white: w.username || ('#' + (g.white || '?')),
      blackId: b.id || g.black, whiteId: w.id || g.white, blackRank: rankStr(b.ranking), whiteRank: rankStr(w.ranking),
      date: localIso(g.ended || g.started), size: g.width === g.height ? g.width : null, ranked: !!g.ranked, annulled: !!g.annulled,
      winner: bl && !wl ? 'W' : wl && !bl ? 'B' : '', outcome: g.outcome || '', rules: g.rules || '', komi: g.komi, handicap: g.handicap || 0,
      time: timeText(g.time_control_parameters) };
  }
  // Accepts a username, a numeric player ID (optionally "#123"), or a profile URL.
  async function findUser(input) {
    const name = String(input || '').trim();
    if (!name) return null;
    const m = /online-go\.com\/(?:player|user\/view)\/(\d+)/i.exec(name) || /^#?(\d+)$/.exec(name);
    if (m) { try { const p = await ogsGet('/api/v1/players/' + m[1] + '/'); return { id: p.id, username: p.username }; } catch (e) { if (e.status === 404) return null; throw e; } }
    const pick = d => { const r = (d && d.results) || []; return r.find(x => String(x.username).toLowerCase() === name.toLowerCase()) || null; };
    let hit = pick(await ogsGet('/api/v1/players/?username=' + encodeURIComponent(name)));
    if (!hit) hit = pick(await ogsGet('/api/v1/players/?username__istartswith=' + encodeURIComponent(name) + '&page_size=50').catch(() => null));
    return hit ? { id: hit.id, username: hit.username } : null;
  }
  const WQOgs = {
    async call(body) {
      if (body.action === 'user') return findUser(body.name);
      if (body.action === 'list') {
        const d = await ogsGet('/api/v1/players/' + encodeURIComponent(body.uid) + '/games/?ordering=-ended&page_size=50');
        return { games: ((d && d.results) || []).filter(g => g.ended).map(normGame).slice(0, 20) };
      }
      if (body.action === 'sgf') {
        const sgf = await ogsGet('/api/v1/games/' + encodeURIComponent(body.id) + '/sgf', true);
        if (!/\(\s*;/.test(sgf || '')) throw new Error('OGS did not return an SGF for this game.');
        return { sgf };
      }
      throw new Error('Unknown OGS action');
    },
    findUser, rankStr, normGame, timeText
  };
  window.WQOgs = WQOgs;

  // 12-character sign-in codes, no look-alike characters (0/O, 1/I/L).
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newCode() {
    const a = new Uint32Array(12); crypto.getRandomValues(a);
    return Array.from(a, n => ALPHA[n % ALPHA.length]).join('');
  }
  const cleanCode = c => String(c || '').replace(/[^0-9a-z]/gi, '').toUpperCase();
  const fmtCode = c => cleanCode(c).replace(/(.{4})(?=.)/g, '$1-');
  window.WQCode = { fmt: fmtCode, clean: cleanCode };

  // ── Cloud (Supabase) ────────────────────────────────────────────────
  // Tables: review_profiles (one row per account, linked OGS player) and review_games — see supabase/setup.sql.
  function CloudAPI() {
    const sb = window.WQSupabase || (window.WQSupabase = window.supabase.createClient(sbBase(), String(cfg().anonKey).trim()));
    const emailOf = c => cleanCode(c).toLowerCase() + EMAIL_DOMAIN;
    const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    const uid = async () => { const { data } = await sb.auth.getSession(); return data.session && data.session.user.id; };
    const toRow = (g, id) => { const ext = g.fox_id || null; const row = { user_id: id, ext_id: ext, played_on: g.played_on, info: g.info, points: g.points, sgf: g.sgf || null, updated_at: new Date().toISOString() }; if (g.id) row.id = g.id; return row; };
    const fromRow = r => r && Object.assign({}, r, { fox_id: r.ext_id || null });
    const api = {
      kind: 'cloud', demo: false,
      async current() {
        const id = await uid(); if (!id) return null;
        const { data, error } = await sb.from('review_profiles').select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      },
      async signIn(code) {
        const c = cleanCode(code);
        if (c.length !== 12) throw new Error('A sign-in code has 12 letters and numbers (XXXX-XXXX-XXXX).');
        const { error } = await sb.auth.signInWithPassword({ email: emailOf(c), password: c });
        if (error) throw new Error(/invalid login/i.test(error.message) ? 'No account found for that code.' : error.message);
        const p = await api.current();
        if (!p) throw new Error('This code has no Honte Review profile. Create a new code from your OGS ID.');
        return p;
      },
      // Creates an account with a fresh code and signs in. Returns { code, profile }.
      // With an OGS username / ID / URL the account is linked to that player; without one it starts unlinked.
      async createAccount(ogsInput) {
        let u = { id: null, username: null };
        if (ogsInput != null && String(ogsInput).trim()) {
          u = await findUser(ogsInput);
          if (!u || !u.id) throw new Error('No OGS player found. Check the username, player ID or profile URL.');
        }
        let code = '', session = null, lastErr = null;
        for (let i = 0; i < 3 && !session; i++) {
          code = newCode();
          const { data, error } = await sb.auth.signUp({ email: emailOf(code), password: code, options: { data: { ogs_id: u.id, ogs_username: u.username } } });
          if (error) { lastErr = error; if (/already registered|exists/i.test(error.message)) continue; break; }
          session = data.session;
          if (!session) { const r = await sb.auth.signInWithPassword({ email: emailOf(code), password: code }); session = r.data && r.data.session; if (r.error) lastErr = r.error; }
        }
        if (!session) {
          const m = lastErr ? lastErr.message : '';
          throw new Error(/confirm/i.test(m) || !m ? 'Account created but sign-in is blocked: turn off “Confirm email” in Supabase → Authentication → Sign In / Providers → Email.' : /rate|too many/i.test(m) ? 'Too many new codes from this network. Try again later.' : m);
        }
        const id = session.user.id;
        const profile = chk(await sb.from('review_profiles').upsert({ id, ogs_id: u.id, ogs_username: u.username }).select().single());
        return { code, profile };
      },
      // Links (or re-links) this account to an OGS player. Returns the updated profile.
      async linkOgs(ogsInput) {
        const u = await findUser(ogsInput);
        if (!u || !u.id) throw new Error('No OGS player found. Check the username, player ID or profile URL.');
        const id = await uid(); if (!id) throw new Error('Not signed in.');
        return chk(await sb.from('review_profiles').update({ ogs_id: u.id, ogs_username: u.username }).eq('id', id).select().single());
      },
      async myCode() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user.email.split('@')[0].toUpperCase() : ''; },
      async signOut() { await sb.auth.signOut(); },
      async saveProfile(patch) { const id = await uid(); chk(await sb.from('review_profiles').update(patch).eq('id', id)); },
      async games() { const id = await uid(); return chk(await sb.from('review_games').select('*').eq('user_id', id).order('played_on', { ascending: false }).order('created_at', { ascending: false })).map(fromRow); },
      async saveGame(g) { const id = await uid(); return fromRow(chk(await sb.from('review_games').upsert(toRow(g, id)).select().single())); },
      async deleteGame(gid) { chk(await sb.from('review_games').delete().eq('id', gid)); },
      ogs: body => WQOgs.call(body)
    };
    return api;
  }

  // ── Demo ─────────────────────────────────────────────────────────────
  function DemoAPI() {
    const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const iso = d => localIso(Date.now() - d * 864e5);
    const ME = 'demo_player', MEID = 900001, OPP = ['tengen_tom', 'hoshi', 'GoGoGo', 'kosumi_kat', 'atari_annie', 'shimari', 'ladder_breaker'];
    const makeList = (name, pid, seed) => Array.from({ length: 20 }, (_, i) => { const meB = (i + seed) % 2 === 0, opp = OPP[(i + seed) % OPP.length], win = ((i + seed) * 7) % 3 !== 0, bw = meB === win, myR = (seed ? 2 : 4) + 'k', opR = (2 + (i + seed) % 4) + 'k';
      return { id: 64000100 + seed * 100 + i, black: meB ? name : opp, white: meB ? opp : name, blackId: meB ? pid : 800000 + i, whiteId: meB ? 800000 + i : pid,
        blackRank: meB ? myR : opR, whiteRank: meB ? opR : myR, date: iso(Math.floor(i * 1.6)), size: 19, ranked: i % 4 !== 3, annulled: false,
        winner: bw ? 'B' : 'W', outcome: i % 3 === 0 ? (6.5 + i % 5) + ' points' : 'Resignation', rules: 'japanese', komi: 6.5, handicap: 0, time: i % 2 ? '10 min + 5×30s' : '20 min + 3×30s', moves: 150 + (i * 13) % 110 }; });
    const lists = { [MEID]: makeList(ME, MEID, 0) };
    const all = () => [].concat(...Object.values(lists));
    function fakeSgf(seed, it) {
      const r = rng(seed * 97 + 5), L = 'abcdefghijklmnopqrs', used = new Set(), pts = [[3, 3], [15, 15], [15, 3], [3, 15], [2, 9], [16, 9], [9, 2], [9, 16]];
      const re = /Resign/.test(it.outcome) ? it.winner + '+R' : it.winner + '+' + parseFloat(it.outcome);
      let s = '(;GM[1]FF[4]CA[UTF-8]SZ[19]PC[OGS: https://online-go.com/game/' + it.id + ']PB[' + it.black + ']PW[' + it.white + ']BR[' + it.blackRank + ']WR[' + it.whiteRank + ']KM[6.5]HA[0]RU[Japanese]DT[' + it.date + ']RE[' + re + ']';
      let lx = 3, ly = 3;
      for (let i = 0; i < it.moves; i++) {
        let x, y, k = 0;
        do { if (i < pts.length) [x, y] = pts[i]; else { x = Math.max(0, Math.min(18, lx + Math.round((r() - .5) * 6))); y = Math.max(0, Math.min(18, ly + Math.round((r() - .5) * 6))); if (k++ > 30) { x = Math.floor(r() * 19); y = Math.floor(r() * 19); } } } while (used.has(x + ',' + y));
        used.add(x + ',' + y); lx = x; ly = y; s += ';' + (i % 2 ? 'W' : 'B') + '[' + L[x] + L[y] + ']';
      }
      return s + ')';
    }
    const me = { id: 'demo', ogs_id: MEID, ogs_username: ME, settings: {} };
    const l0 = lists[MEID];
    const games = [
      { id: 'g1', fox_id: null, played_on: iso(9), sgf: null, points: [], info: { venue: '棋院', opponent: 'Maya', handicap: 0, time: 'No clock', result: '勝', end: '數目', rules: '日本', komi: '6.5', margin: '4.5', source: '老師', my_color: '黑',
        reason: 'Maya chose the wrong direction in the opening and I took the corners and sides. She was slower toward the center and never invaded my framework, while I kept my groups connected.' } },
      { id: 'g2', fox_id: 'ogs:' + l0[1].id, played_on: l0[1].date, sgf: fakeSgf(101, l0[1]), info: { venue: 'OGS', opponent: l0[1].black, my_color: '白', black_rank: l0[1].blackRank.toUpperCase(), white_rank: '4K', rules: '日本', komi: '6.5', handicap: 0, time: l0[1].time, result: '負', end: '中盤勝', reason: 'Misread the life-and-death in the lower right and my big group died.', self_moves: '87, 112, 140', source: 'AI', takeaway: 'Count liberties before starting a capturing race.' },
        points: [{ id: 'p1', move_no: 88, my_move: 'R5', correct: 'S4', loss: 32, thought: 'I thought I could reinforce the outside first.', type: '死活計算', in_self: true },
          { id: 'p2', move_no: 112, my_move: 'K10', correct: 'M3', loss: 12, thought: '', type: '方向或大小判斷', in_self: true },
          { id: 'p3', move_no: 131, my_move: 'C14', correct: 'D16', loss: 9, thought: "Didn't see the hane.", type: '漏看對方的手段', in_self: false }] }
    ];
    const api = {
      kind: 'demo', demo: true,
      async current() { return JSON.parse(JSON.stringify(me)); },
      async signIn() { return api.current(); },
      async createAccount(input) { await sleep(300); const name = String(input || '').trim();
        if (!name) { me.ogs_id = null; me.ogs_username = null; } else { const u = await api.ogs({ action: 'user', name }); me.ogs_id = u.id; me.ogs_username = u.username; }
        return { code: 'DEMODEMODEMO', profile: JSON.parse(JSON.stringify(me)) }; },
      async linkOgs(input) { const u = await api.ogs({ action: 'user', name: input }); if (!u) throw new Error('No OGS player found.'); me.ogs_id = u.id; me.ogs_username = u.username; return JSON.parse(JSON.stringify(me)); },
      async myCode() { return 'DEMODEMODEMO'; },
      async signOut() {},
      async saveProfile(patch) { Object.assign(me, JSON.parse(JSON.stringify(patch))); },
      async games() { await sleep(120); return JSON.parse(JSON.stringify(games)); },
      async saveGame(g) { await sleep(150); const x = JSON.parse(JSON.stringify(g)); if (!x.id) x.id = 'g' + Date.now(); const i = games.findIndex(q => q.id === x.id); if (i >= 0) games[i] = x; else games.unshift(x); return JSON.parse(JSON.stringify(x)); },
      async deleteGame(gid) { const i = games.findIndex(q => q.id === gid); if (i >= 0) games.splice(i, 1); },
      async ogs(body) {
        await sleep(250);
        if (body.action === 'user') { const n = String(body.name || '').trim(); if (!n) return null; if (/^#?900001$/.test(n) || n.toLowerCase() === ME) return { id: MEID, username: ME };
          let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 90000; const id = 700000 + h; if (!lists[id]) lists[id] = makeList(n.replace(/^.*\//, ''), id, 1 + h % 5); return { id, username: n.replace(/^.*\//, '') }; }
        if (body.action === 'list') return { games: (lists[body.uid] || []).map(x => Object.assign({}, x)) };
        const it = all().find(c => String(c.id) === String(body.id));
        if (!it) throw new Error('Game not found.');
        return { sgf: fakeSgf(Number(String(it.id).slice(-3)), it) };
      }
    };
    return api;
  }

  let current = null;
  window.WQIsDemo = () => !!(current && current.demo);
  window.WQHasCloud = hasCloud;
  window.WQBoot = function (mode) {
    if (mode === 'cloud' && !hasCloud()) throw new Error('Sign-in is not set up on this site yet (config.js / supabase-js).');
    current = mode === 'cloud' ? CloudAPI() : DemoAPI();
    window.WQApi = current;
    return current;
  };
})();
