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
//
// Four door shells are loose pieces inside the paint mesh, and their glass,
// handles, cards, speakers and window trim are loose pieces in neighbouring
// meshes. The rig below cuts those pieces out, groups them by door and hangs
// each group on a vertical hinge at the door's leading edge.
// ---------------------------------------------------------------------------

const PAINT_MESH = '_119_Carpaint';
const STRAY_MESH = '_099_gauge';

// Door indices are front-right, rear-right, front-left, rear-left.
const DOOR_CONFIGS = [
  { name: 'front-right', side: 1, front: true },
  { name: 'rear-right', side: 1, front: false },
  { name: 'front-left', side: -1, front: true },
  { name: 'rear-left', side: -1, front: false },
];

// The two door shells meet at the B-pillar. Triangle centroids in front of
// this world-space line belong to the front door, the rest to the rear door.
const B_PILLAR_X = -0.345;

// Meshes that carry loose door pieces. The spatial test below keeps the rest
// (seats, console, roof, body) out of the rig.
const DOOR_TRIM_MESHES = [
  'INT_BLACK',
  'INT_LEATHER1',
  'INT_LEATHER2',
  'INT_TOPLEATHER',
  'INT_ALC',
  'INT_CHRO_001',
  'INT_DOOR_CHROME',
  'DOOR_INT_LEATHERTOP',
  'int_ao2_plstic',
  'interplastic',
  'BLACKSHINY',
  'Material_72',
  'CHROMEY',
  'darkchrome',
  'mirror_001',
  'amlightsspeaker',
  'speakers__spec',
  'M_Opaque_PlasticSmoothBlack',
];

function findByName(object, needle) {
  let found = null;
  object.traverse((o) => {
    if (!found && o.isMesh && o.name.includes(needle)) found = o;
  });
  return found;
}

// Read a vertex position. Interleaved attributes can be normalized integers,
// so always go through getX/getY/getZ rather than the backing array.
function makePositionReader(attribute) {
  return (i, out) => {
    out.x = attribute.getX(i);
    out.y = attribute.getY(i);
    out.z = attribute.getZ(i);
    return out;
  };
}

// Turn a list of triangle indices into a flat index buffer.
function triangleVertexList(sourceIndex, triangles) {
  const out = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    const o = i * 3;
    if (sourceIndex) {
      out[o] = sourceIndex[t * 3];
      out[o + 1] = sourceIndex[t * 3 + 1];
      out[o + 2] = sourceIndex[t * 3 + 2];
    } else {
      out[o] = t * 3;
      out[o + 1] = t * 3 + 1;
      out[o + 2] = t * 3 + 2;
    }
  }
  return out;
}

// Clip one triangle against the world-space plane x = cut and keep the front
// or rear half. The source geometry is indexed, so each output triangle is
// emitted with its own vertices (and interpolated position/normal/UV at the
// cut) into flat arrays.
function clipTriangleToHalfSpace(vertices, cut, keepFront, output) {
  const polygon = [];
  for (let i = 0; i < 3; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % 3];
    const aIn = keepFront ? a.worldX >= cut : a.worldX <= cut;
    const bIn = keepFront ? b.worldX >= cut : b.worldX <= cut;
    if (aIn) polygon.push(a);
    if (aIn !== bIn) {
      const t = (cut - a.worldX) / (b.worldX - a.worldX);
      polygon.push({
        local: a.local.clone().lerp(b.local, t),
        normal: a.normal.clone().lerp(b.normal, t).normalize(),
        uv: a.uv.clone().lerp(b.uv, t),
        worldX: cut,
      });
    }
  }
  for (let i = 1; i < polygon.length - 1; i++) {
    output.push(polygon[0], polygon[i], polygon[i + 1]);
  }
}

