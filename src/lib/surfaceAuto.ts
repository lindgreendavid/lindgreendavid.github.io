// Picks the best 3D surface for the browser: WebGL (three.js) when available, the canvas renderer otherwise.
import type { SurfaceData } from "./surface3d.ts";

export type Surface = {
  show: () => void;
  reset: () => void;
  turn: (b: number) => void;
  redraw: () => void;
  update: (d: SurfaceData) => void;
};

export async function createSurfaceAuto(canvas: HTMLCanvasElement, data: SurfaceData, reduced: boolean): Promise<Surface | null> {
  try {
    const { createSurfaceGL } = await import("./surfaceGL.ts");
    const gl = createSurfaceGL(canvas, data, reduced);
    if (gl) return gl;
  } catch {
    // fall through to the canvas renderer
  }
  const { createSurface } = await import("./surface3d.ts");
  return createSurface(canvas, data, reduced);
}
