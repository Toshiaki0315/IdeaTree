import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { BRANCH_COLORS } from "./branchColor";
import { toggleCollapse } from "./collapse";
import { createMindMap } from "./mindmap";
import { pasteTexts } from "./pasteTexts";

/** root ─ a(a1) / b の木 */
function buildMap() {
  const base = createMindMap("root");
  const a = addChild(base, base.rootId, "a");
  const b = addChild(a.map, base.rootId, "b");
  const a1 = addChild(b.map, a.nodeId, "a1");
  return { map: a1.map, ids: { root: base.rootId, a: a.nodeId, b: b.nodeId, a1: a1.nodeId } };
}

describe("pasteTexts（テキストの行を、子ノードとして貼り付ける）", () => {
  it("各行を、貼り付け先の子の末尾に、行の順で追加し、追加したノードのIDを返す", () => {
    const { map, ids } = buildMap();

    const { map: next, nodeIds } = pasteTexts(map, ids.a, ["企画", "予算", "調査"]);

    expect(nodeIds).toHaveLength(3);
    expect(next.nodes[ids.a].childIds).toEqual([ids.a1, ...nodeIds]);
    expect(nodeIds.map((id) => next.nodes[id].text)).toEqual(["企画", "予算", "調査"]);
  });

  it("追加したノードは、子を持たないブランチで、親は貼り付け先", () => {
    const { map, ids } = buildMap();

    const { map: next, nodeIds } = pasteTexts(map, ids.b, ["x", "y"]);

    for (const id of nodeIds) {
      expect(next.nodes[id].kind).toBe("branch");
      expect(next.nodes[id].parentId).toBe(ids.b);
      expect(next.nodes[id].childIds).toEqual([]);
    }
  });

  it("空の行や、空白だけの行は無視し、前後の空白は取り除く", () => {
    const { map, ids } = buildMap();

    const { map: next, nodeIds } = pasteTexts(map, ids.b, ["  企画  ", "", "   ", "予算"]);

    expect(nodeIds.map((id) => next.nodes[id].text)).toEqual(["企画", "予算"]);
  });

  it("貼り付ける行がなければ、同じマップをそのまま返す", () => {
    const { map, ids } = buildMap();

    expect(pasteTexts(map, ids.a, [])).toEqual({ map, nodeIds: [] });
    expect(pasteTexts(map, ids.a, ["", "  "])).toEqual({ map, nodeIds: [] });
  });

  it("折りたたまれたノードに貼り付けると、自動で展開される", () => {
    const { map, ids } = buildMap();
    const folded = toggleCollapse(map, ids.a);
    expect(folded.nodes[ids.a].collapsed).toBe(true);

    const { map: next } = pasteTexts(folded, ids.a, ["新"]);

    expect(next.nodes[ids.a].collapsed).toBe(false);
  });

  it("中心ノードに貼り付けた行は、それぞれ新しいメインブランチとして、色が順に割り当てられる", () => {
    const { map, ids } = buildMap();

    const { map: next, nodeIds } = pasteTexts(map, ids.root, ["c", "d"]);

    expect(nodeIds.map((id) => next.nodes[id].branchColor)).toEqual([
      BRANCH_COLORS[2], // a=0, b=1 が使用済み
      BRANCH_COLORS[3],
    ]);
  });

  it("メインブランチ以外に貼り付けた行には、色は保存されない", () => {
    const { map, ids } = buildMap();

    const { map: next, nodeIds } = pasteTexts(map, ids.a, ["x"]);

    expect("branchColor" in next.nodes[nodeIds[0]]).toBe(false);
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const { map, ids } = buildMap();
    const before = structuredClone(map);

    pasteTexts(map, ids.a, ["x", "y"]);

    expect(map).toEqual(before);
  });

  it("貼り付け先のノードが存在しなければエラーになる", () => {
    const { map } = buildMap();

    expect(() => pasteTexts(map, "missing", ["x"])).toThrow(
      "貼り付け先のノードが存在しません: missing",
    );
  });
});
