import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { toggleCollapse } from "./collapse";
import { createMindMap } from "./mindmap";
import { documentOrder, revealNode, searchNodes } from "./search";
import { updateText } from "./updateText";

/** 中心「Root」─ a「Apple」(a1「apple pie」(a11「Pineapple」), a2「banana」) / b「Berry」 の木 */
function buildMap() {
  const base = createMindMap("Root");
  const a = addChild(base, base.rootId, "Apple");
  const b = addSibling(a.map, a.nodeId, "Berry");
  const a1 = addChild(b.map, a.nodeId, "apple pie");
  const a2 = addSibling(a1.map, a1.nodeId, "banana");
  const a11 = addChild(a2.map, a1.nodeId, "Pineapple");
  return {
    map: a11.map,
    ids: { root: base.rootId, a: a.nodeId, b: b.nodeId, a1: a1.nodeId, a2: a2.nodeId, a11: a11.nodeId },
  };
}

describe("searchNodes（ノードのテキストの検索）", () => {
  it("テキストに、検索語を含むノードを、深さ優先（子の順）で返す。大文字小文字は区別しない", () => {
    const { map, ids } = buildMap();

    expect(searchNodes(map, "apple")).toEqual([ids.a, ids.a1, ids.a11]);
    expect(searchNodes(map, "APPLE")).toEqual([ids.a, ids.a1, ids.a11]);
  });

  it("中心ノードも対象になる", () => {
    const { map, ids } = buildMap();

    expect(searchNodes(map, "root")).toEqual([ids.root]);
  });

  it("途中の文字列にも一致する（部分一致）", () => {
    const { map, ids } = buildMap();

    expect(searchNodes(map, "nan")).toEqual([ids.a2]);
    expect(searchNodes(map, "erry")).toEqual([ids.b]);
  });

  it("折りたたまれて見えないノードも、検索に含める", () => {
    const { map, ids } = buildMap();
    const folded = toggleCollapse(map, ids.a);

    expect(searchNodes(folded, "pineapple")).toEqual([ids.a11]);
  });

  it("前後の空白は無視し、空や空白だけの検索語は、何にも一致しない", () => {
    const { map, ids } = buildMap();

    expect(searchNodes(map, "  berry  ")).toEqual([ids.b]);
    expect(searchNodes(map, "")).toEqual([]);
    expect(searchNodes(map, "   ")).toEqual([]);
  });

  it("一致するものがなければ、空の一覧を返す", () => {
    const { map } = buildMap();

    expect(searchNodes(map, "zzz")).toEqual([]);
  });

  it("正規表現の記号は、普通の文字として扱う", () => {
    const { map, ids } = buildMap();
    const dotted = updateText(map, ids.b, "a.b (1)");

    expect(searchNodes(dotted, "a.b")).toEqual([ids.b]);
    expect(searchNodes(dotted, "axb")).toEqual([]);
    expect(searchNodes(dotted, "(1)")).toEqual([ids.b]);
    expect(searchNodes(dotted, ".*")).toEqual([]);
  });

  it("日本語のテキストも検索できる", () => {
    const { map, ids } = buildMap();
    const jp = updateText(map, ids.a2, "企画案の検討");

    expect(searchNodes(jp, "企画")).toEqual([ids.a2]);
  });

  it("元のマインドマップを変更しない", () => {
    const { map } = buildMap();
    const before = structuredClone(map);

    searchNodes(map, "apple");

    expect(map).toEqual(before);
  });
});

describe("revealNode（ノードが見えるよう、折りたたまれた祖先を展開）", () => {
  it("すでに見えているノードなら、同じマップをそのまま返す", () => {
    const { map, ids } = buildMap();

    expect(revealNode(map, ids.a11)).toBe(map);
    expect(revealNode(map, ids.root)).toBe(map);
  });

  it("折りたたまれた祖先を、すべて展開する（そのノード自身や、兄弟の折りたたみは、そのまま）", () => {
    const { map, ids } = buildMap();
    const folded = toggleCollapse(toggleCollapse(toggleCollapse(map, ids.a1), ids.a), ids.root);
    expect(folded.nodes[ids.a1].collapsed).toBe(true);

    const revealed = revealNode(folded, ids.a11);

    expect(revealed.nodes[ids.root].collapsed).toBe(false);
    expect(revealed.nodes[ids.a].collapsed).toBe(false);
    expect(revealed.nodes[ids.a1].collapsed).toBe(false);
    expect(revealed.nodes[ids.b]).toBe(folded.nodes[ids.b]);
  });

  it("折りたたまれたノード自身は、見えているので、展開しない", () => {
    const { map, ids } = buildMap();
    const folded = toggleCollapse(map, ids.a1);

    expect(revealNode(folded, ids.a1)).toBe(folded);
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const { map } = buildMap();

    expect(() => revealNode(map, "missing")).toThrow("ノードが存在しません: missing");
  });

  it("元のマインドマップを変更しない", () => {
    const { map, ids } = buildMap();
    const folded = toggleCollapse(map, ids.a);
    const before = structuredClone(folded);

    revealNode(folded, ids.a11);

    expect(folded).toEqual(before);
  });
});

describe("documentOrder（ノードを、深さ優先で並べた順序）", () => {
  it("中心ノードから、子の順に、深さ優先で、全ノードを並べる（折りたたまれたノードの子孫も含む）", () => {
    const { map, ids } = buildMap();

    expect(documentOrder(map)).toEqual([ids.root, ids.a, ids.a1, ids.a11, ids.a2, ids.b]);
    expect(documentOrder(toggleCollapse(map, ids.a))).toEqual(documentOrder(map));
  });

  it("検索の結果は、この順序に従う", () => {
    const { map } = buildMap();
    const order = documentOrder(map);
    const found = searchNodes(map, "a");

    expect(found).toEqual(order.filter((id) => found.includes(id)));
  });
});
