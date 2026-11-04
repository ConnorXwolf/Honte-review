# KataGo in the browser — setup

Win-rate analysis runs in each visitor's own browser. No server, no cost.

## Folder layout

```
katago/
├── engine.js          ← adapter used by review.dc.html
├── build-legacy.mjs   ← rebuilds lib/
├── lib/
│   ├── katago-web.js
│   ├── worker.js
│   └── *.wasm
└── models/
    └── kata1-b10c128.bin.gz     (optional — loaded from the Honte-Benshou site if missing)
```

## Rebuilding `lib/` (only if you need to)

katago-web isn't published on npm, so it's bundled from GitHub. Needs Node.js 20+.

```powershell
mkdir kata-build; cd kata-build
Invoke-WebRequest https://github.com/JuneKim0712/katago-web/archive/refs/heads/master.zip -OutFile kw.zip
Expand-Archive kw.zip -DestinationPath . -Force
npm init -y
npm install @tensorflow/tfjs @tensorflow/tfjs-backend-wasm @tensorflow/tfjs-backend-webgpu onnxruntime-web@1.30.0 pako esbuild
copy <path-to-this-repo>\katago\build-legacy.mjs .
node build-legacy.mjs
```

Copy everything in `out-legacy\` into `katago/lib/`. Then run `python katago/patch-txt-models.py katago/lib/worker.js katago/lib/katago-web.js` so text-format (`.txt.gz`) models keep working. PowerShell may print esbuild output in red as `NativeCommandError`; if it ends with the bundle size and `Done`, the build worked.

## Models

From https://katagotraining.org/networks/ — `.bin.gz` or `.txt.gz` (this repo's `lib/` is patched to read text-format models):

- Standard: a b10c128 network → rename to `kata1-b10c128.bin.gz`
- Light: kata1-b6c96 (`.txt.gz`), loaded from Hugging Face (`ConnerXwolf/katago_b6`)
- Strong b40c256 is loaded from Hugging Face; desktop WebGPU only.

GitHub's web uploader caps files at 25 MB; use git or GitHub Desktop for bigger models.

## Using it

1. Open a game with a record → *AI win rate (KataGo)* → **Settings**.
2. Engine: **In this browser**. Pick a model (*Custom model URL* must allow CORS).
3. Choose visits per move → **Analyze**. The first run downloads the model; the browser caches it after that.

Results are saved with the game, so reopening it doesn't re-run the analysis.

## Speed

- Fastest: Chrome or Edge on a computer (WebGPU, picked automatically).
- Without WebGPU it falls back to WASM, single-threaded on GitHub Pages — slower.
- On phones use the light b6c96 model with 25 visits.
- A 200-move game at 50 visits takes a few minutes on a computer.

## Troubleshooting

- **"Failed to load the KataGo library"** — check that `katago/lib/katago-web.js` exists.
- **"Model failed to load"** — the file name in `katago/models/` must match exactly.
- **Slow** — smaller model or fewer visits.
- **Self-hosted server instead** — Settings → Engine → *Self-hosted server*, then URL and password (see `katago-server/`).
