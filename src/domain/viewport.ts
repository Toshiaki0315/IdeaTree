export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;

export function zoomIn(_viewport: Viewport): Viewport {
  throw new Error("未実装");
}
export function zoomOut(_viewport: Viewport): Viewport {
  throw new Error("未実装");
}
export function panBy(_viewport: Viewport, _dx: number, _dy: number): Viewport {
  throw new Error("未実装");
}
export function visibleRect(_half: number, _viewport: Viewport) {
  throw new Error("未実装");
}
export function panToInclude(
  _viewport: Viewport,
  _half: number,
  _point: { x: number; y: number },
  _margin: number,
): Viewport {
  throw new Error("未実装");
}
