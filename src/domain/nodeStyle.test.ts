import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { createMindMap } from "./mindmap";
import { MAX_IMAGE_SCALE, MIN_IMAGE_SCALE, setNodeStyle, toggleStyle } from "./nodeStyle";

function buildMap() {
  const base = createMindMap("root");
  const a = addChild(base, base.rootId, "a");
  const b = addChild(a.map, base.rootId, "b");
  return { map: b.map, ids: { root: base.rootId, a: a.nodeId, b: b.nodeId } };
}

describe("setNodeStyle（ノードのスタイル設定）", () => {
  it("指定したノードにスタイルを設定し、他のノードは変えない", () => {
    const { map, ids } = buildMap();

    const next = setNodeStyle(map, ids.a, { bold: true });

    expect(next.nodes[ids.a].style).toEqual({ bold: true });
    expect(next.nodes[ids.b]).toBe(map.nodes[ids.b]);
    expect(next.nodes[ids.root]).toBe(map.nodes[ids.root]);
  });

  it("スタイルは追加で重ねて設定でき、既存の項目は保たれる", () => {
    const { map, ids } = buildMap();

    const bold = setNodeStyle(map, ids.a, { bold: true });
    const both = setNodeStyle(bold, ids.a, { italic: true, fontSize: 24 });

    expect(both.nodes[ids.a].style).toEqual({ bold: true, italic: true, fontSize: 24 });
  });

  it("同じ項目を設定し直すと、値が上書きされる", () => {
    const { map, ids } = buildMap();

    const next = setNodeStyle(setNodeStyle(map, ids.a, { fontSize: 20 }), ids.a, { fontSize: 32 });

    expect(next.nodes[ids.a].style).toEqual({ fontSize: 32 });
  });

  it("値に undefined を指定した項目は、設定が解除される", () => {
    const { map, ids } = buildMap();
    const styled = setNodeStyle(map, ids.a, { bold: true, italic: true });

    const next = setNodeStyle(styled, ids.a, { bold: undefined });

    expect(next.nodes[ids.a].style).toEqual({ italic: true });
    expect("bold" in next.nodes[ids.a].style!).toBe(false);
  });

  it("すべての設定を解除すると、style 自体がなくなる（データを汚さない）", () => {
    const { map, ids } = buildMap();
    const styled = setNodeStyle(map, ids.a, { bold: true });

    const next = setNodeStyle(styled, ids.a, { bold: undefined });

    expect(next.nodes[ids.a].style).toBeUndefined();
    expect("style" in next.nodes[ids.a]).toBe(false);
  });

  it("変化がない設定（同じ値、空の指定、未設定の解除）では、同じマップをそのまま返す", () => {
    const { map, ids } = buildMap();
    const styled = setNodeStyle(map, ids.a, { bold: true, color: "#112233" });

    expect(setNodeStyle(styled, ids.a, { bold: true })).toBe(styled);
    expect(setNodeStyle(styled, ids.a, {})).toBe(styled);
    expect(setNodeStyle(styled, ids.a, { italic: undefined })).toBe(styled);
    expect(setNodeStyle(map, ids.b, {})).toBe(map);
  });

  it("中心ノードにもスタイルを設定できる", () => {
    const { map, ids } = buildMap();

    expect(setNodeStyle(map, ids.root, { italic: true }).nodes[ids.root].style).toEqual({
      italic: true,
    });
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const { map, ids } = buildMap();
    const before = structuredClone(map);

    setNodeStyle(map, ids.a, { bold: true, color: "#FF0000" });

    expect(map).toEqual(before);
  });

  describe("値の検証", () => {
    it.each([["#FF0000"], ["#00ff7f"], ["#0A1b2C"]])("色 %s は設定できる", (color) => {
      const { map, ids } = buildMap();

      expect(setNodeStyle(map, ids.a, { color }).nodes[ids.a].style?.color).toBe(color);
    });

    it.each([["red"], ["#FFF"], ["#GG0000"], ["FF0000"], ["#FF00000"], [""]])(
      "不正な色（%s）はエラーになる",
      (color) => {
        const { map, ids } = buildMap();

        expect(() => setNodeStyle(map, ids.a, { color })).toThrow(
          "色は #RRGGBB の形式で指定してください",
        );
      },
    );

    it.each([[8], [16], [24.5], [200]])("文字サイズ %s は設定できる", (fontSize) => {
      const { map, ids } = buildMap();

      expect(setNodeStyle(map, ids.a, { fontSize }).nodes[ids.a].style?.fontSize).toBe(fontSize);
    });

    it.each([[7.9], [201], [0], [-10], [Number.NaN], [Number.POSITIVE_INFINITY]])(
      "範囲外の文字サイズ（%s）はエラーになる",
      (fontSize) => {
        const { map, ids } = buildMap();

        expect(() => setNodeStyle(map, ids.a, { fontSize })).toThrow(
          "文字サイズは 8 以上 200 以下の数値で指定してください",
        );
      },
    );

    it("フォントは、空でない文字列なら設定でき、前後の空白は取り除かれる", () => {
      const { map, ids } = buildMap();

      const next = setNodeStyle(map, ids.a, { fontFamily: "  Hiragino Mincho ProN " });

      expect(next.nodes[ids.a].style?.fontFamily).toBe("Hiragino Mincho ProN");
    });

    it.each([[""], ["   "]])("空のフォント名（%j）はエラーになる", (fontFamily) => {
      const { map, ids } = buildMap();

      expect(() => setNodeStyle(map, ids.a, { fontFamily })).toThrow("フォント名が空です");
    });

    it("検証に失敗したときは、一部の項目だけが設定されることはない", () => {
      const { map, ids } = buildMap();

      expect(() => setNodeStyle(map, ids.a, { bold: true, color: "bad" })).toThrow();
      expect(map.nodes[ids.a].style).toBeUndefined();
    });
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const { map } = buildMap();

    expect(() => setNodeStyle(map, "missing", { bold: true })).toThrow(
      "ノードが存在しません: missing",
    );
  });
});

