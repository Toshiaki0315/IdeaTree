import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { copyNode } from "./copyNode";
import { nextBranchColor } from "./branchColor";
import { createMindMap } from "./mindmap";
import type { MindMap, NodeId } from "./mindmap";
import { pasteNode } from "./pasteNode";

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

/** 指定ノードを根とするサブツリーのテキストを、深さ優先の順に並べる */
function textsOf(map: MindMap, rootId: NodeId): string[] {
  const texts: string[] = [];
  const walk = (id: NodeId) => {
    texts.push(map.nodes[id].text);
    map.nodes[id].childIds.forEach(walk);
  };
  walk(rootId);
  return texts;
}

describe("pasteNode（サブツリーの貼り付け / Cmd+V）", () => {
  it("貼り付け先の子の末尾に、コピーしたサブツリーを追加し、その根のIDを返す", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a);

    const { map: next, nodeId } = pasteNode(map, ids.b, copied);

    expect(next.nodes[ids.b].childIds).toEqual([nodeId]);
    expect(next.nodes[nodeId].parentId).toBe(ids.b);
    expect(next.nodes[nodeId].text).toBe("a");
  });

  it("すでに子がある場合は、既存の子の後ろに追加される", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.b);

    const { map: next, nodeId } = pasteNode(map, ids.root, copied);

    expect(next.nodes[ids.root].childIds).toEqual([ids.a, ids.b, nodeId]);
  });

  it("子孫も含めて、構造とテキストをそのまま貼り付ける", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a);

    const { map: next, nodeId } = pasteNode(map, ids.b, copied);

    expect(textsOf(next, nodeId)).toEqual(textsOf(map, ids.a));
    expect(next.nodes[nodeId].childIds).toHaveLength(2);
  });

  it("貼り付けた全ノードに新しいIDが振られ、元のノードと重複しない", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a);

    const { map: next, nodeId } = pasteNode(map, ids.b, copied);

    const allIds = Object.keys(next.nodes);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toHaveLength(Object.keys(map.nodes).length + Object.keys(copied.nodes).length);
    expect(nodeId).not.toBe(ids.a);
    for (const id of Object.keys(copied.nodes)) {
      // 元のノードは変わらず残り、貼り付けたノードのIDとは別物
      expect(next.nodes[id]).toEqual(map.nodes[id]);
    }
  });

  it("貼り付けたノードの親子関係（parentId と childIds）が互いに整合している", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a);

    const { map: next } = pasteNode(map, ids.b, copied);

    for (const node of Object.values(next.nodes)) {
      for (const childId of node.childIds) {
        expect(next.nodes[childId].parentId).toBe(node.id);
      }
      expect(next.nodes[node.id].id).toBe(node.id);
    }
  });

  it("貼り付けた根は、常にブランチになる（ルートをコピーしても）", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.root);

    const { map: next, nodeId } = pasteNode(map, ids.b, copied);

    expect(next.nodes[nodeId].kind).toBe("branch");
    for (const node of Object.values(next.nodes)) {
      if (node.id !== next.rootId) expect(node.kind).toBe("branch");
    }
    expect(next.nodes[next.rootId].kind).toBe("central");
  });

  it("同じサブツリーを何度でも貼り付けられる（毎回新しいID）", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a1);

    const first = pasteNode(map, ids.b, copied);
    const second = pasteNode(first.map, ids.b, copied);

    expect(first.nodeId).not.toBe(second.nodeId);
    expect(second.map.nodes[ids.b].childIds).toEqual([first.nodeId, second.nodeId]);
    expect(textsOf(second.map, second.nodeId)).toEqual(["a1", "a11"]);
  });

  it("ルート（セントラルイメージ）の子としても貼り付けられる", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a2);

    const { map: next, nodeId } = pasteNode(map, ids.root, copied);

    expect(next.nodes[nodeId].parentId).toBe(ids.root);
  });

  it("元のマインドマップとコピー結果を変更しない（イミュータブル）", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a);
    const mapBefore = structuredClone(map);
    const copiedBefore = structuredClone(copied);

    pasteNode(map, ids.b, copied);

    expect(map).toEqual(mapBefore);
    expect(copied).toEqual(copiedBefore);
  });

  it("貼り付け先のノードが存在しなければエラーになる", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a);

    expect(() => pasteNode(map, "missing", copied)).toThrow("貼り付け先のノードが存在しません: missing");
  });
});

describe("pasteNode（メインブランチの色）", () => {
  it("中心ノードの子として貼り付けた根は、新しいメインブランチとして、次の色が割り当てられる", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a1);

    const { map: next, nodeId } = pasteNode(map, ids.root, copied);

    expect(next.nodes[nodeId].branchColor).toBe(nextBranchColor(map));
  });

  it("貼り付けたサブツリーの、他のノードには、色は保存されない", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.root);

    const { map: next, nodeId } = pasteNode(map, ids.root, copied);

    const pastedIds = [nodeId, ...next.nodes[nodeId].childIds];
    const colored = pastedIds.filter((id) => "branchColor" in next.nodes[id]);
    expect(colored).toEqual([nodeId]);
  });

  it("メインブランチをコピーして、中心以外のノードの子として貼り付けると、古い色は残らない", () => {
    const { map, ids } = buildMap();
    const copied = copyNode(map, ids.a); // a はメインブランチ（色を持つ）

    const { map: next, nodeId } = pasteNode(map, ids.b, copied);

    expect("branchColor" in next.nodes[nodeId]).toBe(false);
  });
});
