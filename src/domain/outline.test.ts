import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { toggleCollapse } from "./collapse";
import type { MindMap, NodeId } from "./mindmap";
import { createMindMap } from "./mindmap";
import { MAX_OUTLINE_LINES, fromOutline, toOutline } from "./outline";
import { setNodeLink, setNodeNote } from "./nodeNote";
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

describe("アウトラインの、リンクとメモ", () => {
  it("リンクは、[ラベル](URL) の形で書き出す", () => {
    const { map, ids } = sample();
    const linked = setNodeLink(map, ids.a, "https://example.com/a");

    expect(toOutline(linked)).toContain("- [企画](https://example.com/a)\n");
  });

  it("URL の中の括弧は、%28・%29 にして、書き出す（リンクの括弧と、取り違えないように）", () => {
    const { map, ids } = sample();
    const linked = setNodeLink(map, ids.a, "https://example.com/a_(b)");

    expect(toOutline(linked)).toContain("- [企画](https://example.com/a_%28b%29)\n");
  });

  it("メモは、そのノードの行の直後に、「> 」で始まる行として、書き出す（子と同じインデント）", () => {
    const { map, ids } = sample();
    const noted = setNodeNote(map, ids.a, "一行目\n\n三行目");

    expect(toOutline(noted)).toBe(
      ["# 中心", "- 企画", "  > 一行目", "  >", "  > 三行目", "  - 調査", "  - 競合", "- 予算", ""].join(
        "\n",
      ),
    );
  });

  it("中心ノードのメモは、見出しの直後に書き出す", () => {
    const { map, ids } = sample();
    const noted = setNodeNote(map, ids.root, "全体のメモ");

    expect(toOutline(noted).split("\n").slice(0, 3)).toEqual(["# 中心", "> 全体のメモ", "- 企画"]);
  });

  it("リンクとメモを、すべて含む木を、書き出して読み込むと、元に戻る", () => {
    const { map, ids } = sample();
    let rich = setNodeLink(map, ids.a1, "https://example.com/a_(b)?x=1#y");
    rich = setNodeNote(rich, ids.a1, "調査のメモ\n二行目");
    rich = setNodeNote(rich, ids.root, "全体のメモ");
    rich = setNodeLink(rich, ids.root, "https://root.example/");
    rich = setNodeNote(rich, ids.b, "予算のメモ");

    const restored = fromOutline(toOutline(rich));

    const detail = (m: MindMap) =>
      Object.values(m.nodes)
        .map((n) => [n.text, n.link, n.note])
        .sort();
    expect(detail(restored)).toEqual(detail(rich));
    expect(shape(restored)).toEqual(shape(rich));
  });

  it("[ラベル](URL) は、ラベルとリンクに分けて読み込む（箇条書きの印は、あってもなくてもよい）", () => {
    const map = fromOutline("# t\n- [企画](https://example.com/a)\n[予算](http://example.com/b)\n");

    const [a, b] = map.nodes[map.rootId].childIds.map((id) => map.nodes[id]);
    expect([a.text, a.link]).toEqual(["企画", "https://example.com/a"]);
    expect([b.text, b.link]).toEqual(["予算", "http://example.com/b"]);
  });

  it("%28・%29 は、リンクの URL として、そのまま保つ", () => {
    const map = fromOutline("# t\n- [x](https://example.com/a_%28b%29)\n");

    expect(map.nodes[map.nodes[map.rootId].childIds[0]].link).toBe("https://example.com/a_%28b%29");
  });

  it("http・https でない URL・URL として読めないものは、リンクにせず、そのままのテキストにする", () => {
    const map = fromOutline("# t\n- [x](javascript:alert(1))\n- [y](file:///etc/passwd)\n- [z](https://)\n");

    const kids = map.nodes[map.rootId].childIds.map((id) => map.nodes[id]);
    expect(kids.map((k) => k.link)).toEqual([undefined, undefined, undefined]);
    expect(kids[1].text).toBe("[y](file:///etc/passwd)");
  });

  it("文の途中の [ ] ( ) は、リンクとして扱わない", () => {
    const map = fromOutline("# t\n- 前 [x](https://example.com/) 後\n");

    const node = map.nodes[map.nodes[map.rootId].childIds[0]];
    expect(node.text).toBe("前 [x](https://example.com/) 後");
    expect(node.link).toBeUndefined();
  });

  it("「> 」の行は、直前のノードのメモになる（複数行・空行も）", () => {
    const map = fromOutline("# t\n- A\n  > 一行目\n  >\n  > 三行目\n  - A1\n- B\n");

    const [a, b] = map.nodes[map.rootId].childIds.map((id) => map.nodes[id]);
    expect(a.note).toBe("一行目\n\n三行目");
    expect(b.note).toBeUndefined();
    expect(shape(map)).toEqual([
      [0, "t"],
      [1, "A"],
      [2, "A1"],
      [1, "B"],
    ]);
  });

  it("見出しの直後の「> 」の行は、中心ノードのメモになる", () => {
    const map = fromOutline("# 計画\n> 全体のメモ\n- A\n");

    expect(map.nodes[map.rootId].note).toBe("全体のメモ");
  });

  it("見出しがなく、一番上の行が中心ノードになるときも、その直後のメモは、中心ノードのメモ", () => {
    const map = fromOutline("計画\n> 全体のメモ\n  A\n");

    expect(map.nodes[map.rootId].note).toBe("全体のメモ");
    expect(shape(map)).toEqual([
      [0, "計画"],
      [1, "A"],
    ]);
  });

  it("メモの先頭・末尾の空行は、取り除く。空のメモ（> だけ）は、付けない", () => {
    const map = fromOutline("# t\n- A\n  >\n  > 本文\n  >\n- B\n  >\n");

    const [a, b] = map.nodes[map.rootId].childIds.map((id) => map.nodes[id]);
    expect(a.note).toBe("本文");
    expect(b.note).toBeUndefined();
  });

  it("ノードの前にある「> 」の行（メモをつける先がない）は、普通のテキストの行として読む", () => {
    const map = fromOutline("> 引用\n- A\n");

    expect(map.nodes[map.rootId].text).toBe("中心テーマ");
    expect(shape(map)[1]).toEqual([1, "> 引用"]);
  });

  it("「>」で始まらない行の途中の > は、メモにしない", () => {
    const map = fromOutline("# t\n- a > b\n");

    expect(map.nodes[map.nodes[map.rootId].childIds[0]].text).toBe("a > b");
    expect(map.nodes[map.nodes[map.rootId].childIds[0]].note).toBeUndefined();
  });

  it("メモが長すぎれば、エラーにする", () => {
    const text = `# t\n- A\n${Array.from({ length: 1100 }, () => "  > 0123456789").join("\n")}\n`;

    expect(() => fromOutline(text)).toThrow("メモが長すぎます");
  });
});
