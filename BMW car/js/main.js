import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildM5 } from './car.js';

const app = document.getElementById('app');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------- scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);

// Image-based lighting so the paint gets real reflections to work with.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.07).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(6.4, 2.6, 7.0);

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
// Dark mirror floor with a translucent matte sheen on top: reads like polished
// concrete in a showroom, and the sheen plane is what actually receives shadows.
const floor = new Reflector(new THREE.CircleGeometry(11, 96), {
  clipBias: 0.003,
  textureWidth: 2048,
  textureHeight: 2048,
  color: 0x15181e,
});
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const sheen = new THREE.Mesh(
  new THREE.CircleGeometry(11, 96),
  new THREE.MeshStandardMaterial({
    color: 0x0b0d10,
    roughness: 0.6,
    metalness: 0.35,
    transparent: true,
    opacity: 0.5,
  })
);
sheen.rotation.x = -Math.PI / 2;
sheen.position.y = 0.002;
sheen.receiveShadow = true;
scene.add(sheen);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0xbcd0ff, 0x0a0c10, 0.55);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 2.7);
key.position.set(5.5, 9, 5);
key.castShadow = true;
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

const rim = new THREE.DirectionalLight(0x8fb3ff, 1.2);
rim.position.set(-7, 5.5, -6.5);
scene.add(rim);

// ---------------------------------------------------------------- car
const car = buildM5();
scene.add(car.root);

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
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 600);
  }
});
