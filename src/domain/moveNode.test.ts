import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { BRANCH_COLORS, getBranchColor } from "./branchColor";
import { toggleCollapse } from "./collapse";
import { createMindMap } from "./mindmap";
import { moveNode } from "./moveNode";
import { setNodeStyle } from "./nodeStyle";

/** root ─ a(a1(a11), a2) / b / c の木 */
function buildMap() {
  const base = createMindMap("root");
  const a = addChild(base, base.rootId, "a");
  const b = addSibling(a.map, a.nodeId, "b");
  const c = addSibling(b.map, b.nodeId, "c");
  const a1 = addChild(c.map, a.nodeId, "a1");
  const a2 = addSibling(a1.map, a1.nodeId, "a2");
  const a11 = addChild(a2.map, a1.nodeId, "a11");
  return {
    map: a11.map,
    ids: {
      root: base.rootId,
      a: a.nodeId,
      b: b.nodeId,
      c: c.nodeId,
      a1: a1.nodeId,
      a2: a2.nodeId,
      a11: a11.nodeId,
    },
  };
}

describe("moveNode（ノードの移動・並べ替え）", () => {
  describe("別の親へ移動", () => {
    it("指定した親の子の末尾へ移動し、元の親の子からは外れる", () => {
      const { map, ids } = buildMap();

      const next = moveNode(map, ids.b, ids.a);

      expect(next.nodes[ids.b].parentId).toBe(ids.a);
      expect(next.nodes[ids.a].childIds).toEqual([ids.a1, ids.a2, ids.b]);
      expect(next.nodes[ids.root].childIds).toEqual([ids.a, ids.c]);
    });

    it("子孫も一緒に移動する（サブツリーの構造は変わらない）", () => {
      const { map, ids } = buildMap();

      const next = moveNode(map, ids.a1, ids.b);

      expect(next.nodes[ids.b].childIds).toEqual([ids.a1]);
      expect(next.nodes[ids.a1].childIds).toEqual([ids.a11]);
      expect(next.nodes[ids.a11].parentId).toBe(ids.a1);
      expect(Object.keys(next.nodes)).toHaveLength(Object.keys(map.nodes).length);
    });

    it("指定した位置（移動後の何番目か）に挿入できる", () => {
      const { map, ids } = buildMap();

      const next = moveNode(map, ids.b, ids.a, 1);

      expect(next.nodes[ids.a].childIds).toEqual([ids.a1, ids.b, ids.a2]);
    });

    it("位置が範囲外なら、先頭か末尾に収める", () => {
      const { map, ids } = buildMap();

      expect(moveNode(map, ids.b, ids.a, -5).nodes[ids.a].childIds[0]).toBe(ids.b);
      expect(moveNode(map, ids.b, ids.a, 99).nodes[ids.a].childIds).toEqual([
        ids.a1,
        ids.a2,
        ids.b,
      ]);
    });

    it("ノードのテキスト・スタイル・折りたたみ状態は、そのまま保たれる", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(toggleCollapse(map, ids.a1), ids.a1, { bold: true });

      const next = moveNode(styled, ids.a1, ids.b);

      expect(next.nodes[ids.a1].text).toBe("a1");
      expect(next.nodes[ids.a1].style).toEqual({ bold: true });
      expect(next.nodes[ids.a1].collapsed).toBe(true);
      expect(next.nodes[ids.a1].kind).toBe("branch");
    });

    it("移動先が折りたたまれていると、自動で展開される", () => {
      const { map, ids } = buildMap();
      const folded = toggleCollapse(map, ids.a);

      const next = moveNode(folded, ids.b, ids.a);

      expect(next.nodes[ids.a].collapsed).toBe(false);
    });
  });

  describe("同じ親の中での並べ替え", () => {
    it("後ろへ移動する（移動後の位置を指定する）", () => {
      const { map, ids } = buildMap();

      const next = moveNode(map, ids.a, ids.root, 2);

      expect(next.nodes[ids.root].childIds).toEqual([ids.b, ids.c, ids.a]);
    });

    it("前へ移動する", () => {
      const { map, ids } = buildMap();

      const next = moveNode(map, ids.c, ids.root, 0);

      expect(next.nodes[ids.root].childIds).toEqual([ids.c, ids.a, ids.b]);
    });

    it("位置を省略すると、同じ親の末尾へ移動する", () => {
      const { map, ids } = buildMap();

      expect(moveNode(map, ids.a, ids.root).nodes[ids.root].childIds).toEqual([
        ids.b,
        ids.c,
        ids.a,
      ]);
    });

    it("位置が変わらないときは、同じマップをそのまま返す", () => {
      const { map, ids } = buildMap();

      expect(moveNode(map, ids.b, ids.root, 1)).toBe(map);
      expect(moveNode(map, ids.c, ids.root)).toBe(map);
    });
  });

  describe("メインブランチの色", () => {
    it("メインブランチ以外を、中心ノードの子へ移動すると、新しいメインブランチとして、色が割り当てられる", () => {
      const { map, ids } = buildMap();

      const next = moveNode(map, ids.a2, ids.root);

      expect(next.nodes[ids.a2].branchColor).toBe(BRANCH_COLORS[3]); // a=0, b=1, c=2 が使用済み
      expect(getBranchColor(next, ids.a2)).toBe(BRANCH_COLORS[3]);
    });

    it("メインブランチを、中心ノード以外へ移動すると、色の保存は外れ、移動先のメインブランチの色になる", () => {
      const { map, ids } = buildMap();

      const next = moveNode(map, ids.b, ids.a);

      expect("branchColor" in next.nodes[ids.b]).toBe(false);
      expect(getBranchColor(next, ids.b)).toBe(BRANCH_COLORS[0]);
    });

    it("中心ノードの子の中での並べ替えでは、メインブランチの色は変わらない", () => {
      const { map, ids } = buildMap();

      const next = moveNode(map, ids.a, ids.root, 2);

      expect(getBranchColor(next, ids.a)).toBe(BRANCH_COLORS[0]);
      expect(getBranchColor(next, ids.b)).toBe(BRANCH_COLORS[1]);
    });

    it("移動したノードの子孫は、移動先のメインブランチの色を引き継ぐ", () => {
      const { map, ids } = buildMap();

      const next = moveNode(map, ids.a1, ids.c);

      expect(getBranchColor(next, ids.a11)).toBe(BRANCH_COLORS[2]);
    });
  });

  describe("できない移動", () => {
    it("中心ノードは移動できない", () => {
      const { map, ids } = buildMap();

      expect(() => moveNode(map, ids.root, ids.a)).toThrow("ルートノードは移動できません");
    });

    it("自分自身や、自分の子孫の下には、移動できない", () => {
      const { map, ids } = buildMap();

      expect(() => moveNode(map, ids.a, ids.a)).toThrow("自分自身や子孫の下には移動できません");
      expect(() => moveNode(map, ids.a, ids.a11)).toThrow("自分自身や子孫の下には移動できません");
    });

    it("存在しないノード・移動先を指定するとエラーになる", () => {
      const { map, ids } = buildMap();

      expect(() => moveNode(map, "missing", ids.a)).toThrow("ノードが存在しません: missing");
      expect(() => moveNode(map, ids.a, "missing")).toThrow("移動先のノードが存在しません: missing");
    });
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const { map, ids } = buildMap();
    const before = structuredClone(map);

    moveNode(map, ids.a1, ids.root, 1);

    expect(map).toEqual(before);
  });
});
