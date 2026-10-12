import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { MAX_PASTE_LINES, parseClipboardText, subtreeToText } from "./clipboardText";
import { toggleCollapse } from "./collapse";
import { copyNode } from "./copyNode";
import { createMindMap } from "./mindmap";
import { setNodeStyle } from "./nodeStyle";
import { serialize } from "./serialize";

function sampleSubtree() {
  const base = createMindMap("root");
  const a = addChild(base, base.rootId, "企画");
  const a1 = addChild(a.map, a.nodeId, "調査");
  const styled = setNodeStyle(toggleCollapse(a1.map, a.nodeId), a.nodeId, {
    bold: true,
    color: "#123456",
  });
  return copyNode(styled, a.nodeId);
}

describe("subtreeToText（コピーしたサブツリーを、クリップボードの文字列にする）", () => {
  it("JSONの文字列で、IdeaTree のサブツリーであることを示す印を含む", () => {
    const text = subtreeToText(sampleSubtree());

    expect(JSON.parse(text).type).toBe("ideatree-subtree");
  });

  it("日本語がそのまま読める", () => {
    expect(subtreeToText(sampleSubtree())).toContain("企画");
  });

  it("元のサブツリーを変更しない", () => {
    const subtree = sampleSubtree();
    const before = structuredClone(subtree);

    subtreeToText(subtree);

    expect(subtree).toEqual(before);
  });
});

describe("parseClipboardText（クリップボードの文字列の解釈）", () => {
  describe("IdeaTree のサブツリー", () => {
    it("subtreeToText の結果を、元のサブツリーに復元できる（折りたたみ・スタイルも含む）", () => {
      const subtree = sampleSubtree();

      const content = parseClipboardText(subtreeToText(subtree));

      expect(content).toEqual({ kind: "subtree", subtree });
    });

    it("前後に空白や改行があっても、サブツリーとして読める", () => {
      const subtree = sampleSubtree();

      const content = parseClipboardText(`\n  ${subtreeToText(subtree)}  \n`);

      expect(content.kind).toBe("subtree");
    });

    it("印はあるが、中身が壊れている（親子関係の不整合・形式不正）場合は、貼り付けられない", () => {
      const data = JSON.parse(subtreeToText(sampleSubtree()));
      data.nodes[data.rootId].childIds.push("ghost");

      expect(parseClipboardText(JSON.stringify(data))).toEqual({ kind: "none" });
      expect(parseClipboardText(JSON.stringify({ type: "ideatree-subtree" }))).toEqual({
        kind: "none",
      });
    });

    it("対応していないバージョンのサブツリーは、貼り付けられない", () => {
      const data = JSON.parse(subtreeToText(sampleSubtree()));
      data.version = 999;

      expect(parseClipboardText(JSON.stringify(data))).toEqual({ kind: "none" });
    });
  });

  describe("普通のテキスト", () => {
    it("1行のテキストは、その1行を、貼り付けるテキストとして返す", () => {
      expect(parseClipboardText("アイデア")).toEqual({ kind: "lines", lines: ["アイデア"] });
    });

    it("複数行のテキストは、空行を除き、前後の空白を取り除いた行の一覧にする（改行は CRLF も可）", () => {
      expect(parseClipboardText("  企画 \r\n\r\n予算\n  \n\t調査\t")).toEqual({
        kind: "lines",
        lines: ["企画", "予算", "調査"],
      });
    });

    it("空文字列や、空白・改行だけのテキストは、貼り付けるものがない", () => {
      expect(parseClipboardText("")).toEqual({ kind: "none" });
      expect(parseClipboardText("  \n\t\r\n ")).toEqual({ kind: "none" });
    });

    it(`${MAX_PASTE_LINES} 行までは貼り付けられ、それを超える大きなテキストは貼り付けない`, () => {
      const lines = (n: number) => Array.from({ length: n }, (_, i) => `行${i}`).join("\n");

      expect(parseClipboardText(lines(MAX_PASTE_LINES))).toMatchObject({ kind: "lines" });
      expect(parseClipboardText(lines(MAX_PASTE_LINES + 1))).toEqual({ kind: "none" });
    });
  });

  describe("JSONのように見えるテキスト", () => {
    it("IdeaTree の保存ファイルの内容や、他のJSONは、文字の羅列を貼り付けないよう、貼り付けない", () => {
      const file = serialize(createMindMap("アイデア"));

      expect(parseClipboardText(file)).toEqual({ kind: "none" });
      expect(parseClipboardText('{"a":1}')).toEqual({ kind: "none" });
      expect(parseClipboardText("[1, 2, 3]")).toEqual({ kind: "none" });
    });

    it("波括弧や角括弧で始まらない普通の文章は、貼り付けられる", () => {
      expect(parseClipboardText("ブレース {a} を含む文")).toEqual({
        kind: "lines",
        lines: ["ブレース {a} を含む文"],
      });
    });
  });
});
