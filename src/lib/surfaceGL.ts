// A WebGL (three.js) version of the 3D surface: smooth lighting, a wire mesh, a floor and labels. Same interface as the canvas
// version in surface3d.ts, which stays as the fallback when WebGL is unavailable. Renders only when something changes.
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  MeshBasicMaterial,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import type { SurfaceData } from "./surface3d.ts";

const SX = 2; // world width of the x axis
const SY = 1.1; // world depth of the y axis
const SH = 0.62; // world height of the tallest point
const FONT = '500 26px "Geist Variable", system-ui, sans-serif';

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createSurfaceGL(canvas: HTMLCanvasElement, initial: SurfaceData, reduced: boolean, opts: { bare?: boolean } = {}) {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  let data = initial;
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 50);
  const world = new Group();
  scene.add(world);
  scene.add(new AmbientLight(0xffffff, 0.85));
  const key = new DirectionalLight(0xffffff, 2.1);
  key.position.set(-1.6, 2.2, 2.4);
  scene.add(key);
  const rim = new DirectionalLight(0xffffff, 0.7);
  rim.position.set(2, 1, -2);
  scene.add(rim);

  const home = { yaw: 0.5, pitch: 0.62 };
  let yaw = home.yaw;
  let pitch = home.pitch;
  let bias = 0;
  let amp = 1; // vertical scale of the surface
  let zoom = 1; // camera distance factor
  let frame = 0;

  let mesh: Mesh | null = null;
  let wire: LineSegments | null = null;
  let dims = "";
  const floor = new Mesh(new PlaneGeometry(SX * 1.18, SY * 1.3), new MeshBasicMaterial({ transparent: true, opacity: 0.55, side: DoubleSide }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.004;
  world.add(floor);
  const grid = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ transparent: true, opacity: 0.4 }));
  world.add(grid);
  const axis = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ transparent: true, opacity: 0.55 }));
  world.add(axis);
  const labels = new Group();
  world.add(labels);

  const colours = () => {
    const accent = new Color(token("--accent"));
    const tone = new Color(token("--tone"));
    return { accent, low: tone.clone().lerp(accent, 0.2), tone, ink: new Color(token("--ink-3")) };
  };

  const text = (s: string, colour: Color, x: number, y: number, z: number, align: "left" | "right" | "center" = "center") => {
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    g.font = FONT;
    const w = Math.ceil(g.measureText(s).width) + 12;
    c.width = w;
    c.height = 44;
    g.font = FONT;
    g.fillStyle = `#${colour.getHexString()}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText(s, 6, 23);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    const sp = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const hgt = 0.095;
    sp.scale.set((w / 44) * hgt, hgt, 1);
    sp.center.set(align === "left" ? 0 : align === "right" ? 1 : 0.5, 0.5);
    sp.position.set(x, y, z);
    sp.renderOrder = 10;
    labels.add(sp);
  };

  const heightOf = (v: number) => ((v - data.min) / (data.max - data.min || 1)) * SH;

  const build = () => {
    const rows = data.z.length;
    const cols = data.z[0].length;
    const c = colours();
    (floor.material as MeshBasicMaterial).color.copy(c.tone);
    (grid.material as LineBasicMaterial).color.copy(c.ink);
    (axis.material as LineBasicMaterial).color.copy(c.ink);

    const key2 = `${rows}x${cols}`;
    const n = rows * cols;
    if (!mesh || key2 !== dims) {
      mesh?.geometry.dispose();
      wire?.geometry.dispose();
      if (mesh) world.remove(mesh);
      if (wire) world.remove(wire);
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute("color", new BufferAttribute(new Float32Array(n * 3), 3));
      const idx: number[] = [];
      for (let j = 0; j < rows - 1; j++)
        for (let i = 0; i < cols - 1; i++) {
          const a = j * cols + i;
          idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      geo.setIndex(idx);
      mesh = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: DoubleSide }));
      world.add(mesh);
      const lg = new BufferGeometry();
      const pairs: number[] = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols - 1; i++) pairs.push(j * cols + i, j * cols + i + 1);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows - 1; j++) pairs.push(j * cols + i, (j + 1) * cols + i);
      lg.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
      lg.setIndex(pairs);
      wire = new LineSegments(lg, new LineBasicMaterial({ transparent: true, opacity: 0.28 }));
      world.add(wire);
      dims = key2;
    }
    const pos = (mesh.geometry.getAttribute("position") as BufferAttribute);
    const col = (mesh.geometry.getAttribute("color") as BufferAttribute);
    const wpos = (wire!.geometry.getAttribute("position") as BufferAttribute);
    const hy = SY / 2;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const x = -SX / 2 + (i / (cols - 1)) * SX;
        const z = -hy + (j / (rows - 1)) * SY;
        const h = heightOf(data.z[j][i]);
        pos.setXYZ(k, x, h, z);
        wpos.setXYZ(k, x, h + 0.003, z);
        const t = Math.pow(h / SH, 0.9);
        const cc = c.low.clone().lerp(c.accent, t);
        col.setXYZ(k, cc.r, cc.g, cc.b);
      }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    wpos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    (wire!.material as LineBasicMaterial).color.copy(c.accent).lerp(new Color(0xffffff), 0.15);

    // Floor grid and the vertical axis at the back left corner.
    const gp: number[] = [];
    const fx = SX * 0.59;
    const fz = SY * 0.65;
    for (let n2 = 1; n2 < 5; n2++) {
      const a = -SX / 2 + (n2 * SX) / 5;
      const b = -hy + (n2 * SY) / 5;
      gp.push(a, 0, -fz, a, 0, fz, -fx, 0, b, fx, 0, b);
    }
    grid.geometry.setAttribute("position", new BufferAttribute(new Float32Array(gp), 3));
    const ax = -SX / 2 - 0.06;
    const az = -hy - 0.06;
    const ap = [ax, 0, az, ax, SH, az];
    for (const f of [0, 0.5, 1]) ap.push(ax, SH * f, az, ax - 0.04, SH * f, az);
    axis.geometry.setAttribute("position", new BufferAttribute(new Float32Array(ap), 3));

    // Labels (left out in the bare mode used behind the scroll story).
    grid.visible = !opts.bare;
    axis.visible = !opts.bare;
    floor.visible = !opts.bare;
    while (labels.children.length) {
      const s = labels.children[0] as Sprite;
      (s.material as SpriteMaterial).map?.dispose();
      s.material.dispose();
      labels.remove(s);
    }
    if (opts.bare) return;
    const span = data.max - data.min;
    for (const f of [0, 0.5, 1]) text(`${(data.min + span * f).toFixed(0)}${data.unit}`, c.ink, ax - 0.07, SH * f, az, "right");
    text(data.xLabels[0], c.ink, -SX / 2 + 0.2, 0, hy + 0.16);
    text(data.xLabels[1], c.ink, SX / 2 - 0.2, 0, hy + 0.16);
    text(data.yLabels[0], c.ink, SX / 2 + 0.2, 0, -hy * 0.8, "left");
    text(data.yLabels[1], c.ink, SX / 2 + 0.2, 0, hy * 0.8, "left");
  };
  build();

  const place = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull the camera back on narrow, tall frames so the whole surface and its labels stay in view.
    const dist = 2.9 * Math.max(1, 1.8 / camera.aspect) * zoom;
    const e = pitch;
    camera.position.set(0, 0.15 + Math.sin(e) * dist, Math.cos(e) * dist);
    camera.lookAt(0, 0.18, 0);
    camera.updateProjectionMatrix();
    world.rotation.y = yaw + bias;
    if (mesh) mesh.scale.y = amp;
    if (wire) wire.scale.y = amp;
    return true;
  };
  const draw = () => {
    frame = 0;
    if (place()) renderer.render(scene, camera);
  };
  const redraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const rotate = (dy: number, dp: number) => {
    yaw += dy;
    pitch = Math.min(1.25, Math.max(0.2, pitch + dp));
    redraw();
  };

  const intro = () => {
    if (reduced) return redraw();
    const from = { yaw: -1.6, pitch: 0.24 };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 1100);
      const e = 1 - Math.pow(1 - t, 4);
      yaw = from.yaw + (home.yaw - from.yaw) * e;
      pitch = from.pitch + (home.pitch - from.pitch) * e;
      draw();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  let last: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    // On touch only horizontal drags rotate, so vertical swipes still scroll the page.
    rotate(dx * 0.008, e.pointerType === "touch" ? 0 : dy * 0.006);
  });
  const end = () => (last = null);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "ArrowLeft") rotate(-0.08, 0);
    else if (k === "ArrowRight") rotate(0.08, 0);
    else if (k === "ArrowUp") rotate(0, 0.06);
    else if (k === "ArrowDown") rotate(0, -0.06);
    else if (k === "Home") {
      yaw = home.yaw;
      pitch = home.pitch;
      redraw();
    } else return;
    e.preventDefault();
  });
  new ResizeObserver(redraw).observe(canvas);
  new MutationObserver(() => {
    build();
    redraw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  document.fonts?.ready.then(() => {
    build();
    redraw();
  });

  return {
    show: intro,
    reset: () => {
      yaw = home.yaw;
      pitch = home.pitch;
      redraw();
    },
    turn: (b: number) => {
      bias = b;
      redraw();
    },
    redraw,
    /** Drive the scene directly (used by the scroll story): extra turn, tilt, height scale and camera distance. */
    view: (v: { turn?: number; pitch?: number; amp?: number; zoom?: number }) => {
      if (v.turn !== undefined) bias = v.turn;
      if (v.pitch !== undefined) pitch = v.pitch;
      if (v.amp !== undefined) amp = v.amp;
      if (v.zoom !== undefined) zoom = v.zoom;
      redraw();
    },
    update: (d: SurfaceData) => {
      data = d;
      build();
      redraw();
    },
  };
}
