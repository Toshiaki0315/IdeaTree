import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { BRANCH_COLORS, getBranchColor, nextBranchColor } from "./branchColor";
import { deleteNode } from "./deleteNode";
import { createMindMap } from "./mindmap";
import type { MindMap, NodeId } from "./mindmap";

/** ルート直下にメインブランチを n 本追加する */
function withMainBranches(count: number): { map: MindMap; mains: NodeId[]; root: NodeId } {
  const base = createMindMap("root");
  let map = base;
  const mains: NodeId[] = [];
  for (let i = 0; i < count; i++) {
    const added = addChild(map, base.rootId, `b${i}`);
    map = added.map;
    mains.push(added.nodeId);
  }
  return { map, mains, root: base.rootId };
}

describe("BRANCH_COLORS（カラーパレット）", () => {
  it("8色以上あり、すべて異なる #RRGGBB 形式である", () => {
    expect(BRANCH_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(BRANCH_COLORS).size).toBe(BRANCH_COLORS.length);
    for (const color of BRANCH_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

/** WCAG の相対輝度から求める、白背景に対するコントラスト比 */
function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

describe("BRANCH_COLORS の視認性", () => {
  it("すべての色が、白背景に対してコントラスト比 3:1 以上（線・大きな文字の基準）である", () => {
    for (const color of BRANCH_COLORS) {
      expect(contrastWithWhite(color), color).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("getBranchColor（メインブランチごとの色割り当て）", () => {
  it("ルート（セントラルイメージ）には枝の色がなく null を返す", () => {
    const { map, root } = withMainBranches(2);

    expect(getBranchColor(map, root)).toBeNull();
  });

  it("メインブランチには追加順にパレットの色が割り当てられる", () => {
    const { map, mains } = withMainBranches(3);

    expect(mains.map((id) => getBranchColor(map, id))).toEqual([
      BRANCH_COLORS[0],
      BRANCH_COLORS[1],
      BRANCH_COLORS[2],
    ]);
  });

  it("サブブランチ（子孫）はメインブランチの色を引き継ぐ", () => {
    const { map, mains } = withMainBranches(2);
    const child = addChild(map, mains[1], "子");
    const grand = addChild(child.map, child.nodeId, "孫");

    expect(getBranchColor(grand.map, child.nodeId)).toBe(BRANCH_COLORS[1]);
    expect(getBranchColor(grand.map, grand.nodeId)).toBe(BRANCH_COLORS[1]);
  });

  it("メインブランチがパレットの数を超えたら先頭の色に戻る", () => {
    const { map, mains } = withMainBranches(BRANCH_COLORS.length + 1);

    expect(getBranchColor(map, mains[BRANCH_COLORS.length])).toBe(BRANCH_COLORS[0]);
  });

  it("異なるメインブランチの色は（パレット数の範囲内で）重ならない", () => {
    const { map, mains } = withMainBranches(BRANCH_COLORS.length);
    const colors = mains.map((id) => getBranchColor(map, id));

    expect(new Set(colors).size).toBe(BRANCH_COLORS.length);
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const { map } = withMainBranches(1);

    expect(() => getBranchColor(map, "missing")).toThrow("ノードが存在しません: missing");
  });
});

describe("メインブランチの色の固定（削除しても他のブランチの色が変わらない）", () => {
  const colorsOf = (map: MindMap, ids: NodeId[]) => ids.map((id) => getBranchColor(map, id));

  it("メインブランチを追加すると、使われていない色のうち、パレットの先頭に近い色が割り当てられ、ノードに保存される", () => {
    const { map, mains } = withMainBranches(3);

    expect(mains.map((id) => map.nodes[id].branchColor)).toEqual(BRANCH_COLORS.slice(0, 3));
  });

  it("途中のメインブランチを削除しても、残りのブランチの色は変わらない", () => {
    const { map, mains } = withMainBranches(4);

    const next = deleteNode(map, mains[1]);

    expect(colorsOf(next, [mains[0], mains[2], mains[3]])).toEqual([
      BRANCH_COLORS[0],
      BRANCH_COLORS[2],
      BRANCH_COLORS[3],
    ]);
  });

  it("削除で空いた色は、次に追加するメインブランチに割り当てられる", () => {
    const { map, mains, root } = withMainBranches(4);
    const next = deleteNode(map, mains[1]);

    const added = addChild(next, root, "新");

    expect(getBranchColor(added.map, added.nodeId)).toBe(BRANCH_COLORS[1]);
  });

  it("サブブランチは、削除後もメインブランチの色を引き継ぐ", () => {
    const { map, mains } = withMainBranches(3);
    const sub = addChild(map, mains[2], "子");

    const next = deleteNode(sub.map, mains[0]);

    expect(getBranchColor(next, sub.nodeId)).toBe(BRANCH_COLORS[2]);
  });

  it("すべての色が使われているときは、最も使われていない色（パレット順で先頭）を再利用する", () => {
    const { map, root } = withMainBranches(BRANCH_COLORS.length);

    const ninth = addChild(map, root, "9本目");
    const tenth = addChild(ninth.map, root, "10本目");

    expect(getBranchColor(tenth.map, ninth.nodeId)).toBe(BRANCH_COLORS[0]);
    expect(getBranchColor(tenth.map, tenth.nodeId)).toBe(BRANCH_COLORS[1]);
  });

  it("保存された色がないメインブランチ（従来のファイル）は、これまでどおり並び順で色が決まる", () => {
    const { map, mains } = withMainBranches(3);
    const legacy: MindMap = {
      ...map,
      nodes: Object.fromEntries(
        Object.entries(map.nodes).map(([id, node]) => {
          const { branchColor: _color, ...rest } = node;
          void _color;
          return [id, rest];
        }),
      ),
    };

    expect(colorsOf(legacy, mains)).toEqual(BRANCH_COLORS.slice(0, 3));
  });

  it("保存された色が、パレットにない色でも、そのまま使われる", () => {
    const { map, mains } = withMainBranches(2);
    const custom: MindMap = {
      ...map,
      nodes: { ...map.nodes, [mains[0]]: { ...map.nodes[mains[0]], branchColor: "#123456" } },
    };

    expect(getBranchColor(custom, mains[0])).toBe("#123456");
  });
});

describe("nextBranchColor（次のメインブランチに割り当てる色）", () => {
  it("メインブランチがなければ、パレットの先頭の色", () => {
    expect(nextBranchColor(createMindMap("root"))).toBe(BRANCH_COLORS[0]);
  });

  it("使われていない色のうち、パレットの先頭に近い色を返す", () => {
    const { map } = withMainBranches(2);

    expect(nextBranchColor(map)).toBe(BRANCH_COLORS[2]);
  });

  it("元のマップを変更しない", () => {
    const { map } = withMainBranches(2);
    const before = structuredClone(map);

    nextBranchColor(map);

    expect(map).toEqual(before);
  });
});