function buildClippedSkinParts(mesh, skinComponents, paint, cut) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const sourceIndex = geometry.index ? geometry.index.array : null;
  const parts = [[], [], [], []];

  for (let side = 0; side < 2; side++) {
    const sideIndex = side === 0 ? 0 : 2;
    for (let front = 0; front < 2; front++) {
      const door = sideIndex + (front ? 0 : 1);
      const vertices = [];

      for (const entry of skinComponents) {
        if (entry.side !== sideIndex) continue;
        for (const t of entry.component.triangles) {
          const triangle = [];
          for (let k = 0; k < 3; k++) {
            const vi = sourceIndex ? sourceIndex[t * 3 + k] : t * 3 + k;
            const local = new THREE.Vector3(
              position.getX(vi),
              position.getY(vi),
              position.getZ(vi)
            );
            const world = local.clone().applyMatrix4(mesh.matrixWorld);
            triangle.push({
              local,
              normal: normal
                ? new THREE.Vector3(normal.getX(vi), normal.getY(vi), normal.getZ(vi))
                : new THREE.Vector3(0, 1, 0),
              uv: uv ? new THREE.Vector2(uv.getX(vi), uv.getY(vi)) : new THREE.Vector2(),
              worldX: world.x,
            });
          }
          clipTriangleToHalfSpace(triangle, cut, front === 1, vertices);
        }
      }

      if (!vertices.length) continue;

      const positions = new Float32Array(vertices.length * 3);
      const normals = new Float32Array(vertices.length * 3);
      const uvs = new Float32Array(vertices.length * 2);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        positions[i * 3] = v.local.x;
        positions[i * 3 + 1] = v.local.y;
        positions[i * 3 + 2] = v.local.z;
        normals[i * 3] = v.normal.x;
        normals[i * 3 + 1] = v.normal.y;
        normals[i * 3 + 2] = v.normal.z;
        uvs[i * 2] = v.uv.x;
        uvs[i * 2 + 1] = v.uv.y;
      }

      const partGeometry = new THREE.BufferGeometry();
      partGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      partGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      partGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      partGeometry.computeBoundingBox();
      partGeometry.computeBoundingSphere();

      const part = new THREE.Mesh(partGeometry, paint);
      part.name = `${mesh.name}__door_${door}_skin`;
      part.position.copy(mesh.position);
      part.quaternion.copy(mesh.quaternion);
      part.scale.copy(mesh.scale);
      part.matrixAutoUpdate = true;
      part.castShadow = true;
      part.receiveShadow = true;
      part.userData.doorIndex = door;
      part.userData.doorSkin = true;
      parts[door].push(part);
    }
  }

  return parts;
}

function worldBoxOfPart(part) {
  const geometry = part.geometry;
  const position = geometry.attributes.position;
  const index = geometry.index ? geometry.index.array : null;
  const count = index ? index.length : position.count;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, index ? index[i] : i);
    part.localToWorld(v);
    box.expandByPoint(v);
  }
  return box;
}

