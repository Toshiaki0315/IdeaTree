import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { createMindMap } from "./mindmap";
import { ICON_PRESETS, iconShapes, isIcon, legacyIconToId, setIconOf, setNodeIcon } from "./nodeIcon";

function buildMap() {
  const base = createMindMap("root");
  const a = addChild(base, base.rootId, "a");
  const b = addChild(a.map, base.rootId, "b");
  return { map: b.map, ids: { root: base.rootId, a: a.nodeId, b: b.nodeId } };
}

describe("ICON_PRESETS（オリジナルのアイコンの選択肢）", () => {
  it("10個以上あり、名前も識別子（value）も、重複しない", () => {
    expect(ICON_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ICON_PRESETS.map((p) => p.name)).size).toBe(ICON_PRESETS.length);
    expect(new Set(ICON_PRESETS.map((p) => p.value)).size).toBe(ICON_PRESETS.length);
    for (const preset of ICON_PRESETS) {
      expect(preset.name).not.toBe("");
      expect(preset.value).toMatch(/^[a-z]+$/); // 絵文字ではなく、英小文字の識別子
    }
  });

  it("それぞれ、24×24 の座標で描いた、1つ以上の図形（パス）を持つ", () => {
    for (const preset of ICON_PRESETS) {
      expect(preset.shapes.length, preset.name).toBeGreaterThan(0);
      for (const shape of preset.shapes) {
        expect(shape.d, preset.name).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
        for (const color of [shape.fill, shape.stroke]) {
          if (color !== undefined) expect(color, preset.name).toMatch(/^(#[0-9A-Fa-f]{6}|none)$/);
        }
        if (shape.strokeWidth !== undefined) expect(shape.strokeWidth).toBeGreaterThan(0);
      }
    }
  });

  it("どの図形も、塗りか線の、どちらかは見える（透明なだけの図形がない）", () => {
    for (const preset of ICON_PRESETS) {
      for (const shape of preset.shapes) {
        const visible = (shape.fill ?? "none") !== "none" || (shape.stroke ?? "none") !== "none";
        expect(visible, preset.name).toBe(true);
      }
    }
  });
});

describe("iconShapes（アイコンの図形）", () => {
  it("選択肢の識別子から、そのアイコンの図形を返す", () => {
    for (const preset of ICON_PRESETS) expect(iconShapes(preset.value)).toBe(preset.shapes);
  });

  it("選択肢にない識別子では、空の一覧を返す", () => {
    expect(iconShapes("unknown")).toEqual([]);
  });
});

describe("isIcon（選択肢のアイコンか）", () => {
  it("選択肢の識別子は、有効", () => {
    for (const preset of ICON_PRESETS) expect(isIcon(preset.value)).toBe(true);
  });

  it.each([[""], ["x"], ["<b>"], ["star star"], ["⭐"], ["👍"], [123], [null], [undefined]])(
    "選択肢にないもの（%j）は、無効（以前の絵文字も、そのままでは無効）",
    (value) => {
      expect(isIcon(value)).toBe(false);
    },
  );
});

describe("legacyIconToId（以前の絵文字のアイコンを、識別子に変換）", () => {
  it.each([
    ["⭐", "star"],
    ["✅", "check"],
    ["⚠️", "warning"],
    ["❓", "question"],
    ["💡", "idea"],
    ["🎯", "target"],
    ["⏰", "deadline"],
    ["❗", "urgent"],
    ["❤️", "heart"],
    ["📌", "memo"],
    ["🔍", "research"],
    ["💰", "money"],
  ])("%s は %s に変換する", (emoji, id) => {
    expect(legacyIconToId(emoji)).toBe(id);
    expect(isIcon(id)).toBe(true);
  });

  it("絵文字でないもの、知らない絵文字は、undefined", () => {
    expect(legacyIconToId("star")).toBeUndefined();
    expect(legacyIconToId("👍")).toBeUndefined();
    expect(legacyIconToId(1)).toBeUndefined();
  });
});

describe("setNodeIcon（ノードのアイコンの設定）", () => {
  const star = ICON_PRESETS[0].value;
  const other = ICON_PRESETS[1].value;

  it("指定したノードにアイコンを設定し、他のノードは変えない", () => {
    const { map, ids } = buildMap();

    const next = setNodeIcon(map, ids.a, star);

    expect(next.nodes[ids.a].icon).toBe(star);
    expect(next.nodes[ids.b]).toBe(map.nodes[ids.b]);
  });

  it("中心ノードにも設定できる", () => {
    const { map, ids } = buildMap();

    expect(setNodeIcon(map, ids.root, star).nodes[ids.root].icon).toBe(star);
  });

  it("別のアイコンで置き換えられ、undefined で外せる（外すと、icon 自体がなくなる）", () => {
    const { map, ids } = buildMap();
    const withStar = setNodeIcon(map, ids.a, star);

    expect(setNodeIcon(withStar, ids.a, other).nodes[ids.a].icon).toBe(other);
    expect("icon" in setNodeIcon(withStar, ids.a, undefined).nodes[ids.a]).toBe(false);
  });

  it("変化がないとき（同じアイコン、アイコンがないのに外す）は、同じマップをそのまま返す", () => {
    const { map, ids } = buildMap();
    const withStar = setNodeIcon(map, ids.a, star);

    expect(setNodeIcon(withStar, ids.a, star)).toBe(withStar);
    expect(setNodeIcon(map, ids.a, undefined)).toBe(map);
  });

  it("選択肢にないアイコンは、日本語のエラーになり、設定されない", () => {
    const { map, ids } = buildMap();

    expect(() => setNodeIcon(map, ids.a, "👍")).toThrow("アイコンは、選択肢の中から選んでください");
    expect(map.nodes[ids.a].icon).toBeUndefined();
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const { map } = buildMap();

    expect(() => setNodeIcon(map, "missing", star)).toThrow("ノードが存在しません: missing");
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const { map, ids } = buildMap();
    const before = structuredClone(map);

    setNodeIcon(map, ids.a, star);

    expect(map).toEqual(before);
  });
});

describe("setIconOf（複数のノードに、同じアイコンを設定）", () => {
  it("指定したすべてのノードに設定し、undefined で、すべて外す。変化がなければ、同じマップ", () => {
    const { map, ids } = buildMap();
    const star = ICON_PRESETS[0].value;

    const next = setIconOf(map, [ids.a, ids.b], star);
    expect(next.nodes[ids.a].icon).toBe(star);
    expect(next.nodes[ids.b].icon).toBe(star);
    expect(next.nodes[ids.root].icon).toBeUndefined();

    expect(setIconOf(next, [ids.a, ids.b], star)).toBe(next);
    const cleared = setIconOf(next, [ids.a, ids.b], undefined);
    expect("icon" in cleared.nodes[ids.a]).toBe(false);
    expect("icon" in cleared.nodes[ids.b]).toBe(false);
  });
});
