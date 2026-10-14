import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { toggleCollapse } from "./collapse";
import type { MindMap, NodeId } from "./mindmap";
import { createMindMap } from "./mindmap";
import { MAX_OUTLINE_LINES, fromOutline, toOutline } from "./outline";
import { updateText } from "./updateText";

/** 中心「中心」の下に 企画（調査・競合）と 予算 */
function sample() {
  const root = createMindMap("中心");
  const a = addChild(root, root.rootId, "企画");
  const a1 = addChild(a.map, a.nodeId, "調査");
  const a2 = addChild(a1.map, a.nodeId, "競合");
  const b = addChild(a2.map, root.rootId, "予算");
  return { map: b.map, ids: { root: root.rootId, a: a.nodeId, a1: a1.nodeId, a2: a2.nodeId, b: b.nodeId } };
}

/** ノードのテキストを、深さ優先で、(深さ, テキスト) にする */
function shape(map: MindMap): [number, string][] {
  const result: [number, string][] = [];
  const walk = (id: NodeId, depth: number) => {
    result.push([depth, map.nodes[id].text]);
    map.nodes[id].childIds.forEach((child) => walk(child, depth + 1));
  };
  walk(map.rootId, 0);
  return result;
}

describe("toOutline（アウトラインへの書き出し）", () => {
  it("中心ノードを見出し（#）に、枝を、インデント付きの箇条書きにする", () => {
    expect(toOutline(sample().map)).toBe(
      ["# 中心", "- 企画", "  - 調査", "  - 競合", "- 予算", ""].join("\n"),
    );
  });

  it("中心ノードだけでも、見出しの1行になる", () => {
    expect(toOutline(createMindMap("だけ"))).toBe("# だけ\n");
  });

  it("折りたたまれたノードの子孫も、含める", () => {
    const { map, ids } = sample();

    expect(toOutline(toggleCollapse(map, ids.a))).toBe(toOutline(map));
  });

  it("ラベルの中の改行は、空白にする（1ノードは、1行）", () => {
    const { map, ids } = sample();

    expect(toOutline(updateText(map, ids.a, "企画\n案"))).toContain("- 企画 案\n");
  });
});

describe("fromOutline（アウトラインからの読み込み）", () => {
  it("toOutline の結果を、元の形（木の形とテキスト）に戻せる", () => {
    const { map } = sample();

    expect(shape(fromOutline(toOutline(map)))).toEqual(shape(map));
  });

  it("# の見出しが中心ノード、箇条書きが、メインブランチ以下になる", () => {
    const map = fromOutline("# 計画\n- A\n  - A1\n- B\n");

    expect(shape(map)).toEqual([
      [0, "計画"],
      [1, "A"],
      [2, "A1"],
      [1, "B"],
    ]);
  });

  it("メインブランチには、色が割り当てられる", () => {
    const map = fromOutline("# 計画\n- A\n- B\n");
    const [a, b] = map.nodes[map.rootId].childIds.map((id) => map.nodes[id].branchColor);

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
  });

  it("見出しがなく、一番上の行が1つなら、それが中心ノードになる", () => {
    const map = fromOutline("計画\n  A\n    A1\n  B\n");

    expect(shape(map)).toEqual([
      [0, "計画"],
      [1, "A"],
      [2, "A1"],
      [1, "B"],
    ]);
  });

  it("見出しがなく、一番上の行が複数なら、中心ノードは「中心テーマ」にして、それらをメインブランチにする", () => {
    const map = fromOutline("A\n  A1\nB\n");

    expect(shape(map)).toEqual([
      [0, "中心テーマ"],
      [1, "A"],
      [2, "A1"],
      [1, "B"],
    ]);
  });

  it.each([["-"], ["*"], ["+"], ["1."], ["2)"]])("箇条書きの印（%s）は、取り除く", (marker) => {
    const map = fromOutline(`# t\n${marker} 項目\n`);

    expect(shape(map)[1]).toEqual([1, "項目"]);
  });

  it("印のない行も、読める（インデントで、階層を決める）", () => {
    const map = fromOutline("# t\nA\n  A1\n");

    expect(shape(map)).toEqual([
      [0, "t"],
      [1, "A"],
      [2, "A1"],
    ]);
  });

  it("インデントは、スペース2つでも4つでも、タブでもよい", () => {
    expect(shape(fromOutline("# t\n- A\n    - A1\n"))[2]).toEqual([2, "A1"]);
    expect(shape(fromOutline("# t\n- A\n\t- A1\n"))[2]).toEqual([2, "A1"]);
  });

  it("インデントが一度に何段深くなっても、1段下の子として扱う", () => {
    const map = fromOutline("# t\n- A\n        - A1\n");

    expect(shape(map)[2]).toEqual([2, "A1"]);
  });

  it("浅くなったときは、同じ深さの、直前の兄弟のあとに並ぶ", () => {
    const map = fromOutline("# t\n- A\n  - A1\n    - A11\n  - A2\n- B\n");

    expect(shape(map)).toEqual([
      [0, "t"],
      [1, "A"],
      [2, "A1"],
      [3, "A11"],
      [2, "A2"],
      [1, "B"],
    ]);
  });

  it("空行・前後の空白・Windows の改行（CRLF）・先頭の BOM は、無視する", () => {
    const map = fromOutline("﻿# t\r\n\r\n-   A  \r\n\r\n- B\r\n");

    expect(shape(map)).toEqual([
      [0, "t"],
      [1, "A"],
      [1, "B"],
    ]);
  });

  it("見出しの # のあとの空白がなくても、# だけの行は、テキストとして読む", () => {
    expect(shape(fromOutline("#タグ\n"))[0]).toEqual([0, "#タグ"]);
  });

  it("見出し（#）が先頭以外にあっても、普通のテキストとして読む", () => {
    const map = fromOutline("# t\n- A\n# 別の見出し\n");

    expect(shape(map)[2]).toEqual([1, "# 別の見出し"]);
  });

  it("テキストが1行もなければ、エラーにする", () => {
    expect(() => fromOutline("")).toThrow("アウトラインにテキストがありません");
    expect(() => fromOutline("  \n\n \t\n")).toThrow("アウトラインにテキストがありません");
    expect(() => fromOutline("-\n")).toThrow("アウトラインにテキストがありません");
  });

  it("行数が多すぎれば、エラーにする", () => {
    const text = Array.from({ length: MAX_OUTLINE_LINES + 1 }, (_, i) => `- ${i}`).join("\n");

    expect(() => fromOutline(text)).toThrow("行数が多すぎます");
  });

  it("上限ちょうどの行数は、読める", () => {
    const text = Array.from({ length: MAX_OUTLINE_LINES }, (_, i) => `- ${i}`).join("\n");

    expect(Object.keys(fromOutline(text).nodes)).toHaveLength(MAX_OUTLINE_LINES + 1);
  });
});
