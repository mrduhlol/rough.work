import * as THREE from 'three';

// ---------------------------------------------------------------------------
// BMW M5 — procedural build.
//
// Real F90 5-series footprint in metres, car facing +X:
// length 4.98  (x -2.62 .. 2.36)
// width  1.90  (z -0.95 .. 0.95)
// height ~1.47 (roof)
// ---------------------------------------------------------------------------

const WHEEL_Y = 0.37; // axle height (tire radius)
const WHEEL_R = 0.37;
const ARCH_R = 0.435; // wheel-arch radius in the side profile
const BODY_BOTTOM = 0.16; // rocker height
const HALF_W = 0.95; // body half width
const AXLE_F = 1.45;
const AXLE_R = -1.53;

export const PAINTS = [
  { name: 'Marina Bay Blue', hex: 0x1a55ab, roughness: 0.28 },
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
    color: 0x030406,
    metalness: 0.0,
    roughness: 0.5,
    clearcoat: 0.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.05,
  });

  const tailGlass = new THREE.MeshPhysicalMaterial({
    color: 0x120204,
    metalness: 0.0,
    roughness: 0.08,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.4,
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
    color: 0x08090b,
    metalness: 0.15,
    roughness: 0.5,
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
    side: THREE.DoubleSide,
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
    bevelSize: 0.012,
    bevelSegments: 3,
  });
  bodyGeo.translate(0, 0, -1.86 / 2);
  bodyGeo.computeVertexNormals();

  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  // Dark floor pan, so the mirror floor reflects a proper underbody.
  const floorPan = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.02, 1.28), trim);
  floorPan.position.set(0, 0.15, 0);
  root.add(floorPan);

  // -------------------------------------------------------------- glazing
  // Windshield + rear screen sit just proud of the shell; the side glass is
  // cut as flat trapezoids and laid onto the flanks, leaving painted pillars.
  root.add(panelBetween(0.94, 1.03, 0.36, 1.452, 1.4, 0.02, glass, 0.016));
  root.add(panelBetween(-1.06, 1.43, -1.6, 1.07, 1.36, 0.02, glass, 0.016));

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

  // ---------------------------------------------------------------- wheels
  function buildWheel(isFront) {
    const wheel = new THREE.Group();

    // Tire: tread band with two rounded shoulders closing the sidewalls.
    const tread = new THREE.Mesh(
      new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.11, 64, 1, true),
      rubber
    );
    tread.rotation.x = Math.PI / 2;
    tread.castShadow = true;
    wheel.add(tread);

    for (const zs of [1, -1]) {
      const shoulder = new THREE.Mesh(
        new THREE.TorusGeometry(WHEEL_R - 0.066, 0.066, 20, 64),
        rubber
      );
      shoulder.position.z = zs * 0.069;
      shoulder.castShadow = true;
      wheel.add(shoulder);
    }

    // Rim barrel + outer lip.
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.228, 0.228, 0.24, 40, 1, true),
      rimMat
    );
    barrel.rotation.x = Math.PI / 2;
    wheel.add(barrel);

    for (const zs of [1, -1]) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.222, 0.014, 12, 64), rimMat);
      lip.position.z = zs * 0.108;
      wheel.add(lip);
    }

    // 705M-style double-spoke face: five pairs of spokes.
    for (let i = 0; i < 5; i++) {
      const base = (i * Math.PI * 2) / 5;
      for (const offset of [-0.1, 0.1]) {
        const a = base + offset;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.185, 0.028), rimMat);
        spoke.position.set(Math.cos(a) * 0.135, Math.sin(a) * 0.135, 0.1);
        spoke.rotation.z = a - Math.PI / 2;
        wheel.add(spoke);
      }
    }

    // Hub.
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 32), rimMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.1;
    wheel.add(hub);

    // Brake disc + M caliper, visible through the spokes.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(isFront ? 0.185 : 0.17, isFront ? 0.185 : 0.17, 0.022, 40),
      discMat
    );
    disc.rotation.x = Math.PI / 2;
    disc.position.z = 0.045;
    wheel.add(disc);

    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.055), caliperMat);
    const caliperAngle = -0.6;
    caliper.position.set(
      Math.cos(caliperAngle) * 0.115,
      Math.sin(caliperAngle) * 0.115,
      0.045
    );
    caliper.rotation.z = caliperAngle;
    wheel.add(caliper);

    return wheel;
  }

  for (const [x, side] of [
    [AXLE_F, 1],
    [AXLE_R, 1],
    [AXLE_F, -1],
    [AXLE_R, -1],
  ]) {
    const wheel = buildWheel(x === AXLE_F);
    wheel.position.set(x, WHEEL_Y, side * 0.8);
    if (side === -1) wheel.rotation.y = Math.PI;
    root.add(wheel);
  }

  // ---------------------------------------------------------- front details
  // Twin kidney grille: two tall rounded-rect frames with satin slats.
  {
    const outer = roundedRectShape(0.33, 0.42, 0.06);
    const inner = roundedRectShape(0.27, 0.36, 0.04);
    outer.holes.push(inner);
    const frameGeo = new THREE.ExtrudeGeometry(outer, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 2,
    });

    for (const side of [1, -1]) {
      const frame = new THREE.Mesh(frameGeo, trim);
      frame.rotation.y = Math.PI / 2;
      frame.position.set(2.33, 0.63, side * 0.185);
      root.add(frame);

      for (const off of [-0.09, -0.03, 0.03, 0.09]) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.36, 0.02), chrome);
        slat.position.set(2.362, 0.63, side * 0.185 + off);
        root.add(slat);
      }
    }
  }

  // Headlights: wide housings, projector lens, two angled DRL bars.
  for (const side of [1, -1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.4), glass);
    housing.position.set(2.315, 0.8, side * 0.56);
    root.add(housing);

    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.014, 24), chrome);
    lens.rotation.z = Math.PI / 2;
    lens.position.set(2.376, 0.78, side * 0.6);
    root.add(lens);

    for (const [dy, tilt] of [
      [0.04, 0.28],
      [-0.005, -0.28],
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.2), drlMat);
      bar.position.set(2.377, 0.8 + dy, side * 0.56);
      bar.rotation.x = tilt;
      root.add(bar);
    }
  }

  // Bumper intakes and front splitter.
  for (const side of [1, -1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.17, 0.26), trim);
    intake.position.set(2.33, 0.4, side * 0.6);
    intake.rotation.y = side * -0.15;
    root.add(intake);
  }
  const centerIntake = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.62), trim);
  centerIntake.position.set(2.34, 0.37, 0);
  root.add(centerIntake);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 1.36), trim);
  splitter.position.set(2.315, 0.175, 0);
  root.add(splitter);

  // ----------------------------------------------------------- rear details
  for (const side of [1, -1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.46), tailGlass);
    housing.position.set(-2.605, 0.8, side * 0.55);
    root.add(housing);

    // Slim twin LED bars.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.4), tailMat);
    bar.position.set(-2.638, 0.84, side * 0.55);
    root.add(bar);

    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.28), tailMat);
    bar2.position.set(-2.638, 0.765, side * 0.58);
    root.add(bar2);
  }

  // Trunk lip spoiler.
  {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.028, 1.3), carbon);
    lip.position.set(-2.5, 1.062, 0);
    root.add(lip);
  }

  // Quad exhaust tips.
  for (const z of [0.6, 0.475, -0.6, -0.475]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 24), chrome);
    tip.rotation.z = Math.PI / 2;
    tip.position.set(-2.645, 0.27, z);
    root.add(tip);
  }

  // Diffuser with fins.
  {
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 1.1), trim);
    diffuser.position.set(-2.585, 0.19, 0);
    root.add(diffuser);
    for (const z of [-0.28, 0, 0.28]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.02), trim);
      fin.position.set(-2.585, 0.19, z);
      root.add(fin);
    }
  }

  // Black valance tying the tail into the diffuser.
  const valance = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 1.35), trim);
  valance.position.set(-2.615, 0.34, 0);
  root.add(valance);

  // ---------------------------------------------------------------- trim
  // Wheel-arch lips that follow the arch opening.
  {
    const dy = WHEEL_Y - BODY_BOTTOM;
    const archStart = Math.atan2(BODY_BOTTOM - WHEEL_Y, Math.sqrt(ARCH_R * ARCH_R - dy * dy));
    const lipArc = Math.PI - 2 * archStart;
    const lipGeo = new THREE.TorusGeometry(ARCH_R + 0.004, 0.02, 10, 48, lipArc);

    for (const x of [AXLE_F, AXLE_R]) {
      for (const side of [1, -1]) {
        const lip = new THREE.Mesh(lipGeo, paint);
        lip.position.set(x, WHEEL_Y, side * 0.945);
        lip.rotation.z = archStart;
        root.add(lip);
      }
    }
  }

  // M mirrors on stalks.
  for (const side of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.12), trim);
    arm.position.set(0.74, 1.02, side * 0.99);
    root.add(arm);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.075, 0.12), paint);
    cap.position.set(0.72, 1.055, side * 1.06);
    cap.rotation.z = 0.06;
    cap.rotation.y = side * 0.12;
    root.add(cap);
  }

  // Side skirts.
  for (const side of [1, -1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.08, 0.04), trim);
    skirt.position.set(0, 0.19, side * 0.955);
    root.add(skirt);
  }

  // Door shut lines.
  for (const side of [1, -1]) {
    for (const x of [0.62, -0.3, -1.06]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.66, 0.006), trim);
      line.position.set(x, 0.6, side * 0.951);
      root.add(line);
    }
  }

  // Door handles.
  for (const side of [1, -1]) {
    for (const x of [-0.05, -0.75]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.015), chrome);
      handle.position.set(x, 0.92, side * 0.955);
      root.add(handle);
    }
  }

  // M badge on each front fender: three slanted stripes.
  {
    const stripeColors = [0x2f9fe0, 0x15559e, 0xcf1020];
    const stripeGeo = new THREE.BoxGeometry(0.018, 0.05, 0.004);
    for (const side of [1, -1]) {
      stripeColors.forEach((hex, i) => {
        const stripe = new THREE.Mesh(
          stripeGeo,
          new THREE.MeshStandardMaterial({ color: hex, metalness: 0.4, roughness: 0.3 })
        );
        stripe.position.set(0.55 + i * 0.024, 0.9, side * 0.953);
        stripe.rotation.z = -0.35;
        root.add(stripe);
      });
    }
  }

  // Carbon roof panel, following the roof line.
  {
    const lift = 0.014;

    const roof = new THREE.Shape();
    roof.moveTo(-1.05, 1.44 + lift);
    roof.lineTo(-0.85, 1.458 + lift);
    roof.lineTo(-0.2, 1.465 + lift);
    roof.lineTo(0.35, 1.46 + lift);
    roof.lineTo(0.35, 1.472 + lift);
    roof.lineTo(-0.2, 1.477 + lift);
    roof.lineTo(-0.85, 1.47 + lift);
    roof.lineTo(-1.05, 1.452 + lift);
    roof.closePath();

    const roofGeo = new THREE.ExtrudeGeometry(roof, { depth: 1.46, bevelEnabled: false });
    roofGeo.translate(0, 0, -0.73);
    root.add(new THREE.Mesh(roofGeo, carbon));
  }

  // BMW roundels on the hood and boot.
  const hoodRoundel = makeRoundel();
  hoodRoundel.rotation.x = -Math.PI / 2;
  hoodRoundel.position.set(2.02, 0.995, 0);
  root.add(hoodRoundel);

  const bootRoundel = makeRoundel();
  bootRoundel.rotation.y = -Math.PI / 2;
  bootRoundel.position.set(-2.641, 0.93, 0);
  root.add(bootRoundel);

  // M5 badge on the boot lid.
  {
    const tex = textTexture('M5');
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.07),
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        metalness: 0.85,
        roughness: 0.3,
      })
    );
    badge.rotation.y = -Math.PI / 2;
    badge.position.set(-2.643, 0.9, -0.52);
    root.add(badge);
  }

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

// BMW roundel: white disc, alternating blue quarters, chrome ring.
function makeRoundel() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 0.1, roughness: 0.35 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x0b62b0, metalness: 0.3, roughness: 0.35 });

  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.052, 32), white));
  for (const start of [Math.PI / 2, Math.PI * 1.5]) {
    const quarter = new THREE.Mesh(new THREE.CircleGeometry(0.052, 16, start, Math.PI / 2), blue);
    quarter.position.z = 0.001;
    g.add(quarter);
  }
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xc7ccd4, metalness: 1, roughness: 0.22 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.007, 8, 32), ringMat);
  ring.position.z = 0.004;
  g.add(ring);
  return g;
}

function textTexture(text, width = 256, height = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 76px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Rounded rectangle centred on the origin, for grille frames and the like.
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
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
