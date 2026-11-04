// 放到 C:\Users\yk605\kata-build\ 執行：node build-legacy.mjs
// 產生 out-legacy/（katago-web.js + worker.js + tfjs wasm），整包上傳到 katago/lib/
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const NODE = ['fs','path','crypto','url','worker_threads','os','child_process','module','util','stream','buffer','perf_hooks','zlib','http','https','net','tls','events','string_decoder','assert','v8','vm','readline','process'];
const re = new RegExp('^(node:)?(' + NODE.join('|') + ')(/.*)?$');
const stub = { name: 'node-stub', setup(b) {
  b.onResolve({ filter: re }, a => ({ path: a.path, namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
} };

// pako 2.x 的 .mjs 沒有 default export：包一層虛擬模組補上
const PAKO = path.resolve('node_modules/pako/dist/pako.esm.mjs');
const PAKO_SRC = fs.existsSync(PAKO) ? PAKO : path.resolve('node_modules/pako/dist/pako.mjs');
const pakoFix = { name: 'pako-default', setup(b) {
  b.onResolve({ filter: /^pako$/ }, () => ({ path: 'pako', namespace: 'pako-wrap' }));
  b.onLoad({ filter: /.*/, namespace: 'pako-wrap' }, () => ({
    contents: 'import * as p from ' + JSON.stringify(PAKO_SRC.replace(/\\/g, '/')) + '; export * from ' + JSON.stringify(PAKO_SRC.replace(/\\/g, '/')) + '; export default p;',
    loader: 'js', resolveDir: process.cwd()
  }));
} };

const OUT = 'out-legacy';
fs.rmSync(OUT, { recursive: true, force: true });
await esbuild.build({
  entryPoints: { 'katago-web': 'katago-web-master/src/index.ts', 'worker': 'katago-web-master/src/worker/worker.ts' },
  outdir: OUT, bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  loader: { '.wasm': 'file' }, plugins: [pakoFix, stub],

  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning'
});

const wdir = 'node_modules/@tensorflow/tfjs-backend-wasm/dist';
for (const f of fs.readdirSync(wdir).filter(f => f.endsWith('.wasm'))) fs.copyFileSync(path.join(wdir, f), path.join(OUT, f));

for (const f of ['katago-web.js', 'worker.js']) {
  const src = fs.readFileSync(path.join(OUT, f), 'utf8');
  const bare = [...new Set([...src.matchAll(/(?:^|[;\n}])\s*import\s*(?:[^'"]*?from\s*)?["']([^"'./][^"']*)["']/g)].map(m => m[1]))];
  console.log(f.padEnd(16), bare.length ? '⚠ 仍有 Node 模組：' + bare.join(', ') : 'OK');
}
console.log('\n輸出檔案：'); for (const f of fs.readdirSync(OUT)) console.log('  ' + f);
