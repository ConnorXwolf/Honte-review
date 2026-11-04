# Lets katago-web read text-format KataGo models (.txt / .txt.gz) as well as .bin.gz.
# Run once after rebuilding katago/lib with build-legacy.mjs:
#   python katago/patch-txt-models.py katago/lib/worker.js katago/lib/katago-web.js
import re, sys

MARK = 'Text-format model (.txt / .txt.gz)'

def patch(src):
    if MARK in src:
        return src
    pat = re.compile(r'(readBinaryFloats\((\w+)\) \{\n(\s*)this\.skipWhitespace\(\);\n)')
    found = pat.findall(src)
    if len(found) != 1:
        raise SystemExit('readBinaryFloats not found exactly once (found %d)' % len(found))
    m = pat.search(src)
    n, ind = m.group(2), m.group(3)
    add = (f'{ind}if (this.data[this.idx] !== 64) {{\n'
           f'{ind}  // {MARK}: weights are written as ASCII numbers. Added for Honte Review.\n'
           f'{ind}  const out = new Float32Array({n});\n'
           f'{ind}  for (let i = 0; i < {n}; i++) out[i] = this.readFloatAscii();\n'
           f'{ind}  this.skipWhitespace();\n'
           f'{ind}  return out;\n'
           f'{ind}}}\n')
    return src[:m.end()] + add + src[m.end():]

for p in sys.argv[1:]:
    s = open(p, encoding='utf-8').read()
    open(p, 'w', encoding='utf-8').write(patch(s))
    print('patched', p)
