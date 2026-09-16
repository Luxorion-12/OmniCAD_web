import * as THREE from 'three';
import { OrbitControls } from './vendor/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from './vendor/examples/jsm/loaders/OBJLoader.js';
import { RoomEnvironment } from './vendor/examples/jsm/environments/RoomEnvironment.js';

// Assets are served from this self-contained qualitative_3d directory when the
// viewer is embedded by the OmniCAD homepage.
const SITE_ROOT = '.';
const MANIFEST_URL = './qualitative_manifest.json';

const localPayloadRequests = new Map();
function loadLocalPayload(path) {
  if (!localPayloadRequests.has(path)) {
    localPayloadRequests.set(path, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `./local_payloads/${path}.js`;
      script.onload = () => {
        const value = window.__OMNICAD_LOCAL_ASSETS?.[path];
        if (typeof value === 'string') resolve(value);
        else reject(new Error(`Local asset payload missing: ${path}`));
        script.remove();
      };
      script.onerror = () => { script.remove(); reject(new Error(`Unable to read local asset: ${path}`)); };
      document.head.appendChild(script);
    }));
  }
  return localPayloadRequests.get(path);
}

const DEG = Math.PI / 180;
const CASE01_SAMPLE_ROOT = './case01_parts';
const CASE01_COMPONENT_ROOT = CASE01_SAMPLE_ROOT;
const CASE01_PARTS = [
  { id: 'c00001', library: 'lib00001', p: [40.779253635064286, 36.10757410786766, 92.87956569176787], r: [0, 0, 0] },
  { id: 'c00002', library: 'lib00002', p: [30.529253635064272, 45.30757410786766, 92.87956569176787], r: [-180, -6.36110936292703e-15, -180] },
  { id: 'c00003', library: 'lib00003', p: [40.779253635064286, 93.10757410786766, 92.87956569176787], r: [-180, 84.18267208902846, 180] },
  { id: 'c00004', library: 'lib00002', p: [39.305584321044535, 126.31298647193535, 142.48439249762234], r: [-94.12054667820624, 4.109931938415413, -45.14791428382241] },
  { id: 'c00005', library: 'lib00004', p: [27.290735460569085, 133.56083097909686, 96.06311874452584], r: [177.08064791264337, -5.03394792907128, -149.83558589946762] },
  { id: 'c00006', library: 'lib00005', p: [-91.5961499066365, 249.41973821482637, 118.93092429331122], r: [5.708380261898429, 1.122439309314718, 78.91245034537802] },
  { id: 'c00007', library: 'lib00002', p: [-37.665951318357564, 239.42708691380744, 150.32639530753545], r: [-88.87196815206919, -5.707281282790417, 168.800257508524] },
  { id: 'c00008', library: 'lib00006', p: [-65.80944365893514, 244.40741821561832, 110.77525576643087], r: [5.708380261898398, 1.1224393093144743, 78.9124503453777] },
  { id: 'c00009', library: 'lib00007', p: [-120.81137799777224, 255.09923789618034, 121.8023151814239], r: [5.711957985676979, 2.314858186424023, 79.03173477554525] },
  { id: 'c00010', library: 'lib00005', p: [-141.63098411832436, 259.8236151066121, 138.54557534455444], r: [-92.32639656790143, 5.707281282790385, -11.199742491476343] }
];

const MODEL_LABELS = {
  gt: 'Ground Truth',
  gpt55: 'GPT 5.5',
  gpt54mini: 'GPT 5.4 Mini',
  claude48: 'Claude Opus 4.8',
  gemini31: 'Gemini 3.1 Pro',
  gemini25: 'Gemini 2.5 Flash',
  qwen37: 'Qwen 3.7 Plus',
  qwen35: 'Qwen 3.5 9B'
};

const VIEW_DIRS = {
  perspective: new THREE.Vector3(1.2, 0.8, 1.35).normalize(),
  front: new THREE.Vector3(0, 0, 1),
  side: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0)
};

