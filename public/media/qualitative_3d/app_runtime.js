import * as THREE from 'three';
import { OrbitControls } from './vendor/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from './vendor/examples/jsm/loaders/OBJLoader.js';
import { RoomEnvironment } from './vendor/examples/jsm/environments/RoomEnvironment.js';

// Geometry stays untouched:
//   Case 01 GT -> OBJ assembly
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

  // Scheme 1: cool body + clearly separated warm/olive accents.
  source = source.replace(
    /const CASE_COLORS = \[[\s\S]*?\];\r?\nconst CASE_ROUGHNESS = \[[\s\S]*?\];/,
    `const CASE_COLORS = [
  '#647886', // cool blue steel
  '#7c8b94', // light titanium steel
  '#a07d62', // warm bronze accent
  '#586b77', // deep cool steel
  '#788461', // olive titanium accent
  '#71818b', // medium blue steel
  '#4f606b', // gunmetal blue
  '#8f725c', // dark warm bronze accent
  '#69775b', // deep olive accent
  '#87939a'  // pale titanium
];
const CASE_ROUGHNESS = [0.39, 0.36, 0.43, 0.34, 0.46, 0.37, 0.33, 0.45, 0.47, 0.35];`
  );

  // Explicit Case 01 GT mapping. The lower/base components use stronger warm and
  // olive accents so the pedestal and lower joint no longer merge into one gray mass.
  source = source.replace(
    /function makePartMaterial\(index\) \{[\s\S]*?\n\}/,
    `function makePartMaterial(index, partId = '') {
  const CASE01_GT_PART_COLORS = {
    c00001: '#9f7758', // lower base / bronze
    c00002: '#738357', // lower base / olive
    c00003: '#596f7d', // cool connector
    c00004: '#aa8160', // lower joint block / warm bronze
    c00005: '#7d8b5f', // lower joint / olive
    c00006: '#6d808c', // upper body / cool steel
    c00007: '#4f626e', // upper body / gunmetal
    c00008: '#7a8b94', // upper body / titanium
    c00009: '#5b6e79', // upper body / cool steel
    c00010: '#87949b'  // end component / pale titanium
  };
  const CASE01_GT_PART_ROUGHNESS = {
    c00001: 0.44,
    c00002: 0.48,
    c00003: 0.36,
    c00004: 0.43,
    c00005: 0.47,
    c00006: 0.37,
    c00007: 0.34,
    c00008: 0.36,
    c00009: 0.35,
    c00010: 0.35
  };
  const fallbackIndex = index % CASE_COLORS.length;
  const color = CASE01_GT_PART_COLORS[partId] || CASE_COLORS[fallbackIndex];
  const roughness = CASE01_GT_PART_ROUGHNESS[partId] ?? CASE_ROUGHNESS[fallbackIndex];
  const accent = ['c00001', 'c00002', 'c00004', 'c00005'].includes(partId);
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: accent ? 0.66 : 0.62,
    roughness,
    envMapIntensity: accent ? 0.31 : 0.25,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide
  });
}`
  );

  // Make the GT loader pass the real part ID into the material function.
  source = source.replace(
    'const material = makePartMaterial(index);',
    'const material = makePartMaterial(index, meta.id);'
  );

  // Replace the GLB render path for every other result. The original GLBs were
  // exported with a vivid per-component vertex-color palette. We use those
  // colors only as stable component IDs, then remap them to the same cold-body /
  // warm-accent language used by Case 01 GT.
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

  const RESULT_COLORS = [
    '#627887', // cool blue steel
    '#7d8d97', // pale titanium
    '#a48265', // warm bronze accent
    '#77855f', // olive titanium accent
    '#596c78', // deep cool steel
    '#70838f', // medium blue steel
    '#4d606b', // dark gunmetal
    '#91735d', // dark bronze accent
    '#6b7959', // deep olive accent
    '#89949a'  // light neutral titanium
  ];
  const RESULT_ROUGHNESS = [0.40, 0.36, 0.44, 0.47, 0.35, 0.38, 0.33, 0.46, 0.48, 0.35];
  const ACCENT_INDICES = new Set([2, 3, 7, 8]);

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
    const accent = ACCENT_INDICES.has(materialIndex);

    obj.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(RESULT_COLORS[materialIndex]),
      metalness: accent ? 0.64 : 0.58,
      roughness: RESULT_ROUGHNESS[materialIndex],
      envMapIntensity: accent ? 0.25 : 0.21,
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
    /if \(useUnifiedRenderProfile\) \{[\s\S]*?\n  \} else \{/,
    `if (useUnifiedRenderProfile) {
    renderer.toneMappingExposure = 0.91;
    hemiLight.intensity = 0.48;
    hemiLight.groundColor.setHex(0x707980);
    mainLight.intensity = 1.54;
    mainLight.position.set(350, 500, 450);
    rimLight.intensity = 0.24;
    rimLight.position.set(-80, 360, -520);
    fillLight.intensity = 0.20;
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
    `${source}\n//# sourceURL=qualitative-viewer-runtime.js`
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
