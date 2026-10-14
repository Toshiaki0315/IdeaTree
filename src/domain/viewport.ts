/** 画面の表示範囲。拡大率と、見ている範囲の中心（パン）。マップの座標で表す */
export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
/** 拡大・縮小の1回あたりの倍率 */
export const ZOOM_STEP = 1.25;

function zoomBy(viewport: Viewport, factor: number): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor));
  return zoom === viewport.zoom ? viewport : { ...viewport, zoom };
}

/** 1段階拡大する（上限は MAX_ZOOM）。変わらないときは同じ値を返す */
export function zoomIn(viewport: Viewport): Viewport {
  return zoomBy(viewport, ZOOM_STEP);
}

/** 1段階縮小する（下限は MIN_ZOOM）。変わらないときは同じ値を返す */
export function zoomOut(viewport: Viewport): Viewport {
  return zoomBy(viewport, 1 / ZOOM_STEP);
}

/** 見ている範囲の中心を、指定した量（マップの座標）だけ動かす */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy };
}

/** 今、見えている範囲。拡大率 1 のとき、中心から half の距離まで見える */
export function visibleRect(half: number, viewport: Viewport): Rect {
  const size = (half * 2) / viewport.zoom;
  return { x: viewport.panX - size / 2, y: viewport.panY - size / 2, width: size, height: size };
}

/**
 * 点が、見える範囲の内側（端から margin 以上）に入るよう動かす。
 * すでに入っていれば、同じ値を返す。入っていなければ、その点が中心になるようにする。
 */
export function panToInclude(
  viewport: Viewport,
  half: number,
  point: { x: number; y: number },
  margin: number,
): Viewport {
  const rect = visibleRect(half, viewport);
  const inside =
    point.x >= rect.x + margin &&
    point.x <= rect.x + rect.width - margin &&
    point.y >= rect.y + margin &&
    point.y <= rect.y + rect.height - margin;
  return inside ? viewport : { ...viewport, panX: point.x, panY: point.y };
}

/**
 * すべての点が、余白（margin）つきで収まるよう、表示を合わせる（全体表示）。
 * 中心は、点を囲む長方形の中心。拡大はしない（小さいマップは 100% のまま）。縮小は、MIN_ZOOM まで。
 * 点がなければ、既定の表示にする。
 */
export function fitViewport(half: number, points: { x: number; y: number }[], margin: number): Viewport {
  if (points.length === 0) return DEFAULT_VIEWPORT;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // 長い方の辺に、両側の余白を足した長さが、見える範囲（half × 2 ÷ 拡大率）に収まる拡大率
  const needed = Math.max(maxX - minX, maxY - minY) + margin * 2;
  const zoom = Math.min(1, Math.max(MIN_ZOOM, (half * 2) / needed));
  return { zoom, panX: (minX + maxX) / 2, panY: (minY + maxY) / 2 };
}
