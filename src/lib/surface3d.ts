// A small dependency-free 3D surface renderer (canvas 2D, perspective projection, painter's algorithm).
// Draws only on interaction, so it costs nothing while idle. Colours come from the site's CSS tokens.

export type SurfaceData = {
  z: number[][]; // rows (y) x columns (x)
  min: number;
  max: number;
  xLabels: [string, string];
  yLabels: [string, string];
};

const rgb = (hex: string) => {
  const h = hex.trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createSurface(canvas: HTMLCanvasElement, data: SurfaceData, reduced: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rows = data.z.length;
  const cols = data.z[0].length;
  const home = { yaw: -0.62, pitch: 0.66 };
  let yaw = home.yaw;
  let pitch = home.pitch;
  let frame = 0;

  const project = (X: number, Y: number, H: number, w: number, h: number) => {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const gx = X * cy - Y * sy;
    const gy = X * sy + Y * cy;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const sx = gx;
    const sv = H * cp - gy * sp;
    const depth = gy * cp + H * sp;
    const s = 3.4 / (3.4 + depth);
    const k = Math.min(w * 0.35, h * 0.62);
    return { x: w / 2 + sx * s * k, y: h * 0.72 - sv * s * k, d: depth };
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

    const base = rgb(token("--tone"));
    const peak = rgb(token("--accent"));
    const lineColor = token("--ink-3");
    const span = data.max - data.min || 1;

    const P = data.z.map((row, j) =>
      row.map((v, i) => project((i / (cols - 1) - 0.5) * 2, (j / (rows - 1) - 0.5) * 1.1, ((v - data.min) / span) * 0.62, w, h))
    );

    const quads: { d: number; pts: { x: number; y: number }[]; t: number }[] = [];
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = P[j][i];
        const b = P[j][i + 1];
        const c = P[j + 1][i + 1];
        const d = P[j + 1][i];
        const t = (data.z[j][i] + data.z[j][i + 1] + data.z[j + 1][i + 1] + data.z[j + 1][i]) / 4;
        quads.push({ d: (a.d + b.d + c.d + d.d) / 4, pts: [a, b, c, d], t: (t - data.min) / span });
      }
    }
    quads.sort((p, q) => q.d - p.d); // far to near

    ctx.lineWidth = 0.6;
    ctx.strokeStyle = lineColor;
    for (const q of quads) {
      ctx.beginPath();
      ctx.moveTo(q.pts[0].x, q.pts[0].y);
      for (let n = 1; n < 4; n++) ctx.lineTo(q.pts[n].x, q.pts[n].y);
      ctx.closePath();
      ctx.fillStyle = mix(base, peak, Math.pow(q.t, 0.8));
      ctx.fill();
      ctx.globalAlpha = 0.28;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Axis labels at fixed positions in the scene.
    ctx.fillStyle = lineColor;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    const label = (text: string, X: number, Y: number, H = 0) => {
      const p = project(X, Y, H, w, h);
      const half = ctx.measureText(text).width / 2 + 4;
      ctx.fillText(text, Math.min(w - half, Math.max(half, p.x)), Math.min(h - 6, Math.max(14, p.y)));
    };
    label(data.xLabels[0], -1, -0.74);
    label(data.xLabels[1], 1, -0.74);
    label(data.yLabels[0], 1.18, -0.55);
    label(data.yLabels[1], 1.18, 0.55);
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
      const t = Math.min(1, (now - t0) / 900);
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

  return {
    show: intro,
    reset: () => {
      yaw = home.yaw;
      pitch = home.pitch;
      redraw();
    },
    redraw,
  };
}
