// Generated classic scripts allow the same viewer to run over HTTP and file://.
// Run with: node scripts/build-qualitative-viewer.cjs <path-to-esbuild>
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require(process.argv[2] || 'esbuild');
const root = path.resolve(__dirname, '../public/media/qualitative_3d');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'qualitative_manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
fs.writeFileSync(path.join(root, 'viewer-source.js'),
  `window.__OMNICAD_VIEWER_SOURCE=${JSON.stringify(source)};\nwindow.__OMNICAD_LOCAL_MANIFEST=${JSON.stringify(manifest)};\n`);
const assets = new Set(manifest.samples.flatMap(sample => Object.values(sample.results).filter(Boolean)));
for (const name of fs.readdirSync(path.join(root, 'case01_parts'))) assets.add(`case01_parts/${name}`);
for (const asset of assets) {
  const bytes = fs.readFileSync(path.join(root, asset));
  const value = asset.endsWith('.obj') ? bytes.toString('utf8') : bytes.toString('base64');
  const target = path.join(root, 'local_payloads', `${asset}.js`);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, `window.__OMNICAD_LOCAL_ASSETS ||= {};\nwindow.__OMNICAD_LOCAL_ASSETS[${JSON.stringify(asset)}]=${JSON.stringify(value)};\n`);
}
esbuild.buildSync({
  entryPoints: [path.join(root, 'app_runtime.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  alias: {three: path.join(root, 'vendor/build/three.module.min.js')},
  outfile: path.join(root, 'viewer-runtime.js'),
  legalComments: 'eof'
});
console.log(`Built classic viewer runtime and ${assets.size} local asset payloads.`);