// Exact premium-metal palette from the user-approved Single View commit 3ef8e807.
const CASE_COLORS = [
  '#9a9d9d', // satin aluminum
  '#8e8f8c', // warm aluminum
  '#838789', // titanium silver
  '#747a7d', // neutral titanium
  '#697174', // cool titanium
  '#5d6468', // dark titanium
  '#50575b', // gunmetal
  '#454b4f', // dark gunmetal
  '#70675e', // muted bronze gray
  '#5f574f'  // deep bronze gray
];
const CASE_ROUGHNESS = [0.44, 0.42, 0.38, 0.36, 0.40, 0.35, 0.37, 0.33, 0.45, 0.41];

const viewport = document.getElementById('viewport');
const viewerStage = document.getElementById('viewerStage');
const loading = document.getElementById('loading');
const loaderText = document.getElementById('loaderText');
const errorBox = document.getElementById('errorBox');
const errorText = document.getElementById('errorText');
const caseCount = document.getElementById('caseCount');
const status = document.getElementById('status');
const partsChip = document.getElementById('partsChip');
const partsList = document.getElementById('partsList');
const visibleCount = document.getElementById('visibleCount');
const explodeRange = document.getElementById('explodeRange');
const explodeValue = document.getElementById('explodeValue');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#eefafa');

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor('#eefafa', 1);
viewport.appendChild(renderer.domElement);

function applyHostTheme() {
  const dark = document.documentElement.classList.contains('omnicad-host-dark');
  const color = getComputedStyle(document.documentElement).getPropertyValue('--page-bg').trim() || (dark ? '#020b10' : '#eefafa');
  scene.background = new THREE.Color(color);
  renderer.setClearColor(color, 1);
}
applyHostTheme();
new MutationObserver(applyHostTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class', 'style']
});

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3a444a, 1.2);
scene.add(hemiLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 2.0);
mainLight.position.set(4.0, 6.0, 5.0);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(2048, 2048);
mainLight.shadow.camera.left = -1000;
mainLight.shadow.camera.right = 1000;
mainLight.shadow.camera.top = 1000;
mainLight.shadow.camera.bottom = -1000;
mainLight.shadow.camera.near = 1;
mainLight.shadow.camera.far = 3000;
mainLight.shadow.bias = -0.00035;
scene.add(mainLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.2);
rimLight.position.set(-4.0, 2.0, -3.5);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xdfe5e8, 0.0);
fillLight.position.set(-420, 220, 260);
scene.add(fillLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 5;
controls.maxDistance = 100000;

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let manifest = null;
let currentCaseIndex = 0;
let currentModelKey = 'gt';
let modelRoot = null;
let componentRoots = [];
let clickableMeshes = [];
let selectedComponent = null;
let explodeTarget = 0;
let explodeCurrent = 0;
let loadToken = 0;

function setLoading(show, text = 'Loading qualitative result…') {
  loaderText.textContent = text;
  loading.classList.toggle('done', !show);
}

function showError(message) {
  errorText.textContent = message;
  errorBox.classList.add('visible');
  setLoading(false);
}

function clearError() {
  errorBox.classList.remove('visible');
}

function removeCaseShadowFloor() {
  const floor = scene.getObjectByName('case01-shadow-floor');
  if (!floor) return;
  scene.remove(floor);
  floor.geometry?.dispose?.();
  floor.material?.dispose?.();
}

function applyRenderProfile(useApprovedCase01Profile) {
  removeCaseShadowFloor();

  if (useApprovedCase01Profile) {
    // Exact lighting from the approved 3ef8e807 Single View profile.
    renderer.toneMappingExposure = 0.82;
    hemiLight.intensity = 0.32;
    hemiLight.groundColor.setHex(0x747a7e);
    mainLight.intensity = 1.55;
    mainLight.position.set(350, 500, 450);
    rimLight.intensity = 0.28;
    rimLight.position.set(-80, 360, -520);
    fillLight.intensity = 0.34;
  } else {
    renderer.toneMappingExposure = 0.98;
    hemiLight.intensity = 1.2;
    hemiLight.groundColor.setHex(0x3a444a);
    mainLight.intensity = 2.0;
    mainLight.position.set(4.0, 6.0, 5.0);
    rimLight.intensity = 1.2;
    rimLight.position.set(-4.0, 2.0, -3.5);
    fillLight.intensity = 0.0;
  }
}

function addCaseShadowFloor(root) {
  removeCaseShadowFloor();
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxExtent = Math.max(size.x, size.y, size.z, 1);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(maxExtent * 2.8, maxExtent * 2.8),
    new THREE.ShadowMaterial({ color: 0x3f4447, opacity: 0.24, transparent: true })
  );
  floor.name = 'case01-shadow-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, box.min.y - maxExtent * 0.010, center.z);
  floor.receiveShadow = true;
  scene.add(floor);
}

