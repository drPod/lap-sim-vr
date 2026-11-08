import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('assets-src/sketchfab/room.glb');
const top = doc.getRoot().getDefaultScene().listChildren()[0].listChildren()[0].listChildren()[0].listChildren();
let tris = 0;
for (const n of top) {
  const b = getBounds(n); const sz = b.max.map((v, i) => v - b.min[i]);
  let t = 0; n.traverse((c) => { const m = c.getMesh(); if (m) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; });
  if (b.max[1] > 2.2 && b.min[1] > 0.6 && Math.max(sz[0], sz[2]) < 3.2) { console.log(n.getName(), b.min.map((v) => v.toFixed(2)).join(','), '..', b.max.map((v) => v.toFixed(2)).join(','), 'tris', t); tris += t; }
}
console.log('total', tris);
