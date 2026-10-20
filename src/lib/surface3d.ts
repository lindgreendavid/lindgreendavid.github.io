// A small dependency-free 3D surface renderer (canvas 2D, perspective projection, painter's algorithm, lit shading).
// Draws only on interaction, so it costs nothing while idle. Colours and the font come from the site's tokens.

export type SurfaceData = {
  z: number[][]; // rows (y) x columns (x)
  min: number;
  max: number;
  xLabels: [string, string];
  yLabels: [string, string];
  unit: string;
};

const FONT = '500 12.5px "Geist Variable", system-ui, sans-serif';
const SX = 2; // world width of the date axis
const SY = 1.1; // world depth of the window axis
const SH = 0.62; // world height of the tallest point

const rgb = (hex: string) => {
  const h = hex.trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c: number[], k = 1) => `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(",")})`;

export function createSurface(canvas: HTMLCanvasElement, data: SurfaceData, reduced: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rows = data.z.length;
  const cols = data.z[0].length;
  const span = data.max - data.min || 1;
  const home = { yaw: -0.62, pitch: 0.66 };
  let yaw = home.yaw;
  let pitch = home.pitch;
  let bias = 0; // extra yaw driven by page scroll
  let frame = 0;

  // Lit shading, computed once: a fixed light from the upper left makes the shading change as the scene turns.
  const light = [-0.45, -0.55, 0.7];
  const ll = Math.hypot(...light);
  const shade: number[][] = [];
  for (let j = 0; j < rows - 1; j++) {
    shade.push([]);
    for (let i = 0; i < cols - 1; i++) {
      const z = data.z;
      const dx = ((z[j][i + 1] + z[j + 1][i + 1] - z[j][i] - z[j + 1][i]) / 2 / span) * SH / (SX / (cols - 1));
      const dy = ((z[j + 1][i] + z[j + 1][i + 1] - z[j][i] - z[j][i + 1]) / 2 / span) * SH / (SY / (rows - 1));
      const n = [-dx * 0.22, -dy * 0.22, 1];
      const nl = Math.hypot(...n);
      const lam = Math.max(0, (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / (nl * ll));
      shade[j].push(0.74 + 0.3 * lam);
    }
  }

  const project = (X: number, Y: number, H: number, w: number, h: number) => {
    const a = yaw + bias;
    const gx = X * Math.cos(a) - Y * Math.sin(a);
    const gy = X * Math.sin(a) + Y * Math.cos(a);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const depth = gy * cp + H * sp;
    const s = 3.4 / (3.4 + depth);
    const k = Math.min(w * 0.34, h * 0.56);
    return { x: w / 2 + gx * s * k, y: h * 0.68 - (H * cp - gy * sp) * s * k, d: depth };
  };

  const draw = () => {
    frame = 0;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const low = rgb(token("--tone"));
    const high = rgb(token("--accent"));
    const ink = token("--ink-3");
    const rule = rgb(token("--tone"));
    const P = (X: number, Y: number, H = 0) => project(X, Y, H, w, h);
    const hy = SY / 2;

    // Floor: a soft plane with a light grid, so the surface has something to stand on.
    const corners = [P(-1, -hy), P(1, -hy), P(1, hy), P(-1, hy)];
    ctx.beginPath();
    corners.forEach((c, n) => (n ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.closePath();
    ctx.fillStyle = css(rule, 1);
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let n = 1; n < 5; n++) {
      const a = -1 + (n * 2) / 5;
      const b = -hy + (n * SY) / 5;
      const p1 = P(a, -hy);
      const p2 = P(a, hy);
      const p3 = P(-1, b);
      const p4 = P(1, b);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // The surface, far to near.
    const quads: { d: number; pts: { x: number; y: number }[]; c: string }[] = [];
    const G = data.z.map((row, j) => row.map((v, i) => P((i / (cols - 1) - 0.5) * SX, (j / (rows - 1) - 0.5) * SY, ((v - data.min) / span) * SH)));
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = G[j][i];
        const b = G[j][i + 1];
        const c = G[j + 1][i + 1];
        const d = G[j + 1][i];
        const v = (data.z[j][i] + data.z[j][i + 1] + data.z[j + 1][i + 1] + data.z[j + 1][i]) / 4;
        const t = Math.pow((v - data.min) / span, 0.8);
        quads.push({ d: (a.d + b.d + c.d + d.d) / 4, pts: [a, b, c, d], c: css(lerp(low, high, t), shade[j][i]) });
      }
    }
    quads.sort((p, q) => q.d - p.d);
    ctx.lineWidth = 0.7;
    ctx.lineJoin = "round";
    for (const q of quads) {
      ctx.beginPath();
      ctx.moveTo(q.pts[0].x, q.pts[0].y);
      for (let n = 1; n < 4; n++) ctx.lineTo(q.pts[n].x, q.pts[n].y);
      ctx.closePath();
      ctx.fillStyle = q.c;
      ctx.strokeStyle = q.c; // same colour: hides seams between neighbouring quads
      ctx.fill();
      ctx.stroke();
    }

    // Labels in the site font. Axis labels sit on the edges nearest the viewer, the value axis on the far corner.
    ctx.font = FONT;
    ctx.fillStyle = ink;
    const text = (s: string, X: number, Y: number, H: number, align: CanvasTextAlign) => {
      const p = P(X, Y, H);
      ctx.textAlign = align;
      const half = ctx.measureText(s).width / 2 + 4;
      const x = align === "center" ? Math.min(w - half, Math.max(half, p.x)) : p.x;
      ctx.fillText(s, x, Math.min(h - 6, Math.max(14, p.y)));
    };

    const avg = (...c: { d: number }[]) => c.reduce((s, v) => s + v.d, 0) / c.length;
    const nearY = avg(corners[0], corners[1]) <= avg(corners[2], corners[3]) ? -1 : 1; // nearer date edge
    const nearX = avg(corners[0], corners[3]) <= avg(corners[1], corners[2]) ? -1 : 1; // nearer window edge
    text(data.xLabels[0], -0.86, nearY * (hy + 0.22), 0, "center");
    text(data.xLabels[1], 0.86, nearY * (hy + 0.22), 0, "center");
    text(data.yLabels[0], nearX * 1.3, -hy * 0.8, 0, "center");
    text(data.yLabels[1], nearX * 1.3, hy * 0.8, 0, "center");

    const far = corners.reduce((m, c, n) => (c.d > corners[m].d ? n : m), 0);
    const fx = [-1, 1, 1, -1][far];
    const fy = [-hy, -hy, hy, hy][far];
    const base = P(fx, fy, 0);
    const top = P(fx, fy, SH);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const side: CanvasTextAlign = base.x < w / 2 ? "right" : "left";
    const off = base.x < w / 2 ? -7 : 7;
    for (const f of [0, 0.5, 1]) {
      const p = P(fx, fy, SH * f);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + off * 0.6, p.y);
      ctx.stroke();
      ctx.textAlign = side;
      ctx.fillText(`${(data.min + span * f).toFixed(0)}${data.unit}`, p.x + off, p.y + 4);
    }
  };

  const redraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const rotate = (dy: number, dp: number) => {
    yaw += dy;
    pitch = Math.min(1.25, Math.max(0.2, pitch + dp));
    redraw();
  };

  // One authored moment: the surface settles into place the first time it appears.
  const intro = () => {
    if (reduced) return redraw();
    const from = { yaw: -1.5, pitch: 0.28 };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 1000);
      const e = 1 - Math.pow(1 - t, 4); // ease-out
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
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // Redraw once the site font has loaded so the labels never show in a fallback face.
  document.fonts?.load(FONT).then(redraw);
  document.fonts?.ready.then(redraw);

  return {
    show: intro,
    reset: () => {
      yaw = home.yaw;
      pitch = home.pitch;
      redraw();
    },
    // Scroll-driven turn: set a small yaw offset from the page's scroll position.
    turn: (b: number) => {
      bias = b;
      redraw();
    },
    redraw,
  };
}