function disposeObject(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
    else obj.material?.dispose?.();
  });
  scene.remove(root);
}

function makeApprovedPartMaterial(index) {
  const paletteIndex = index % CASE_COLORS.length;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(CASE_COLORS[paletteIndex]),
    metalness: 0.88,
    roughness: CASE_ROUGHNESS[paletteIndex],
    envMapIntensity: 0.62,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide
  });
}

function makeFallbackMetalMaterial(materialIndex = 0) {
  const index = materialIndex % CASE_COLORS.length;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(CASE_COLORS[index]),
    metalness: 0.78,
    roughness: CASE_ROUGHNESS[index],
    envMapIntensity: 0.36,
    side: THREE.DoubleSide
  });
}

function makeVertexMetalMaterial(materialIndex = 0) {
  const index = materialIndex % CASE_ROUGHNESS.length;
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.78,
    roughness: CASE_ROUGHNESS[index],
    envMapIntensity: 0.36,
    side: THREE.DoubleSide
  });
}

function sourceColorKey(attribute, i) {
  const r = Math.round(THREE.MathUtils.clamp(attribute.getX(i), 0, 1) * 255);
  const g = Math.round(THREE.MathUtils.clamp(attribute.getY(i), 0, 1) * 255);
  const b = Math.round(THREE.MathUtils.clamp(attribute.getZ(i), 0, 1) * 255);
  return `${r},${g},${b}`;
}

function applyMetallicMaterial(root) {
  const sourceColorToPalette = new Map();
  let fallbackIndex = 0;

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!obj.geometry.attributes.normal) obj.geometry.computeVertexNormals();

    const sourceColors = obj.geometry.getAttribute('color');
    if (sourceColors && sourceColors.count > 0) {
      const mapped = new Float32Array(sourceColors.count * 3);
      let firstPaletteIndex = 0;
      let hasFirst = false;

      for (let i = 0; i < sourceColors.count; i += 1) {
        const key = sourceColorKey(sourceColors, i);
        if (!sourceColorToPalette.has(key)) {
          sourceColorToPalette.set(key, sourceColorToPalette.size % CASE_COLORS.length);
        }
        const paletteIndex = sourceColorToPalette.get(key);
        if (!hasFirst) {
          firstPaletteIndex = paletteIndex;
          hasFirst = true;
        }
        const c = new THREE.Color(CASE_COLORS[paletteIndex]);
        mapped[i * 3] = c.r;
        mapped[i * 3 + 1] = c.g;
        mapped[i * 3 + 2] = c.b;
      }

      obj.geometry.setAttribute('color', new THREE.BufferAttribute(mapped, 3));
      obj.material = makeVertexMetalMaterial(firstPaletteIndex);
    } else {
      obj.material = makeFallbackMetalMaterial(fallbackIndex);
      fallbackIndex += 1;
    }

    obj.castShadow = false;
    obj.receiveShadow = false;
  });
}

async function loadCase01GroundTruthFromParts() {
  const group = new THREE.Group();
  group.name = 'case01-ground-truth-obj-assembly';

  const parts = await Promise.all(CASE01_PARTS.map(async (meta, index) => {
    const path = `case01_parts/${meta.library}.mesh.obj`;
    const object = location.protocol === 'file:'
      ? objLoader.parse(await loadLocalPayload(path))
      : await objLoader.loadAsync(`${CASE01_COMPONENT_ROOT}/${meta.library}.mesh.obj`);
    object.name = meta.id;
    object.userData.partId = meta.id;
    object.userData.libraryId = meta.library;
    object.position.set(...meta.p);
    object.rotation.order = 'ZYX';
    object.rotation.set(meta.r[0] * DEG, meta.r[1] * DEG, meta.r[2] * DEG);

    const material = makeApprovedPartMaterial(index);
    object.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      child.material = material.clone();
      child.userData.partId = meta.id;
      child.userData.partRoot = object;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return object;
  }));

  parts.forEach((part) => group.add(part));
  group.userData.prebuiltComponents = parts;
  return group;
}

