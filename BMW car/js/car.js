import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ---------------------------------------------------------------------------
// BMW M5 (F90) — showroom build.
//
// The car is a CC-BY-4.0 model (see README for attribution) loaded from
// ./assets/bmw_m5.glb. We keep its full interior, carbon roof, brakes and
// badges, and only swap the outer skin onto a physical paint material so the
// colour swatches work. The model is 1:1 (4.95 x 1.90 x 1.48 m), Y-up, front
// toward +Z, so it is rotated a quarter turn to face +X like the camera rig
// expects.
// ---------------------------------------------------------------------------

const PAINT_MESH = '_119_Carpaint';
const STRAY_MESH = '_099_gauge';

function findByName(object, needle) {
  let found = null;
  object.traverse((o) => {
    if (!found && o.isMesh && o.name.includes(needle)) found = o;
  });
  return found;
}

export const PAINTS = [
  { name: 'Marina Bay Blue', hex: 0x174a8c, roughness: 0.26 },
  { name: 'Black Sapphire', hex: 0x0d1016, roughness: 0.2 },
  { name: 'Isle of Man Green', hex: 0x12493a, roughness: 0.24 },
  { name: 'Toronto Red', hex: 0x8f1219, roughness: 0.24 },
  { name: 'Frozen Pure Grey', hex: 0x8b9096, roughness: 0.5 },
];

export function buildM5() {
  const root = new THREE.Group();
  let paint = null;
  let paintState = { hex: PAINTS[0].hex, roughness: PAINTS[0].roughness };
  let ready = false;

  function applyPaint() {
    if (!paint) return;
    paint.color.setHex(paintState.hex);
    paint.roughness = paintState.roughness;
    paint.clearcoat = paintState.roughness > 0.42 ? 0.25 : 1;
    paint.clearcoatRoughness = paintState.roughness > 0.42 ? 0.4 : 0.045;
  }

  new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .load(
    './assets/bmw_m5.glb',
    (gltf) => {
      const car = gltf.scene;
      car.rotation.y = Math.PI / 2;

      // One degenerate instrument-cluster mesh sits 8 m behind the car and
      // otherwise blows up the bounding box. Drop it before measuring.
      const stray = findByName(car, STRAY_MESH);
      if (stray) stray.removeFromParent();

      car.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m) return;
          if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.0;
          // Lights are modelled but not switched on; a showroom car has its
          // DRLs lit, and the rear lamps catch a little red.
          if (m.name.includes('LightEmissiveA')) {
            m.emissive.setHex(0xe8f2ff);
            m.emissiveIntensity = 1.2;
          }
          if (m.name === 'reartail') {
            m.emissive.setHex(0x9a0303);
            m.emissiveIntensity = 2;
          }
        });
      });

      const body = findByName(car, PAINT_MESH);
      if (body) {
        const old = body.material;
        paint = new THREE.MeshPhysicalMaterial({
          color: paintState.hex,
          metalness: 0.68,
          roughness: paintState.roughness,
          clearcoat: 1,
          clearcoatRoughness: 0.045,
          envMapIntensity: 1.35,
        });
        if (old && old.normalMap) {
          paint.normalMap = old.normalMap;
          paint.normalScale.copy(old.normalScale);
        }
        body.material = paint;
        applyPaint();
      }

      car.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(car);
      const center = box.getCenter(new THREE.Vector3());
      car.position.x -= center.x;
      car.position.z -= center.z;
      car.position.y -= box.min.y;

      root.add(car);
      ready = true;
      root.dispatchEvent({ type: 'ready' });
    },
    undefined,
    (err) => {
      console.error('M5 model failed to load', err);
      root.dispatchEvent({ type: 'error' });
    }
  );

  function setPaint(hex, roughness = PAINTS[0].roughness) {
    paintState = { hex, roughness };
    applyPaint();
  }

  return {
    root,
    setPaint,
    isReady: () => ready,
  };
}