// ---------------------------------------------------------------------------
// Split the model into body + four door groups. Every door piece keeps its
// original material, except the painted shell and handles, which share the
// live paint material so the swatches still update every panel.
// ---------------------------------------------------------------------------
function buildDoorRig(root, car, body, paint) {
  const doors = new Array(DOOR_CONFIGS.length).fill(null);
  const doorMeshes = [];

  if (!body || !paint) return { doors, doorMeshes };

  root.updateMatrixWorld(true);

  const doorParts = [[], [], [], []];
  const meshes = [];
  car.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });

  for (const mesh of meshes) {
    const isPaint = mesh === body;
    const isGlass = mesh.name.includes('EXt_GLASS');
    const isTrim = DOOR_TRIM_MESHES.some((needle) => mesh.name.includes(needle));
    if (!isPaint && !isGlass && !isTrim) continue;

    const geometry = mesh.geometry;
    if (!geometry || !geometry.attributes.position) continue;
    if (geometry.userData.doorRigDone) continue;

    const position = geometry.attributes.position;
    const sourceIndex = geometry.index ? geometry.index.array : null;
    const triCount = (sourceIndex ? sourceIndex.length : position.count) / 3;
    if (!triCount) continue;

    const vertexCount = position.count;
    const parents = new Int32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) parents[i] = i;

    function find(a) {
      while (parents[a] !== a) {
        parents[a] = parents[parents[a]];
        a = parents[a];
      }
      return a;
    }
    function union(a, b) {
      a = find(a);
      b = find(b);
      if (a !== b) parents[b] = a;
    }

    const readPosition = makePositionReader(position);
    const tmp = new THREE.Vector3();
    const seen = new Map();
    for (let i = 0; i < vertexCount; i++) {
      readPosition(i, tmp);
      const key = `${Math.round(tmp.x * 1000)},${Math.round(tmp.y * 1000)},${Math.round(tmp.z * 1000)}`;
      const j = seen.get(key);
      if (j === undefined) seen.set(key, i);
      else union(i, j);
    }

    for (let t = 0; t < triCount; t++) {
      const a = sourceIndex ? sourceIndex[t * 3] : t * 3;
      const b = sourceIndex ? sourceIndex[t * 3 + 1] : t * 3 + 1;
      const c = sourceIndex ? sourceIndex[t * 3 + 2] : t * 3 + 2;
      union(a, b);
      union(b, c);
    }

    const components = new Map();
    for (let t = 0; t < triCount; t++) {
      const a = sourceIndex ? sourceIndex[t * 3] : t * 3;
      const rootVertex = find(a);
      let component = components.get(rootVertex);
      if (!component) {
        component = {
          triangles: [],
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
        };
        components.set(rootVertex, component);
      }
      component.triangles.push(t);
      for (let k = 0; k < 3; k++) {
        const vi = sourceIndex ? sourceIndex[t * 3 + k] : t * 3 + k;
        readPosition(vi, tmp);
        if (tmp.x < component.min[0]) component.min[0] = tmp.x;
        if (tmp.y < component.min[1]) component.min[1] = tmp.y;
        if (tmp.z < component.min[2]) component.min[2] = tmp.z;
        if (tmp.x > component.max[0]) component.max[0] = tmp.x;
        if (tmp.y > component.max[1]) component.max[1] = tmp.y;
        if (tmp.z > component.max[2]) component.max[2] = tmp.z;
      }
    }

    const worldBox = (min, max) => {
      let wMinX = Infinity, wMinY = Infinity, wMinZ = Infinity;
      let wMaxX = -Infinity, wMaxY = -Infinity, wMaxZ = -Infinity;
      for (let i = 0; i < 8; i++) {
        tmp.set(
          i & 1 ? max[0] : min[0],
          i & 2 ? max[1] : min[1],
          i & 4 ? max[2] : min[2]
        );
        mesh.localToWorld(tmp);
        if (tmp.x < wMinX) wMinX = tmp.x;
        if (tmp.y < wMinY) wMinY = tmp.y;
        if (tmp.z < wMinZ) wMinZ = tmp.z;
        if (tmp.x > wMaxX) wMaxX = tmp.x;
        if (tmp.y > wMaxY) wMaxY = tmp.y;
        if (tmp.z > wMaxZ) wMaxZ = tmp.z;
      }
      return {
        center: [(wMinX + wMaxX) / 2, (wMinY + wMaxY) / 2, (wMinZ + wMaxZ) / 2],
        size: [wMaxX - wMinX, wMaxY - wMinY, wMaxZ - wMinZ],
      };
    };

    const assigned = new Uint8Array(triCount).fill(255);
    const skinComponents = [];

    for (const component of components.values()) {
      const world = worldBox(component.min, component.max);
      const [cx, cy, cz] = world.center;
      const [sx, sy, sz] = world.size;
      const absZ = Math.abs(cz);
      let mode = null;

      if (isPaint) {
        // The two large loose skins and the four painted handles.
        if (
          component.triangles.length >= 700 &&
          component.triangles.length <= 800 &&
          sx > 1.5 &&
          sy > 0.6 &&
          sy < 0.9 &&
          absZ > 0.8
        ) {
          mode = 'skin';
        } else if (
          component.triangles.length >= 200 &&
          component.triangles.length <= 400 &&
          sx < 0.4 &&
          sy < 0.12 &&
          absZ > 0.85
        ) {
          mode = 'handle';
        }
      } else if (isGlass) {
        // Door windows, quarter lights and the mirror glass. The windscreen,
        // rear screen, headlights and tail lights are much wider or lower.
        if (absZ > 0.5 && cy > 0.9 && sx < 1.0 && sz < 0.4) mode = 'glass';
      } else {
        // Loose interior/exterior trim on the doors, but not the seats,
        // console, roof, sills or body shell.
        if (absZ < 0.55 || absZ > 0.99) continue;
        if (cx < -1.5 || cx > 1.1) continue;
        if (cy < 0.3 || cy > 1.25) continue;
        if (sx > 1.7 || sy > 1.1 || sz > 0.5) continue;
        mode = 'trim';
      }

      if (!mode) continue;

      const side = cz > 0 ? 0 : 2;

      if (mode === 'skin') {
        // The two big skins run straight through the B-pillar with no seam.
        // Mark them out of the body, then cut them along a clean vertical
        // plane when the clipped parts are built below.
        skinComponents.push({ component, side });
        for (const t of component.triangles) assigned[t] = 200;
        continue;
      }

      const spansBothDoors = (mode === 'trim' || mode === 'glass') && sx > 1.5;

      if (spansBothDoors) {
        // Belts and window seals can run through both doors. Assign each
        // triangle by its world-space centroid.
        for (const t of component.triangles) {
          let wx = 0;
          for (let k = 0; k < 3; k++) {
            const vi = sourceIndex ? sourceIndex[t * 3 + k] : t * 3 + k;
            readPosition(vi, tmp);
            mesh.localToWorld(tmp);
            wx += tmp.x;
          }
          const front = wx / 3 > B_PILLAR_X;
          assigned[t] = side + (front ? 0 : 1);
        }
      } else {
        const front = cx > B_PILLAR_X;
        const door = side + (front ? 0 : 1);
        for (const t of component.triangles) assigned[t] = door;
      }
    }

    let hasClippedSkin = false;
    if (skinComponents.length) {
      const clipped = buildClippedSkinParts(mesh, skinComponents, paint, B_PILLAR_X);
      for (let door = 0; door < 4; door++) {
        for (const part of clipped[door]) {
          mesh.parent.add(part);
          doorParts[door].push(part);
          hasClippedSkin = true;
        }
      }
    }

    const doorTriangles = [[], [], [], []];
    const keep = [];
    for (let t = 0; t < triCount; t++) {
      const door = assigned[t];
      if (door === 255) keep.push(t);
      else if (door < 4) doorTriangles[door].push(t);
    }
    if (!doorTriangles.some((list) => list.length) && !hasClippedSkin) continue;

    for (let door = 0; door < 4; door++) {
      const triangles = doorTriangles[door];
      if (!triangles.length) continue;

      const indices = triangleVertexList(sourceIndex, triangles);
      const partGeometry = new THREE.BufferGeometry();
      for (const key of Object.keys(geometry.attributes)) {
        partGeometry.setAttribute(key, geometry.attributes[key]);
      }
      partGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

      // BufferGeometry's built-in bounds use every vertex in the shared
      // attributes, so compute bounds from this door's index instead.
      const bounds = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i < indices.length; i++) {
        v.fromBufferAttribute(position, indices[i]);
        bounds.expandByPoint(v);
      }
      partGeometry.boundingBox = bounds;
      partGeometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());

      const material = isPaint
        ? paint
        : Array.isArray(mesh.material)
          ? mesh.material[0]
          : mesh.material;
      const part = new THREE.Mesh(partGeometry, material);
      part.name = `${mesh.name}__door_${door}`;
      part.position.copy(mesh.position);
      part.quaternion.copy(mesh.quaternion);
      part.scale.copy(mesh.scale);
      part.matrixAutoUpdate = true;
      part.castShadow = true;
      part.receiveShadow = true;
      part.userData.doorIndex = door;
      mesh.parent.add(part);
      doorParts[door].push(part);
    }

    const keepIndices = triangleVertexList(sourceIndex, keep);
    if (keepIndices.length) {
      geometry.setIndex(new THREE.BufferAttribute(keepIndices, 1));
      geometry.clearGroups();
      geometry.setDrawRange(0, keepIndices.length);
    } else {
      mesh.visible = false;
    }
    geometry.userData.doorRigDone = true;
  }

  root.updateMatrixWorld(true);

  for (let i = 0; i < DOOR_CONFIGS.length; i++) {
    const config = DOOR_CONFIGS[i];
    const parts = doorParts[i];
    if (!parts.length) continue;

    const paintPart = parts.find((part) => part.userData.doorSkin);
    let doorBox = paintPart ? worldBoxOfPart(paintPart) : new THREE.Box3();
    if (!paintPart) {
      for (const part of parts) doorBox.union(worldBoxOfPart(part));
    }
    if (doorBox.isEmpty()) continue;

    // Hinge at the leading edge, just inboard of the outer skin. The pivot is
    // a child of the root, so its Y axis is the showroom's vertical axis.
    const hinge = new THREE.Vector3(doorBox.max.x - 0.01, 0.7, config.side * 0.84);
    const pivot = new THREE.Group();
    pivot.name = `door-${config.name}`;
    pivot.position.copy(root.worldToLocal(hinge.clone()));
    root.add(pivot);
    pivot.updateMatrixWorld(true);

    for (const part of parts) pivot.attach(part);
    pivot.rotation.y = 0;
    pivot.updateMatrixWorld(true);

    doors[i] = {
      name: config.name,
      pivot,
      parts,
      openAngle: config.side * (config.front ? 1.05 : 0.98),
      angle: 0,
      target: 0,
      tween: null,
    };
    doorMeshes.push(...parts);
  }

  root.updateMatrixWorld(true);
  return { doors, doorMeshes };
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
  let doors = [];
  let doorMeshes = [];

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
      car.updateMatrixWorld(true);

      try {
        const rig = buildDoorRig(root, car, body, paint);
        doors = rig.doors;
        doorMeshes = rig.doorMeshes;
      } catch (err) {
        console.error('M5 door rig failed', err);
      }

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

  function toggleDoor(index) {
    const door = doors[index];
    if (!door) return;
    const target = Math.abs(door.target) > 0.01 ? 0 : door.openAngle;
    door.target = target;
    door.tween = {
      from: door.angle,
      to: target,
      start: performance.now(),
      duration: 900,
    };
  }

  function updateDoors(now) {
    for (const door of doors) {
      if (!door) continue;
      const tween = door.tween;
      if (!tween) continue;
      const t = Math.min(1, (now - tween.start) / tween.duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      door.angle = tween.from + (tween.to - tween.from) * eased;
      door.pivot.rotation.y = door.angle;
      if (t >= 1) {
        door.angle = tween.to;
        door.pivot.rotation.y = door.angle;
        door.tween = null;
      }
    }
  }

  function isDoorOpen(index) {
    const door = doors[index];
    return !!door && Math.abs(door.target) > 0.01;
  }

  return {
    root,
    setPaint,
    isReady: () => ready,
    get doors() {
      return doors;
    },
    get doorMeshes() {
      return doorMeshes;
    },
    toggleDoor,
    updateDoors,
    isDoorOpen,
  };
}