function collectIndependentComponents() {
  if (Array.isArray(modelRoot?.userData?.prebuiltComponents)) {
    componentRoots = modelRoot.userData.prebuiltComponents.slice();
    clickableMeshes = [];
    componentRoots.forEach((part) => {
      part.traverse((obj) => {
        if (obj.isMesh) clickableMeshes.push(obj);
      });
    });
    return;
  }

  const meshes = [];
  modelRoot.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });

  modelRoot.updateMatrixWorld(true);
  meshes.forEach((mesh) => {
    if (mesh.parent !== modelRoot) modelRoot.attach(mesh);
  });
  modelRoot.updateMatrixWorld(true);

  componentRoots = meshes;
  clickableMeshes = meshes.slice();
}

function preparePackedTargets() {
  if (!modelRoot || !componentRoots.length) return;

  modelRoot.updateMatrixWorld(true);
  const assemblyBox = new THREE.Box3().setFromObject(modelRoot);
  const assemblyCenterWorld = assemblyBox.getCenter(new THREE.Vector3());
  const assemblySize = assemblyBox.getSize(new THREE.Vector3());
  const maxExtent = Math.max(assemblySize.x, assemblySize.y, assemblySize.z, 1);

  const partBoxes = componentRoots.map((part) => new THREE.Box3().setFromObject(part));
  const partSizes = partBoxes.map((box) => box.getSize(new THREE.Vector3()));
  const columns = Math.max(1, Math.ceil(Math.sqrt(componentRoots.length)));
  const gapX = maxExtent * 0.025;
  const gapY = maxExtent * 0.030;

  const rows = [];
  for (let start = 0; start < componentRoots.length; start += columns) {
    const indices = [];
    for (let i = start; i < Math.min(start + columns, componentRoots.length); i += 1) indices.push(i);
    const width = indices.reduce((sum, i) => sum + partSizes[i].x, 0) + gapX * Math.max(0, indices.length - 1);
    const height = Math.max(...indices.map((i) => partSizes[i].y), 1);
    rows.push({ indices, width, height });
  }

  const totalHeight = rows.reduce((sum, row) => sum + row.height, 0) + gapY * Math.max(0, rows.length - 1);
  const slotCentersWorld = new Array(componentRoots.length);
  let yTop = assemblyCenterWorld.y + totalHeight / 2;

  rows.forEach((row) => {
    const rowCenterY = yTop - row.height / 2;
    let xCursor = assemblyCenterWorld.x - row.width / 2;

    row.indices.forEach((index) => {
      const size = partSizes[index];
      slotCentersWorld[index] = new THREE.Vector3(
        xCursor + size.x / 2,
        rowCenterY,
        assemblyCenterWorld.z
      );
      xCursor += size.x + gapX;
    });

    yTop -= row.height + gapY;
  });

  componentRoots.forEach((component, index) => {
    const partCenterWorld = partBoxes[index].getCenter(new THREE.Vector3());
    const originWorld = component.getWorldPosition(new THREE.Vector3());
    const centerOffsetWorld = partCenterWorld.clone().sub(originWorld);
    const targetOriginWorld = slotCentersWorld[index].clone().sub(centerOffsetWorld);
    const targetLocal = modelRoot.worldToLocal(targetOriginWorld.clone());

    component.userData.basePosition = component.position.clone();
    component.userData.packedPosition = targetLocal;
  });
}

function buildComponents() {
  collectIndependentComponents();
  preparePackedTargets();
  renderPartsList();
}

function componentLabel(component, index) {
  const id = component.userData?.partId || component.name || `component_${String(index + 1).padStart(2, '0')}`;
  const library = component.userData?.libraryId;
  const raw = library ? `${id} · ${library}` : id;
  return raw.length > 32 ? `${raw.slice(0, 29)}…` : raw;
}

