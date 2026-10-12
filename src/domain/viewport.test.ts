import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEWPORT,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  panBy,
  panToInclude,
  visibleRect,
  zoomIn,
  zoomOut,
} from "./viewport";

describe("viewport（ズームとパン）", () => {
  describe("既定値", () => {
    it("拡大率 1（100%）で、原点が中心", () => {
      expect(DEFAULT_VIEWPORT).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });
  });

  describe("zoomIn / zoomOut", () => {
    it("拡大すると ZOOM_STEP 倍に、縮小すると 1/ZOOM_STEP 倍になる", () => {
      expect(zoomIn(DEFAULT_VIEWPORT).zoom).toBeCloseTo(ZOOM_STEP);
      expect(zoomOut(DEFAULT_VIEWPORT).zoom).toBeCloseTo(1 / ZOOM_STEP);
    });

    it("拡大して縮小すると、元の拡大率に戻る", () => {
      expect(zoomOut(zoomIn(DEFAULT_VIEWPORT)).zoom).toBeCloseTo(1);
    });

    it("拡大率は、MIN_ZOOM 以上 MAX_ZOOM 以下に収まる", () => {
      let viewport = DEFAULT_VIEWPORT;
      for (let i = 0; i < 50; i++) viewport = zoomIn(viewport);
      expect(viewport.zoom).toBe(MAX_ZOOM);

      for (let i = 0; i < 100; i++) viewport = zoomOut(viewport);
      expect(viewport.zoom).toBe(MIN_ZOOM);
    });

    it("上限・下限に達していて変わらないときは、同じ値をそのまま返す", () => {
      const max = { ...DEFAULT_VIEWPORT, zoom: MAX_ZOOM };
      const min = { ...DEFAULT_VIEWPORT, zoom: MIN_ZOOM };

      expect(zoomIn(max)).toBe(max);
      expect(zoomOut(min)).toBe(min);
    });

    it("拡大・縮小しても、中心の位置（パン）は変わらない", () => {
      const viewport = { zoom: 1, panX: 120, panY: -40 };

      expect(zoomIn(viewport)).toMatchObject({ panX: 120, panY: -40 });
      expect(zoomOut(viewport)).toMatchObject({ panX: 120, panY: -40 });
    });

    it("元の値を変更しない", () => {
      const viewport = { zoom: 1, panX: 0, panY: 0 };

      zoomIn(viewport);

      expect(viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });
  });

  describe("panBy", () => {
    it("中心の位置を、指定した量だけ動かす", () => {
      expect(panBy({ zoom: 2, panX: 10, panY: 20 }, 5, -8)).toEqual({ zoom: 2, panX: 15, panY: 12 });
    });
  });

  describe("visibleRect（今、見えている範囲）", () => {
    it("拡大率 1 では、原点を中心に、半径 half の正方形", () => {
      expect(visibleRect(450, DEFAULT_VIEWPORT)).toEqual({ x: -450, y: -450, width: 900, height: 900 });
    });

    it("拡大すると見える範囲は狭くなり、パンした位置を中心にする", () => {
      const rect = visibleRect(400, { zoom: 2, panX: 100, panY: -50 });

      expect(rect).toEqual({ x: -100, y: -250, width: 400, height: 400 });
    });

    it("縮小すると、見える範囲は広くなる", () => {
      expect(visibleRect(400, { zoom: 0.5, panX: 0, panY: 0 }).width).toBe(1600);
    });
  });

  describe("panToInclude（点が見える範囲に入るよう、動かす）", () => {
    it("点がすでに見えていれば、同じ値をそのまま返す", () => {
      const viewport = { zoom: 2, panX: 0, panY: 0 };

      expect(panToInclude(viewport, 400, { x: 50, y: -50 }, 20)).toBe(viewport);
    });

    it("点が見える範囲の外なら、その点が中心になるよう動かす（拡大率は変わらない）", () => {
      const viewport = { zoom: 2, panX: 0, panY: 0 };

      expect(panToInclude(viewport, 400, { x: 500, y: 30 }, 20)).toEqual({
        zoom: 2,
        panX: 500,
        panY: 30,
      });
    });

    it("余白の内側（端に近すぎる）場合も、見えているとは見なさず、動かす", () => {
      const viewport = { zoom: 2, panX: 0, panY: 0 }; // 見える範囲は -100 〜 100

      expect(panToInclude(viewport, 400, { x: 95, y: 0 }, 20).panX).toBe(95);
      expect(panToInclude(viewport, 400, { x: 70, y: 0 }, 20)).toBe(viewport);
    });
  });
});