describe("toggleStyle（太字・斜体の切り替え / Cmd+B・Cmd+I）", () => {
  it("オフのときはオンにし、オンのときはオフ（設定の解除）にする", () => {
    const { map, ids } = buildMap();

    const on = toggleStyle(map, ids.a, "bold");
    expect(on.nodes[ids.a].style).toEqual({ bold: true });

    const off = toggleStyle(on, ids.a, "bold");
    expect(off.nodes[ids.a].style).toBeUndefined();
  });

  it("太字と斜体は、互いに独立して切り替わる", () => {
    const { map, ids } = buildMap();

    const both = toggleStyle(toggleStyle(map, ids.a, "bold"), ids.a, "italic");
    expect(both.nodes[ids.a].style).toEqual({ bold: true, italic: true });

    const onlyItalic = toggleStyle(both, ids.a, "bold");
    expect(onlyItalic.nodes[ids.a].style).toEqual({ italic: true });
  });

  it("他のスタイル項目（色・サイズなど）は保たれる", () => {
    const { map, ids } = buildMap();
    const styled = setNodeStyle(map, ids.a, { color: "#112233", fontSize: 30 });

    const next = toggleStyle(styled, ids.a, "italic");

    expect(next.nodes[ids.a].style).toEqual({ color: "#112233", fontSize: 30, italic: true });
  });

  it("元のマインドマップを変更しない", () => {
    const { map, ids } = buildMap();
    const before = structuredClone(map);

    toggleStyle(map, ids.a, "bold");

    expect(map).toEqual(before);
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const { map } = buildMap();

    expect(() => toggleStyle(map, "missing", "bold")).toThrow("ノードが存在しません: missing");
  });
});

describe("setNodeStyle（画像の倍率: imageScale）", () => {
  it.each([[MIN_IMAGE_SCALE], [0.5], [1], [2.5], [MAX_IMAGE_SCALE]])("倍率 %s は設定できる", (imageScale) => {
    const { map, ids } = buildMap();

    expect(setNodeStyle(map, ids.a, { imageScale }).nodes[ids.a].style).toEqual({ imageScale });
  });

  it.each([[0], [-1], [0.2], [4.1], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "範囲外の倍率（%s）はエラーになる",
    (imageScale) => {
      const { map, ids } = buildMap();

      expect(() => setNodeStyle(map, ids.a, { imageScale })).toThrow(
        `画像の倍率は ${MIN_IMAGE_SCALE} 以上 ${MAX_IMAGE_SCALE} 以下の数値で指定してください`,
      );
    },
  );

  it("undefined で解除でき、他のスタイル項目は保たれる", () => {
    const { map, ids } = buildMap();
    const styled = setNodeStyle(map, ids.a, { imageScale: 2, bold: true });

    expect(setNodeStyle(styled, ids.a, { imageScale: undefined }).nodes[ids.a].style).toEqual({ bold: true });
  });
});