function renderPartsList() {
  partsList.innerHTML = '';
  componentRoots.forEach((component, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'part-btn';
    btn.dataset.uuid = component.uuid;
    btn.innerHTML = `<span class="part-dot"></span><span class="part-name">${componentLabel(component, index)}</span><span class="part-lib">${String(index + 1).padStart(2, '0')}</span>`;
    btn.addEventListener('click', () => inspectComponent(component));
    partsList.appendChild(btn);
  });
  const count = componentRoots.length;
  visibleCount.textContent = `${count} piece${count === 1 ? '' : 's'} visible`;
  partsChip.textContent = `${count} PART${count === 1 ? '' : 'S'}`;
}

function cornersOfBox(box) {
  const { min, max } = box;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z)
  ];
}

function fitObject(object, { view = 'perspective', fill = 0.70 } = {}) {
  if (!object) return;
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const viewDir = (VIEW_DIRS[view] || VIEW_DIRS.perspective).clone().normalize();
  const forward = viewDir.clone().multiplyScalar(-1);
  const upReference = view === 'top' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, upReference).normalize();
  const trueUp = new THREE.Vector3().crossVectors(right, forward).normalize();

  let halfWidth = 0;
  let halfHeight = 0;
  let towardCamera = 0;
  cornersOfBox(box).forEach((corner) => {
    const rel = corner.sub(center);
    halfWidth = Math.max(halfWidth, Math.abs(rel.dot(right)));
    halfHeight = Math.max(halfHeight, Math.abs(rel.dot(trueUp)));
    towardCamera = Math.max(towardCamera, rel.dot(viewDir));
  });

  const vHalf = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const tanV = Math.tan(vHalf);
  const tanH = tanV * Math.max(camera.aspect, 0.01);
  const distanceForHeight = halfHeight / Math.max(tanV * fill, 1e-6);
  const distanceForWidth = halfWidth / Math.max(tanH * fill, 1e-6);
  const distance = Math.max(distanceForHeight, distanceForWidth, 1) + Math.max(towardCamera, 0);

  camera.up.copy(trueUp);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(viewDir, distance * 1.04);
  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = Math.max(distance * 100, 1000);
  camera.updateProjectionMatrix();
  controls.update();
}

function fitCamera(view = 'perspective') {
  fitObject(modelRoot, { view, fill: 0.70 });
}

function restoreAssemblyView() {
  selectedComponent = null;
  componentRoots.forEach((component) => { component.visible = true; });
  document.querySelectorAll('.part-btn').forEach((btn) => btn.classList.remove('active'));
  visibleCount.textContent = `${componentRoots.length} pieces visible`;
  fitCamera('perspective');
}

function inspectComponent(component) {
  if (!component) return;
  selectedComponent = component;
  componentRoots.forEach((part) => { part.visible = part === component; });
  document.querySelectorAll('.part-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uuid === component.uuid);
  });
  visibleCount.textContent = '1 piece visible';
  fitObject(component, { view: 'perspective', fill: 0.82 });
}

function applyExplosion(t) {
  if (!componentRoots.length) return;
  const u = t * t * (3 - 2 * t);
  componentRoots.forEach((component) => {
    const base = component.userData.basePosition;
    const packed = component.userData.packedPosition;
    if (!base || !packed) return;
    component.position.lerpVectors(base, packed, u);
  });
}

