import * as THREE from 'three';

// ---------------------------------------------------------------------------
// BMW M5 — procedural build.
//
// Real F90 5-series footprint in metres, car facing +X:
// length 4.98  (x -2.62 .. 2.36)
// width  1.90  (z -0.95 .. 0.95)
// height ~1.47 (roof)
// ---------------------------------------------------------------------------

const WHEEL_Y = 0.35; // axle height (tire radius)
const WHEEL_R = 0.35;
const ARCH_R = 0.42; // wheel-arch radius in the side profile
const BODY_BOTTOM = 0.16; // rocker height
const HALF_W = 0.95; // body half width
const AXLE_F = 1.45;
const AXLE_R = -1.53;

export const PAINTS = [
  { name: 'Marina Bay Blue', hex: 0x14448f, roughness: 0.28 },
  { name: 'Black Sapphire', hex: 0x0d1016, roughness: 0.25 },
  { name: 'Isle of Man Green', hex: 0x12493a, roughness: 0.3 },
  { name: 'Toronto Red', hex: 0x8f1219, roughness: 0.3 },
  { name: 'Frozen Pure Grey', hex: 0x8b9096, roughness: 0.55 },
];

export function buildM5() {
  const root = new THREE.Group();
  root.name = 'BMW M5';

  // ------------------------------------------------------------------ paint
  const paint = new THREE.MeshPhysicalMaterial({
    color: PAINTS[0].hex,
    metalness: 0.85,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.15,
  });

  function setPaint(hex, roughness = 0.28) {
    paint.color.setHex(hex);
    paint.roughness = roughness;
    paint.clearcoat = roughness > 0.45 ? 0.15 : 1;
    paint.clearcoatRoughness = roughness > 0.45 ? 0.5 : 0.1;
  }

  // -------------------------------------------------------------- materials
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0b0f14,
    metalness: 0.0,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
  });

  const trim = new THREE.MeshStandardMaterial({
    color: 0x0b0c0e,
    metalness: 0.7,
    roughness: 0.18,
  });

  const chrome = new THREE.MeshStandardMaterial({
    color: 0xc7ccd4,
    metalness: 1.0,
    roughness: 0.22,
  });

  const carbon = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    metalness: 0.55,
    roughness: 0.42,
  });

  const rubber = new THREE.MeshStandardMaterial({
    color: 0x0d0d0f,
    metalness: 0.0,
    roughness: 0.92,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a8,
    metalness: 0.95,
    roughness: 0.32,
  });

  const discMat = new THREE.MeshStandardMaterial({
    color: 0x5b6067,
    metalness: 0.9,
    roughness: 0.45,
  });

  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0x0f6fbe, // BMW M compound brakes
    metalness: 0.5,
    roughness: 0.35,
  });

  const drlMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xdceaff,
    emissiveIntensity: 2.4,
    roughness: 0.3,
  });

  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x3a0307,
    emissive: 0xe01018,
    emissiveIntensity: 1.8,
    roughness: 0.25,
  });

  // ------------------------------------------------------------- body shell
  const bodyGeo = new THREE.ExtrudeGeometry(sideProfile(), {
    depth: 1.86,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
  });
  bodyGeo.translate(0, 0, -1.86 / 2);
  bodyGeo.computeVertexNormals();

  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  // -------------------------------------------------------------- glazing
  // Windshield + rear screen sit just proud of the shell; the side glass is
  // cut as flat trapezoids and laid onto the flanks, leaving painted pillars.
  root.add(panelBetween(0.95, 1.02, 0.35, 1.46, 1.46, 0.02, glass, 0.012));
  root.add(panelBetween(-1.05, 1.44, -1.62, 1.06, 1.42, 0.02, glass, 0.012));

  const frontWindow = new THREE.Shape([
    new THREE.Vector2(0.66, 1.055),
    new THREE.Vector2(-0.6, 1.065),
    new THREE.Vector2(-0.7, 1.435),
    new THREE.Vector2(0.32, 1.445),
  ]);
  const quarterWindow = new THREE.Shape([
    new THREE.Vector2(-0.76, 1.06),
    new THREE.Vector2(-1.29, 1.08),
    new THREE.Vector2(-1.17, 1.335),
    new THREE.Vector2(-0.76, 1.43),
  ]);

  for (const side of [1, -1]) {
    const g = new THREE.Group();
    for (const shape of [frontWindow, quarterWindow]) {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false });
      g.add(new THREE.Mesh(geo, glass));
    }
    g.position.z = side === 1 ? HALF_W - 0.005 : -HALF_W - 0.02;
    root.add(g);
  }

  // ============================================================ wheels =====
  // ========================================================= front details ==
  // ========================================================== rear details ==
  // ================================================================ trim ==

  return { root, setPaint };
}

// ---------------------------------------------------------------------------
// Side silhouette: front bumper -> underside with wheel-arch cut-outs -> tail
// -> trunk -> rear screen -> roof -> windscreen -> hood -> nose.
// ---------------------------------------------------------------------------
function sideProfile() {
  const pts = [];
  const p = (x, y) => pts.push(new THREE.Vector2(x, y));

  // sample an arch from its front edge, over the top, to its rear edge
  const arch = (cx) => {
    const dy = WHEEL_Y - BODY_BOTTOM;
    const dx = Math.sqrt(ARCH_R * ARCH_R - dy * dy);
    const a0 = Math.atan2(BODY_BOTTOM - WHEEL_Y, dx);
    const a1 = Math.PI - a0;
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      p(cx + Math.cos(a) * ARCH_R, WHEEL_Y + Math.sin(a) * ARCH_R);
    }
  };

  p(2.28, BODY_BOTTOM); // front lower corner
  arch(AXLE_F);
  arch(AXLE_R);
  p(-2.52, BODY_BOTTOM); // rear lower corner

  p(-2.6, 0.3); // rear bumper
  p(-2.62, 0.52);
  p(-2.62, 0.86);
  p(-2.6, 0.98);

  p(-2.56, 1.055); // ducktail lip
  p(-2.44, 1.045);
  p(-1.62, 1.06); // trunk deck -> rear screen base

  p(-1.05, 1.44); // rear screen
  p(-0.85, 1.458); // roof
  p(-0.2, 1.465);
  p(0.35, 1.46);

  p(0.95, 1.02); // windscreen
  p(1.55, 0.995); // hood
  p(2.1, 0.975);
  p(2.28, 0.945);

  p(2.345, 0.885); // nose
  p(2.36, 0.8);
  p(2.36, 0.62);

  p(2.35, 0.42); // front fascia
  p(2.32, 0.28);

  return new THREE.Shape(pts);
}

// A flat panel laid between two points in the side view, pushed slightly out
// along the outward normal so it does not z-fight with the body shell.
function panelBetween(x1, y1, x2, y2, width, thickness, material, offset = 0.012) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = dy / len;
  const ny = -dx / len;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, thickness, width), material);
  mesh.position.set((x1 + x2) / 2 + nx * offset, (y1 + y2) / 2 + ny * offset, 0);
  mesh.rotation.z = Math.atan2(dy, dx);
  return mesh;
}
