import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { BRANCH_COLORS } from "./branchColor";
import { createMindMap } from "./mindmap";

describe("addSibling（兄弟ノードの追加 / Enterキー）", () => {
  it("同じ親を持つブランチノードを追加し、そのIDを返す", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");

    const { map: next, nodeId } = addSibling(a.map, a.nodeId, "2");

    const sibling = next.nodes[nodeId];
    expect(sibling.kind).toBe("branch");
    expect(sibling.text).toBe("2");
    expect(sibling.parentId).toBe(map.rootId);
    expect(sibling.childIds).toEqual([]);
  });

  it("基準ノードの直後に挿入される", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");
    const c = addChild(a.map, map.rootId, "3");

    const b = addSibling(c.map, a.nodeId, "2");

    expect(b.map.nodes[map.rootId].childIds).toEqual([a.nodeId, b.nodeId, c.nodeId]);
  });

  it("末尾のノードの兄弟は末尾に追加される", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");

    const b = addSibling(a.map, a.nodeId, "2");

    expect(b.map.nodes[map.rootId].childIds).toEqual([a.nodeId, b.nodeId]);
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");

    addSibling(a.map, a.nodeId, "2");

    expect(a.map.nodes[map.rootId].childIds).toEqual([a.nodeId]);
    expect(Object.keys(a.map.nodes)).toHaveLength(2);
  });

  it("ルート（セントラルイメージ）には兄弟を追加できない", () => {
    const map = createMindMap("A");

    expect(() => addSibling(map, map.rootId, "x")).toThrow(
      "ルートノードには兄弟ノードを追加できません",
    );
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const map = createMindMap("A");

    expect(() => addSibling(map, "missing", "x")).toThrow("ノードが存在しません: missing");
  });
});

describe("addSibling（メインブランチの色の割り当て）", () => {
  it("メインブランチの兄弟（新しいメインブランチ）には、次の色が保存される", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");

    const b = addSibling(a.map, a.nodeId, "2");

    expect(b.map.nodes[b.nodeId].branchColor).toBe(BRANCH_COLORS[1]);
  });

  it("サブブランチの兄弟には、色は保存されない", () => {
    const map = createMindMap("A");
    const main = addChild(map, map.rootId, "1");
    const sub = addChild(main.map, main.nodeId, "1-1");

    const sibling = addSibling(sub.map, sub.nodeId, "1-2");

    expect("branchColor" in sibling.map.nodes[sibling.nodeId]).toBe(false);
  });
});