async function loadSelection() {
  clearError();
  const sample = manifest.samples[currentCaseIndex];
  const src = sample.results[currentModelKey];
  const useCase01ObjRenderer = currentCaseIndex === 0 && currentModelKey === 'gt';

  caseCount.textContent = `${String(currentCaseIndex + 1).padStart(2, '0')} / ${String(manifest.samples.length).padStart(2, '0')}`;
  status.textContent = `Case ${String(currentCaseIndex + 1).padStart(2, '0')} · ${MODEL_LABELS[currentModelKey]}`;
  document.querySelectorAll('.model-tab').forEach((tab) => {
    const active = tab.dataset.model === currentModelKey;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  disposeObject(modelRoot);
  removeCaseShadowFloor();
  modelRoot = null;
  componentRoots = [];
  clickableMeshes = [];
  partsList.innerHTML = '';
  visibleCount.textContent = '0 pieces visible';
  selectedComponent = null;
  explodeRange.value = '0';
  explodeValue.textContent = '0%';
  explodeCurrent = 0;
  explodeTarget = 0;

  if (!src && !useCase01ObjRenderer) {
    applyRenderProfile(false);
    viewerStage.classList.add('no-output-state');
    partsChip.textContent = 'NO OUTPUT';
    setLoading(false);
    return;
  }

  viewerStage.classList.remove('no-output-state');
  const token = ++loadToken;
  setLoading(true, `Loading Case ${String(currentCaseIndex + 1).padStart(2, '0')} · ${MODEL_LABELS[currentModelKey]}…`);

  try {
    applyRenderProfile(useCase01ObjRenderer);

    if (useCase01ObjRenderer) {
      modelRoot = await loadCase01GroundTruthFromParts();
    } else {
      let gltf;
      if (location.protocol === 'file:') {
        const encoded = await loadLocalPayload(src);
        const binary = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        gltf = await gltfLoader.parseAsync(binary.buffer, '');
      } else {
        gltf = await gltfLoader.loadAsync(`${SITE_ROOT}/${src}`);
      }
      modelRoot = gltf.scene;
      applyMetallicMaterial(modelRoot);
    }

    if (token !== loadToken) {
      disposeObject(modelRoot);
      modelRoot = null;
      return;
    }

    scene.add(modelRoot);
    buildComponents();
    if (useCase01ObjRenderer) addCaseShadowFloor(modelRoot);
    fitCamera('perspective');
    setLoading(false);
  } catch (error) {
    console.error(error);
    showError(useCase01ObjRenderer
      ? `Failed to load Case 01 component OBJ files: ${error.message}`
      : `Failed to load ${src}`);
  }
}

function switchCase(delta) {
  currentCaseIndex = (currentCaseIndex + delta + manifest.samples.length) % manifest.samples.length;
  currentModelKey = 'gt';
  loadSelection();
}

document.getElementById('prevCase').addEventListener('click', () => switchCase(-1));
document.getElementById('nextCase').addEventListener('click', () => switchCase(1));

document.querySelectorAll('.model-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    currentModelKey = tab.dataset.model;
    loadSelection();
  });
});

document.getElementById('clearSelection').addEventListener('click', restoreAssemblyView);

document.getElementById('assembleBtn').addEventListener('click', () => {
  restoreAssemblyView();
  explodeRange.value = '0';
  explodeTarget = 0;
  explodeValue.textContent = '0%';
});

document.getElementById('explodeBtn').addEventListener('click', () => {
  restoreAssemblyView();
  explodeRange.value = '100';
  explodeTarget = 1;
  explodeValue.textContent = '100%';
});

explodeRange.addEventListener('input', () => {
  if (selectedComponent) restoreAssemblyView();
  explodeTarget = Number(explodeRange.value) / 100;
  explodeValue.textContent = `${explodeRange.value}%`;
});

document.querySelectorAll('.cam-btn').forEach((button) => {
  button.addEventListener('click', () => {
    if (!modelRoot) return;
    if (selectedComponent) restoreAssemblyView();
    const view = button.dataset.view === 'fit' ? 'perspective' : button.dataset.view;
    fitCamera(view);
  });
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!modelRoot || viewerStage.classList.contains('no-output-state')) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const visibleMeshes = clickableMeshes.filter((mesh) => mesh.visible);
  const hit = raycaster.intersectObjects(visibleMeshes, false)[0];
  if (hit) inspectComponent(hit.object.userData.partRoot || hit.object);
});

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  if (modelRoot && !selectedComponent) fitCamera('perspective');
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  explodeCurrent += (explodeTarget - explodeCurrent) * 0.14;
  applyExplosion(explodeCurrent);
  controls.update();
  renderer.render(scene, camera);
}
animate();

async function boot() {
  try {
    if (location.protocol === 'file:') {
      manifest = window.__OMNICAD_LOCAL_MANIFEST;
    } else {
      const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
      manifest = await response.json();
    }
    if (!manifest?.samples?.length) throw new Error('Manifest contains no cases');
    await loadSelection();
  } catch (error) {
    console.error(error);
    showError(`Unable to load qualitative manifest: ${error.message}`);
  }
}

boot();
