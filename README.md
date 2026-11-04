# Honte Review

Go game review notes for **OGS (online-go.com)** players, with **KataGo running in your browser**.

Pull your recent OGS games, step through them on a board, mark the moves that decided the game, try variations, and keep the lessons for next time. KataGo draws a win-rate graph for the whole game and points out each side's biggest mistakes, with no server and no cost.

Part of the [Honte · 本手](https://github.com/ConnorXwolf/Honte-Benshou) project. That repo tracks 101Weiqi homework; this one is review notes only.

**[Open Honte Review →](https://connorxwolf.github.io/honte-review/)**  ·  [Try the demo](https://connorxwolf.github.io/honte-review/app.dc.html?demo=1)

---

## Getting started

1. Open the site and, under **No code yet? Enter your OGS ID**, type your OGS username, player ID, or profile URL (`https://online-go.com/player/123456/`).
2. You get a **12-character sign-in code** (`XXXX-XXXX-XXXX`) linked to that OGS account. **Save it.** It's the only way to sign in on another device, and it can't be recovered.
3. Next time, sign in with the code.

> Entering your OGS ID again doesn't recover an old code. It creates a new, empty account. That way nobody can get into your notes just by knowing your OGS name.

## Reviewing a game

- **Recent games** lists the latest 20 finished games of your linked OGS account. Click one to open it.
- **Other OGS player** lists any player's latest 20 games. Use it for a friend's game or a pro game you want to study.
- **Upload SGF** opens a game from any server or program.
- **Add game manually** is for over-the-board games without a record. You can attach an SGF later.

OGS games come in with players, ranks, komi, rules, handicap, time control and result already filled in.

### On the board
- Step through moves with the buttons or the slider. Click an empty point to try a **variation**, then file it under **Lessons** or **Key moves**.
- **Mark move N as a key move** records what you played, the better move, the win-rate loss, the mistake type, and what you were thinking.
- **My own key moves**: before looking at the AI, write down the 3 moves you think mattered most. Then compare with what KataGo found.

### KataGo win rate
- **Analyze** runs KataGo on every move: the graph shows Black's win rate, and red dots mark the turning points.
- **Mark my 3 biggest losses as key moves** adds them with KataGo's suggested move.
- Settings: model (standard b10 · light b24c64 for phones · strong b40 for desktop WebGPU) and visits per move (25–200).
- Chrome or Edge on a computer uses WebGPU and is fastest. Other browsers fall back to WASM.
- Prefer your own hardware? Choose **Self-hosted server** (see `katago-server/`).

---

## Self-hosting this site

### 1. Supabase (accounts and notes)
1. Create a project at [supabase.com](https://supabase.com) (the free tier is enough).
2. **SQL Editor** → paste `supabase/setup.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email** → turn **off** "Confirm email". Accounts use generated codes, not real addresses.
4. **Project Settings → API** → copy the URL and the anon/publishable key into `config.js`.

Optional: if OGS requests get blocked in some browsers, deploy `supabase/functions/ogs/index.ts` as an Edge Function named `ogs`, with "Verify JWT" off. The site uses it automatically as a fallback.

### 2. GitHub Pages
Settings → Pages → Deploy from branch → `main` / root. The site is static. `index.html` redirects to `app.dc.html`.

### 3. KataGo models
`katago/lib/` (the in-browser engine) and the light model are in the repo. The standard `kata1-b10c128.bin.gz` (~98 MB) is optional: if it isn't in `katago/models/`, the engine loads it from the Honte-Benshou site. See [`katago/README.md`](katago/README.md).

## Files

| Path | What it is |
|---|---|
| `app.dc.html` | The page: sign in, create a code from an OGS ID, the review app |
| `review.dc.html` | Review component: game list, board, variations, KataGo, key moves |
| `api.js` | Supabase data layer, OGS connector, demo data |
| `config.js` | Your Supabase URL and key |
| `support.js` | Component runtime |
| `assets/styles.css` | Styles |
| `katago/` | In-browser KataGo: `engine.js`, `lib/`, `models/` |
| `katago-server/` | Optional self-hosted KataGo server |
| `supabase/` | `setup.sql` and the optional `ogs` proxy function |

## FAQ

**Do I need an OGS account?** To create a code, yes: the code is linked to an OGS player. Without one you can still try the demo.

**Can Honte Review change anything on OGS?** No. It only reads public game lists and SGFs.

**Private games?** Only public games can be read.

**I lost my code.** It can't be recovered. Enter your OGS ID to start a new account.

## License

[MIT](LICENSE). Not affiliated with OGS / online-go.com. KataGo by David J. Wu (lightvector); in-browser engine via [katago-web](https://github.com/JuneKim0712/katago-web).
