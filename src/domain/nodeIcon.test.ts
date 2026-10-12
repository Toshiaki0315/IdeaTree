import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { createMindMap } from "./mindmap";
import { ICON_PRESETS, isIcon, setNodeIcon } from "./nodeIcon";

function buildMap() {
  const base = createMindMap("root");
  const a = addChild(base, base.rootId, "a");
  const b = addChild(a.map, base.rootId, "b");
  return { map: b.map, ids: { root: base.rootId, a: a.nodeId, b: b.nodeId } };
}

describe("ICON_PRESETS（アイコンの選択肢）", () => {
  it("10個以上あり、名前も記号も、重複しない", () => {
    expect(ICON_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ICON_PRESETS.map((p) => p.name)).size).toBe(ICON_PRESETS.length);
    expect(new Set(ICON_PRESETS.map((p) => p.value)).size).toBe(ICON_PRESETS.length);
    for (const preset of ICON_PRESETS) {
      expect(preset.name).not.toBe("");
      expect(preset.value).not.toBe("");
    }
  });
});

describe("isIcon（選択肢のアイコンか）", () => {
  it("選択肢にある記号は、有効", () => {
    for (const preset of ICON_PRESETS) expect(isIcon(preset.value)).toBe(true);
  });

  it.each([[""], ["x"], ["<b>"], ["⭐⭐"], ["👍"], [123], [null], [undefined]])(
    "選択肢にないもの（%j）は、無効",
    (value) => {
      expect(isIcon(value)).toBe(false);
    },
  );
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
