import { describe, expect, it } from "vitest";
import { LINE_HEIGHT_RATIO, MAX_LABEL_EM, labelBlock, wrapLabel } from "./wrapLabel";

describe("wrapLabel（ラベルの折り返し）", () => {
  it("上限に収まる短いラベルは、1行のまま", () => {
    expect(wrapLabel("企画", 20)).toEqual(["企画"]);
    expect(wrapLabel("", 20)).toEqual([""]);
  });

  it("上限ちょうどの幅は、折り返さない", () => {
    const label = "あ".repeat(MAX_LABEL_EM);

    expect(wrapLabel(label, 20)).toEqual([label]);
  });

  it("上限を超える日本語は、上限の幅で折り返す", () => {
    const label = "あ".repeat(MAX_LABEL_EM + 3);

    expect(wrapLabel(label, 20)).toEqual(["あ".repeat(MAX_LABEL_EM), "あああ"]);
  });

  it("とても長いラベルは、何行にでも折り返す", () => {
    const lines = wrapLabel("あ".repeat(MAX_LABEL_EM * 2 + 1), 16);

    expect(lines.map((line) => line.length)).toEqual([MAX_LABEL_EM, MAX_LABEL_EM, 1]);
  });

  it("半角は6割の幅として数えるので、1行に多く入る", () => {
    const lines = wrapLabel("a".repeat(17), 20);

    // 10em ÷ 0.6em ≒ 16 文字
    expect(lines).toEqual(["a".repeat(16), "a"]);
  });

  it("英単語は、空白の位置で折り返し、行頭・行末の空白は捨てる", () => {
    const lines = wrapLabel("mind map is useful tool", 20);

    expect(lines).toEqual(["mind map is", "useful tool"]);
  });

  it("空白で区切れない長い単語は、文字の途中で折り返す", () => {
    const lines = wrapLabel("a".repeat(20), 20);

    expect(lines).toEqual(["a".repeat(16), "a".repeat(4)]);
  });

  it("サロゲートペアの文字（絵文字など）を、途中で切らない", () => {
    const label = "😀".repeat(MAX_LABEL_EM + 1);

    expect(wrapLabel(label, 20)).toEqual(["😀".repeat(MAX_LABEL_EM), "😀"]);
  });

  it("文字サイズが違っても、1行に入るのは、同じ文字数（幅は文字サイズに比例）", () => {
    expect(wrapLabel("あ".repeat(11), 40)).toEqual(["あ".repeat(10), "あ"]);
  });
});

describe("labelBlock（折り返したラベルの大きさ）", () => {
  it("1行なら、幅はその行の幅、高さは行の高さ", () => {
    expect(labelBlock("企画案", 20)).toEqual({
      lines: ["企画案"],
      width: 60,
      height: 20 * LINE_HEIGHT_RATIO,
    });
  });

  it("複数行なら、幅は一番広い行、高さは行数の分", () => {
    const block = labelBlock("あ".repeat(MAX_LABEL_EM + 2), 20);

    expect(block.lines).toHaveLength(2);
    expect(block.width).toBe(MAX_LABEL_EM * 20);
    expect(block.height).toBeCloseTo(2 * 20 * LINE_HEIGHT_RATIO);
  });
});
