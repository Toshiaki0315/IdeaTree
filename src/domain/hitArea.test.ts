import { describe, expect, it } from "vitest";
import { MIN_HIT_HEIGHT, MIN_HIT_WIDTH, estimateTextWidth, hitAreaSize } from "./hitArea";

describe("hitAreaSize（ノードのクリックできる範囲の大きさ）", () => {
  it("日本語の文字は、1文字が文字サイズと同じ幅として数え、左右に余白を足す", () => {
    const { width } = hitAreaSize("企画案内書", 20);

    expect(width).toBe(5 * 20 + 24);
  });

  it("英数字などの半角文字は、文字サイズの6割の幅として数える", () => {
    const { width } = hitAreaSize("abcdefghij", 20);

    expect(width).toBeCloseTo(10 * 20 * 0.6 + 24);
  });

  it("全角と半角が混ざったときは、それぞれを数えて足す", () => {
    const { width } = hitAreaSize("UI設計", 20);

    expect(width).toBeCloseTo(2 * 20 * 0.6 + 2 * 20 + 24);
  });

  it("短いテキストでも、最小の大きさ以上になる（小さくて押しにくくならない）", () => {
    expect(hitAreaSize("a", 16)).toEqual({ width: MIN_HIT_WIDTH, height: MIN_HIT_HEIGHT });
    expect(hitAreaSize("", 16)).toEqual({ width: MIN_HIT_WIDTH, height: MIN_HIT_HEIGHT });
  });

  it("高さは、文字サイズに上下の余白を足した値（最小の高さ以上）", () => {
    expect(hitAreaSize("企画", 40).height).toBe(40 + 20);
    expect(hitAreaSize("企画", 8).height).toBe(MIN_HIT_HEIGHT);
  });

  it("文字サイズが大きいほど、幅も大きくなる", () => {
    expect(hitAreaSize("企画企画", 40).width).toBeGreaterThan(hitAreaSize("企画企画", 20).width);
  });

  it("折りたたみの印「…」のような記号も、1文字として数える", () => {
    expect(hitAreaSize("企画…", 20).width).toBe(3 * 20 + 24);
  });
});

describe("estimateTextWidth（文字の幅の見積もり）", () => {
  it("全角は文字サイズと同じ幅、半角は 6 割の幅として数えて、足す", () => {
    expect(estimateTextWidth("企画", 20)).toBe(40);
    expect(estimateTextWidth("abc", 20)).toBeCloseTo(36);
    expect(estimateTextWidth("UI設計", 10)).toBeCloseTo(2 * 6 + 2 * 10);
  });

  it("空文字列は 0。文字サイズに比例する", () => {
    expect(estimateTextWidth("", 20)).toBe(0);
    expect(estimateTextWidth("企画", 40)).toBe(2 * estimateTextWidth("企画", 20));
  });
});

describe("hitAreaSize: 折り返したラベル", () => {
  it("上限を超える長いラベルは、幅は上限の幅、高さは行数の分になる", () => {
    const { width, height } = hitAreaSize("あ".repeat(12), 20);

    expect(width).toBe(10 * 20 + 24);
    expect(height).toBe(2 * 20 * 1.25 + 20);
  });
});
