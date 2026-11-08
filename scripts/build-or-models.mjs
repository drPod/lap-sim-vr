// Optimise the Sketchfab OR models for Quest: simplify (meshoptimizer), join meshes by
// material, KTX2/Basis textures <= 1024 px, meshopt geometry compression.
//   node scripts/build-or-models.mjs [srcDir=assets-src/sketchfab]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const src = process.argv[2] || 'assets-src/sketchfab';
const out = 'client/public/assets/or';
fs.mkdirSync(out, { recursive: true });
const { models } = JSON.parse(fs.readFileSync('assets-src/or-models.json', 'utf8'));
const only = process.argv.slice(3);
for (const m of models) {
  if (only.length && !only.includes(m.name)) continue;
  const args = ['gltf-transform', 'optimize', `${src}/${m.name}.glb`, `${out}/${m.name}.glb`,
    '--compress', 'meshopt', '--texture-compress', 'ktx2', '--texture-size', String(m.textureSize || 1024),
    '--simplify-ratio', String(m.ratio), '--simplify-error', String(m.error ?? 0.002), '--join', 'true', '--flatten', 'true', '--simplify-lock-border', String(!!m.lockBorder)];
  execFileSync('npx', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(m.name, (fs.statSync(`${out}/${m.name}.glb`).size / 1024).toFixed(0), 'KB');
}
