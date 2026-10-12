import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { copyNode } from "./copyNode";
import { createMindMap } from "./mindmap";

/** root ─ a(a1(a11), a2) / b の木 */
function buildMap() {
  const base = createMindMap("root");
  const a = addChild(base, base.rootId, "a");
  const b = addSibling(a.map, a.nodeId, "b");
  const a1 = addChild(b.map, a.nodeId, "a1");
  const a2 = addSibling(a1.map, a1.nodeId, "a2");
  const a11 = addChild(a2.map, a1.nodeId, "a11");
  return {
    map: a11.map,
    ids: { root: base.rootId, a: a.nodeId, b: b.nodeId, a1: a1.nodeId, a2: a2.nodeId, a11: a11.nodeId },
  };
}

describe("copyNode（サブツリーのコピー / Cmd+C）", () => {
  it("子を持たないノードは、そのノード1つだけのサブツリーになる", () => {
    const { map, ids } = buildMap();

    const copied = copyNode(map, ids.b);

    expect(copied.rootId).toBe(ids.b);
    expect(Object.keys(copied.nodes)).toEqual([ids.b]);
    expect(copied.nodes[ids.b].text).toBe("b");
    expect(copied.nodes[ids.b].childIds).toEqual([]);
  });

  it("コピーしたノードの子孫をすべて含み、それ以外（兄弟・祖先）は含まない", () => {
    const { map, ids } = buildMap();

    const copied = copyNode(map, ids.a);

    expect(Object.keys(copied.nodes).sort()).toEqual([ids.a, ids.a1, ids.a2, ids.a11].sort());
  });

  it("子の順序と親子関係を保つ", () => {
    const { map, ids } = buildMap();

    const copied = copyNode(map, ids.a);

    expect(copied.nodes[ids.a].childIds).toEqual([ids.a1, ids.a2]);
    expect(copied.nodes[ids.a1].childIds).toEqual([ids.a11]);
    expect(copied.nodes[ids.a1].parentId).toBe(ids.a);
    expect(copied.nodes[ids.a11].parentId).toBe(ids.a1);
  });

  it("サブツリーの根は親を持たない（元の親から切り離される）", () => {
    const { map, ids } = buildMap();

    expect(copyNode(map, ids.a1).nodes[ids.a1].parentId).toBeNull();
  });

  it("テキスト・種別などのノードの内容は、そのまま複製される", () => {
    const { map, ids } = buildMap();

    const copied = copyNode(map, ids.a1);

    expect(copied.nodes[ids.a1]).toEqual({ ...map.nodes[ids.a1], parentId: null });
    expect(copied.nodes[ids.a11]).toEqual(map.nodes[ids.a11]);
  });

  it("ルート（セントラルイメージ）もコピーでき、全体を含む", () => {
    const { map, ids } = buildMap();

    const copied = copyNode(map, ids.root);

    expect(Object.keys(copied.nodes)).toHaveLength(Object.keys(map.nodes).length);
    expect(copied.nodes[ids.root].kind).toBe("central");
  });

  it("コピー結果を変更しても、元のマインドマップには影響しない（ディープコピー）", () => {
    const { map, ids } = buildMap();
    const before = structuredClone(map);

    const copied = copyNode(map, ids.a);
    copied.nodes[ids.a].childIds.push("x");
    copied.nodes[ids.a1].position.x = 9999;
    copied.nodes[ids.a1].text = "変更";

    expect(map).toEqual(before);
  });

  it("コピー結果はJSONに変換して復元しても同じ（クリップボードへ渡せる）", () => {
    const { map, ids } = buildMap();

    const copied = copyNode(map, ids.a);

    expect(JSON.parse(JSON.stringify(copied))).toEqual(copied);
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const { map } = buildMap();

    expect(() => copyNode(map, "missing")).toThrow("ノードが存在しません: missing");
  });
});
