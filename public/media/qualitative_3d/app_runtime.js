import * as THREE from 'three';
import { OrbitControls } from './vendor/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from './vendor/examples/jsm/loaders/OBJLoader.js';
import { RoomEnvironment } from './vendor/examples/jsm/environments/RoomEnvironment.js';

// Geometry stays untouched:
//   Case 01 GT -> approved OBJ assembly
//   every other displayed result -> its original generated GLB
// This wrapper only normalizes materials, lights and shadows.
async function boot() {
  let source = window.__OMNICAD_VIEWER_SOURCE;
  if (!source) {
    const response = await fetch('./app.js', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load app.js: ${response.status}`);
    source = await response.text();
  }
  source = source.replace(/^\s*import\s+[^\n]+\n/gm, '');

  // Match the effective palette of linkgpt_01: its CRLF app.js retains this
  // aluminum palette while the wrapper supplies the materials and lighting.
  source = source.replace(
    /const CASE_COLORS = \[[\s\S]*?\];\r?\nconst CASE_ROUGHNESS = \[[\s\S]*?\];/,
    `const CASE_COLORS = [
  '#9a9d9d',
  '#8e8f8c',
  '#838789',
  '#747a7d',
  '#697174',
  '#5d6468',
  '#50575b',
  '#454b4f',
  '#70675e',
  '#5f574f'
];
const CASE_ROUGHNESS = [0.44, 0.42, 0.38, 0.36, 0.40, 0.35, 0.37, 0.33, 0.45, 0.41];`
  );

  source = source.replace(
    /function makeApprovedPartMaterial\(index\) \{[\s\S]*?\n\}/,
    `function makeApprovedPartMaterial(index) {
  const paletteIndex = index % CASE_COLORS.length;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(CASE_COLORS[paletteIndex]),
    metalness: 0.58,
    roughness: CASE_ROUGHNESS[paletteIndex],
    envMapIntensity: 0.22,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide
  });
}`
  );

  // Replace the GLB render path for every other result. The original GLBs were
  // exported with a vivid per-component vertex-color palette. We use those
  // colors only as stable component IDs, then remap them to restrained metals.
  source = source.replace(
    /function applyMetallicMaterial\(root\) \{[\s\S]*?\n\}/,
    `function applyMetallicMaterial(root) {
  const SOURCE_PALETTE = [
    [0.79, 0.82, 0.34],
    [0.82, 0.40, 0.70],
    [0.94, 0.58, 0.29],
    [0.42, 0.75, 0.46],
    [0.70, 0.70, 0.68],
    [0.46, 0.69, 0.86],
    [0.88, 0.45, 0.67],
    [0.45, 0.78, 0.52],
    [0.92, 0.52, 0.25],
    [0.36, 0.62, 0.83]
  ];

  // Slightly clearer than the GT palette because GLB normals/environment
  // reflections otherwise compress the visible color differences.
  const RESULT_COLORS = [
    '#92989a', // satin steel
    '#887d73', // warm titanium
    '#74838a', // cool titanium
    '#777d7b', // neutral metal
    '#66767d', // blue steel
    '#696d64', // muted olive steel
    '#56636a', // gunmetal
    '#5b5550', // warm gunmetal
    '#7d6d60', // muted bronze
    '#625a54'  // deep warm titanium
  ];
  const RESULT_ROUGHNESS = [0.48, 0.46, 0.42, 0.43, 0.44, 0.45, 0.40, 0.42, 0.49, 0.45];

  function nearestSourcePaletteIndex(attribute) {
    if (!attribute || attribute.count < 1) return null;
    const r = attribute.getX(0);
    const g = attribute.getY(0);
    const b = attribute.getZ(0);
    let bestIndex = 0;
    let bestDistance = Infinity;
    SOURCE_PALETTE.forEach((rgb, index) => {
      const dr = r - rgb[0];
      const dg = g - rgb[1];
      const db = b - rgb[2];
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function fallbackComponentIndex(obj, fallbackIndex) {
    let cursor = obj;
    while (cursor && cursor !== root) {
      const match = String(cursor.name || '').match(/c0*(\\d+)/i);
      if (match) return (Math.max(1, Number(match[1])) - 1) % RESULT_COLORS.length;
      cursor = cursor.parent;
    }
    return fallbackIndex % RESULT_COLORS.length;
  }

  let meshIndex = 0;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!obj.geometry.attributes.normal) obj.geometry.computeVertexNormals();

    const sourceIndex = nearestSourcePaletteIndex(obj.geometry.getAttribute('color'));
    const materialIndex = sourceIndex ?? fallbackComponentIndex(obj, meshIndex);

    obj.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(RESULT_COLORS[materialIndex]),
      metalness: 0.52,
      roughness: RESULT_ROUGHNESS[materialIndex],
      envMapIntensity: 0.17,
      side: THREE.DoubleSide
    });
    obj.castShadow = true;
    obj.receiveShadow = true;
    meshIndex += 1;
  });
}`
  );

  // Apply the Case 01 GT lighting profile to every case/result so the overall
  // presentation is consistent. Geometry and model predictions are untouched.
  source = source.replace(
    /if \(useApprovedCase01Profile\) \{[\s\S]*?\n  \} else \{/,
    `if (useApprovedCase01Profile) {
    renderer.toneMappingExposure = 0.88;
    hemiLight.intensity = 0.45;
    hemiLight.groundColor.setHex(0x73787c);
    mainLight.intensity = 1.50;
    mainLight.position.set(350, 500, 450);
    rimLight.intensity = 0.22;
    rimLight.position.set(-80, 360, -520);
    fillLight.intensity = 0.18;
  } else {`
  );
  source = source.replace(
    'applyRenderProfile(useCase01ObjRenderer);',
    'applyRenderProfile(true);'
  );

  // Every case/result receives the same contact-shadow treatment. The shadow
  // plane is fitted to that result's own bounding box, so irregular predictions
  // remain irregular but still receive consistent presentation lighting.
  source = source.replace(
    'if (useCase01ObjRenderer) addCaseShadowFloor(modelRoot);',
    'addCaseShadowFloor(modelRoot);'
  );

  const run = new Function(
    'THREE',
    'OrbitControls',
    'GLTFLoader',
    'OBJLoader',
    'RoomEnvironment',
    `${source}\n//# sourceURL=qualitative-atlas-runtime.js`
  );
  run(THREE, OrbitControls, GLTFLoader, OBJLoader, RoomEnvironment);
}

boot().catch((error) => {
  console.error(error);
  const loading = document.getElementById('loading');
  const errorBox = document.getElementById('errorBox');
  const errorText = document.getElementById('errorText');
  loading?.classList.add('done');
  if (errorText) errorText.textContent = `Runtime boot failed: ${error.message}`;
  errorBox?.classList.add('visible');
});
