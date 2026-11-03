// Mounts the 3D surface renderer on a canvas inside a block and keeps it in step with changing inputs.
// The block stays hidden (and the page works without it) until JavaScript has drawn the first surface.
import { createSurfaceAuto } from "./surfaceAuto.ts";
import type { Surface } from "./surfaceAuto.ts";
import type { SurfaceData } from "./surface3d.ts";

/** Bilinear refinement of a grid, so a coarse table of 9 x 9 values reads as a smooth surface. */
export function densify(z: number[][], k = 3): number[][] {
  const rows = (z.length - 1) * k + 1;
  const cols = (z[0].length - 1) * k + 1;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const y = r / k;
      const x = c / k;
      const y0 = Math.min(z.length - 2, Math.floor(y));
      const x0 = Math.min(z[0].length - 2, Math.floor(x));
      const fy = y - y0;
      const fx = x - x0;
      return z[y0][x0] * (1 - fy) * (1 - fx) + z[y0 + 1][x0] * fy * (1 - fx) + z[y0][x0 + 1] * (1 - fy) * fx + z[y0 + 1][x0 + 1] * fy * fx;
    })
  );
}

export function mountSurface(host: HTMLElement) {
  const canvas = host.querySelector<HTMLCanvasElement>("canvas")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let surface: Surface | null = null;
  let pending = false;
  let latest: SurfaceData | null = null;
  let seen = false;
  const intro = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && !seen) {
        seen = true;
        surface?.show();
        intro.disconnect();
      }
    },
    { threshold: 0.25 }
  );
  host.querySelector("[data-reset3d]")?.addEventListener("click", () => surface?.reset());
  if (!reduced) {
    let ticking = false;
    addEventListener(
      "scroll",
      () => {
        if (ticking || !surface) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          const r = canvas.getBoundingClientRect();
          const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height)));
          surface?.turn((p - 0.4) * 0.6);
        });
      },
      { passive: true }
    );
  }
  return {
    set(data: SurfaceData, label: string) {
      canvas.setAttribute("aria-label", `${label} Use the arrow keys to rotate and Home to reset.`);
      host.hidden = false;
      latest = data;
      if (surface) return surface.update(data);
      if (pending) return;
      pending = true;
      createSurfaceAuto(canvas, data, reduced).then((made) => {
        pending = false;
        surface = made;
        if (!made) return;
        if (latest && latest !== data) made.update(latest);
        if (seen) made.show();
        else intro.observe(canvas);
      });
    },
  };
}
