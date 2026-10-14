import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RASTER_SIDE, RASTER_SCALE, rasterScale, rasterizeSvg } from "./rasterize";

describe("rasterScale（画像にするときの倍率）", () => {
  it("標準は RASTER_SCALE 倍（高精細）", () => {
    expect(rasterScale(800, 600)).toBe(RASTER_SCALE);
  });

  it("長辺が MAX_RASTER_SIDE を超えるときは、その長さに収まるよう、倍率を下げる", () => {
    const scale = rasterScale(10000, 4000);

    expect(10000 * scale).toBeCloseTo(MAX_RASTER_SIDE);
    expect(scale).toBeLessThan(RASTER_SCALE);
  });

  it("縦長のときは、高さを基準にする。ちょうど上限なら、倍率は変えない", () => {
    expect(4000 * rasterScale(1000, 20000)).toBeCloseTo(MAX_RASTER_SIDE / 5);
    expect(rasterScale(MAX_RASTER_SIDE / RASTER_SCALE, 100)).toBe(RASTER_SCALE);
  });
});

/** 画像とキャンバスの代役。呼び出しを記録する */
function setupFakes(options: { imageFails?: boolean; noContext?: boolean; blob?: Blob | null } = {}) {
  const calls = {
    imageSrc: "",
    canvas: { width: 0, height: 0 },
    fillStyle: "",
    fillRect: [] as number[][],
    drawImage: [] as unknown[][],
    toBlob: [] as unknown[][],
  };

  class FakeImage {
    onload: (() => void) | undefined;
    onerror: (() => void) | undefined;
    set src(value: string) {
      calls.imageSrc = value;
      queueMicrotask(() => (options.imageFails ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal("Image", FakeImage);

  const blob =
    options.blob === undefined
      ? ({ arrayBuffer: async () => new Uint8Array([1, 2, 3, 250]).buffer } as unknown as Blob)
      : options.blob;
  const context = {
    set fillStyle(value: string) {
      calls.fillStyle = value;
    },
    fillRect: (...args: number[]) => calls.fillRect.push(args),
    drawImage: (...args: unknown[]) => calls.drawImage.push(args),
  };
  const canvas = {
    set width(value: number) {
      calls.canvas.width = value;
    },
    set height(value: number) {
      calls.canvas.height = value;
    },
    getContext: () => (options.noContext ? null : context),
    toBlob: (callback: (blob: Blob | null) => void, ...rest: unknown[]) => {
      calls.toBlob.push(rest);
      callback(blob);
    },
  };
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "canvas" ? (canvas as unknown as HTMLCanvasElement) : original(tag),
  );
  return calls;
}

describe("rasterizeSvg（SVG を PNG・JPEG の画像にする）", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><text>日本語 & 記号</text></svg>';

  it("SVG をデータURLとして画像に読み込み、倍率をかけた大きさのキャンバスに、白い背景で描く", async () => {
    const calls = setupFakes();

    const result = await rasterizeSvg(svg, 800, 600, "png");

    expect(calls.imageSrc).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    expect(calls.canvas).toEqual({ width: 800 * RASTER_SCALE, height: 600 * RASTER_SCALE });
    expect(calls.fillStyle).toBe("#FFFFFF");
    expect(calls.fillRect).toEqual([[0, 0, 800 * RASTER_SCALE, 600 * RASTER_SCALE]]);
    expect(calls.drawImage).toHaveLength(1);
    expect(calls.drawImage[0].slice(1)).toEqual([0, 0, 800 * RASTER_SCALE, 600 * RASTER_SCALE]);
    expect(result.width).toBe(800 * RASTER_SCALE);
    expect(result.height).toBe(600 * RASTER_SCALE);
  });

  it("PNG は、そのまま。JPEG は、品質 0.92 で、画像のバイト列を返す", async () => {
    const png = setupFakes();
    const pngResult = await rasterizeSvg(svg, 800, 600, "png");
    expect(png.toBlob).toEqual([["image/png", undefined]]);
    expect(pngResult.bytes).toEqual(new Uint8Array([1, 2, 3, 250]));

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    const jpeg = setupFakes();
    await rasterizeSvg(svg, 800, 600, "jpeg");
    expect(jpeg.toBlob).toEqual([["image/jpeg", 0.92]]);
  });

  it("大きすぎるときは、倍率を下げて、キャンバスの大きさを収める", async () => {
    const calls = setupFakes();

    const result = await rasterizeSvg(svg, 10000, 4000, "png");

    expect(calls.canvas.width).toBe(MAX_RASTER_SIDE);
    expect(result.width).toBe(MAX_RASTER_SIDE);
    expect(result.height).toBe(Math.round(4000 * rasterScale(10000, 4000)));
  });

  it("SVG を画像として読み込めなかったら、日本語のエラーにする", async () => {
    setupFakes({ imageFails: true });

    await expect(rasterizeSvg(svg, 800, 600, "png")).rejects.toThrow("SVG を画像に変換できません");
  });

  it("キャンバスを使えないときは、日本語のエラーにする", async () => {
    setupFakes({ noContext: true });

    await expect(rasterizeSvg(svg, 800, 600, "png")).rejects.toThrow("画像を作れません（キャンバスを使えません）");
  });

  it("画像のデータを取り出せなかったら、日本語のエラーにする", async () => {
    setupFakes({ blob: null });

    await expect(rasterizeSvg(svg, 800, 600, "jpeg")).rejects.toThrow("画像のデータを作れません");
  });
});
