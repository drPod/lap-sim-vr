import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const scene = root.getDefaultScene();
const lines = [];
function walk(n, d) {
  const m = n.getMesh();
  if (d <= Number(process.argv[3] || 6) && (n.listChildren().length || m)) {
    let b = ''; try { const bb = getBounds(n); b = `[${bb.min.map((v) => v.toFixed(2))}]..[${bb.max.map((v) => v.toFixed(2))}]`; } catch {}
    lines.push(' '.repeat(d) + (n.getName() || '(node)') + (m ? ' *' : '') + ' ' + b);
  }
  for (const c of n.listChildren()) walk(c, d + 1);
}
for (const n of scene.listChildren()) walk(n, 0);
console.log(lines.slice(0, 160).join('\n'));
