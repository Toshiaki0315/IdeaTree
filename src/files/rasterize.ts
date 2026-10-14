export const RASTER_SCALE = 2;
export const MAX_RASTER_SIDE = 8192;

export function rasterScale(_width: number, _height: number): number {
  throw new Error("未実装");
}

export async function rasterizeSvg(
  _svg: string,
  _width: number,
  _height: number,
  _format: "png" | "jpeg",
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  throw new Error("未実装");
}
