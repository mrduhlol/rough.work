import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { buildM5, PAINTS } from './car.js';

const app = document.getElementById('app');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------- scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);

// Image-based lighting so the paint gets real reflections to work with. Start
// with the procedural room, then swap in the CC0 studio HDRI once it loads.
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8;

new RGBELoader()
  .loadAsync('./assets/studio.hdr')
  .then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
  })
  .catch((err) => console.warn('studio HDRI failed to load', err));

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(4.7, 2.05, 5.3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.62, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3.2;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.497;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

// ---------------------------------------------------------------- studio floor
// Baked radial falloff rather than a lit plane: area lights blow a physically
// shaded floor out to white at these intensities, and this keeps the car the
// brightest thing in the frame. The soft ellipse underneath does the grounding.
RectAreaLightUniformsLib.init();

function studioFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(512, 512, 40, 512, 512, 512);
  g.addColorStop(0, '#23272e');
  g.addColorStop(0.4, '#12151a');
  g.addColorStop(0.75, '#0a0c10');
  g.addColorStop(1, '#07080a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(18, 96),
  new THREE.MeshBasicMaterial({ map: studioFloorTexture() })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

function contactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(256, 128, 10, 256, 128, 250);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(6.4, 2.6),
  new THREE.MeshBasicMaterial({
    map: contactShadowTexture(),
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    color: 0x000000,
  })
);
contact.rotation.x = -Math.PI / 2;
contact.position.y = 0.004;
scene.add(contact);

// ---------------------------------------------------------------- lights
// The HDRI does most of the work; these shape the shadow and add a cool rim.
const hemi = new THREE.HemisphereLight(0xbcd0ff, 0x0a0c10, 0.25);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff6ea, 1.2);
key.position.set(5.5, 9, 5);
key.castShadow = false;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -7;
key.shadow.camera.right = 7;
key.shadow.camera.top = 7;
key.shadow.camera.bottom = -7;
key.shadow.camera.near = 1;
key.shadow.camera.far = 26;
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.02;
key.shadow.radius = 5;
scene.add(key);

const rim = new THREE.DirectionalLight(0x9dbcff, 1.1);
rim.position.set(-7, 5.5, -6.5);
scene.add(rim);

// Long studio softboxes: broad, stretched highlights across the paint and the
// carbon roof, the way a car is lit for a press photo.
const overhead = new THREE.RectAreaLight(0xffffff, 2.4, 7, 2.2);
overhead.position.set(0, 7, 1.2);
overhead.lookAt(0, 0.8, 0);
scene.add(overhead);

const sideFill = new THREE.RectAreaLight(0xdfe8ff, 1.8, 5, 2);
sideFill.position.set(-6, 3, -4);
sideFill.lookAt(0, 0.8, 0);
scene.add(sideFill);

// ---------------------------------------------------------------- car
const car = buildM5();
scene.add(car.root);

// Debug handle: lets you drive the camera from the console.
window.__m5 = { scene, camera, controls, car };

// ---------------------------------------------------------------- controls
const paintBar = document.getElementById('paint');

PAINTS.forEach((paint, i) => {
  const swatch = document.createElement('button');
  swatch.className = i === 0 ? 'swatch active' : 'swatch';
  swatch.style.background = `#${paint.hex.toString(16).padStart(6, '0')}`;
  swatch.title = paint.name;
  swatch.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach((el) => el.classList.remove('active'));
    swatch.classList.add('active');
    car.setPaint(paint.hex, paint.roughness);
  });
  paintBar.appendChild(swatch);
});

const spinToggle = document.createElement('button');
spinToggle.className = 'toggle on';
spinToggle.textContent = 'Auto-rotate';
spinToggle.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  spinToggle.classList.toggle('on', controls.autoRotate);
});
paintBar.appendChild(spinToggle);

// ---------------------------------------------------------------- loop
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

requestAnimationFrame(() => {
  const loader = document.getElementById('loader');
  if (!loader) return;
  const hide = () => {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 600);
  };
  const timer = setInterval(() => {
    if (car.isReady()) {
      clearInterval(timer);
      hide();
    }
  }, 150);
  // Never trap the page behind the overlay if the model or the CDN stalls.
  setTimeout(() => {
    clearInterval(timer);
    if (document.getElementById('loader')) hide();
  }, 45000);
});
