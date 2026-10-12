import { describe, expect, it } from "vitest";
import { createMindMap } from "./mindmap";

describe("createMindMap（セントラルイメージの生成）", () => {
  it("中央ノードを1つだけ持つマインドマップを作成できる", () => {
    const map = createMindMap("アイデア");

    expect(Object.keys(map.nodes)).toHaveLength(1);
    expect(map.nodes[map.rootId]).toBeDefined();
  });

  it("中央ノードはルート（親なし）で、子ノードを持たない", () => {
    const map = createMindMap("アイデア");
    const root = map.nodes[map.rootId];

    expect(root.parentId).toBeNull();
    expect(root.childIds).toEqual([]);
  });

  it("中央ノードのテキストは指定したタイトルになる", () => {
    const map = createMindMap("アイデア");

    expect(map.nodes[map.rootId].text).toBe("アイデア");
  });

  it("中央ノードは画面中央（原点）に配置され、セントラルイメージの種別を持つ", () => {
    const map = createMindMap("アイデア");
    const root = map.nodes[map.rootId];

    expect(root.position).toEqual({ x: 0, y: 0 });
    expect(root.kind).toBe("central");
  });

  it("作成するたびに異なるIDが採番される", () => {
    expect(createMindMap("A").rootId).not.toBe(createMindMap("B").rootId);
  });
});
