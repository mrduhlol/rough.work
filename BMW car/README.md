# BMW M5 (F90) — Three.js Showroom

A real-time showroom for an F90 BMW M5, built with Three.js. A detailed car
model — full interior, carbon roof, brakes, badges — sits under studio area
lights with an HDRI reflection pass and five switchable BMW paint finishes.

## Run it

ES modules need to be served over HTTP (opening `index.html` directly will not
work in most browsers):

```sh
cd "BMW car"
python3 -m http.server 8137
```

Then open <http://localhost:8137/>. Three.js itself loads from the jsDelivr CDN,
so the page needs an internet connection. The car model and HDRI are local.

## Controls

- **Drag** — orbit
- **Scroll** — zoom
- **Right-drag** — pan
- Paint swatches (bottom right) switch between Marina Bay Blue, Black Sapphire,
  Isle of Man Green, Toronto Red and Frozen Pure Grey
- **Auto-rotate** toggles the turntable

## How it is built

| File            | What it does                                                  |
| --------------- | ------------------------------------------------------------- |
| `index.html`    | Page shell, HUD, import map                                   |
| `js/main.js`    | Renderer, HDRI, studio lights, floor, controls, paint swatches |
| `js/car.js`     | GLB loading, mesh clean-up, paint material, light emissives    |

- The car is `assets/bmw_m5.glb`, a full F90 M5 at 1:1 scale
  (4.95 × 1.90 × 1.48 m). It was optimized from a 38 MB source with
  `gltf-transform weld` and `meshopt --level high` to ~13 MB, so `car.js`
  installs the `MeshoptDecoder` before loading.
- The model keeps its interior, carbon roof, brakes and badges. Only the outer
  `_119_Carpaint` skin is replaced with a `MeshPhysicalMaterial` so the paint
  swatches can recolour it. One stray instrument-cluster mesh is removed
  because it sits 8 m behind the car and otherwise blows up the bounding box.
- `assets/studio.hdr` is a Poly Haven studio HDRI, used for reflections with
  `RoomEnvironment` as a fallback.
- Lighting is a soft key/rim pair plus an overhead and a side `RectAreaLight`.
  The floor is an unlit radial gradient with a baked contact-shadow ellipse:
  a physically lit floor is blown out by the area lights at these intensities,
  and the gradient keeps the car the brightest thing in the frame.

`window.__m5` exposes `{ scene, camera, controls, car }` for tinkering from the
browser console.

## Credits

- **BMW M5 F90** by RES1N — [Sketchfab](https://sketchfab.com/3d-models/bmw-m5-f90-5478e978bd634337adc8e3dc413fbfa3) — CC-BY-4.0.
- **Studio HDRI** from [Poly Haven](https://polyhaven.com/a/studio_small_03) — CC0.

![preview](preview.png)
