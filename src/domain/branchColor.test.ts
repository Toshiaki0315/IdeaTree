import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { BRANCH_COLORS, getBranchColor } from "./branchColor";
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
