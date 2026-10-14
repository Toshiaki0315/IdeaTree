import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { createMindMap } from "./mindmap";
import {
  MAX_LINK_LENGTH,
  MAX_NOTE_LENGTH,
  isLink,
  isNote,
  linkError,
  normalizeLink,
  setNodeLink,
  setNodeNote,
} from "./nodeNote";

function sample() {
  const root = createMindMap("中心");
  const a = addChild(root, root.rootId, "企画");
  return { map: a.map, id: a.nodeId };
}

describe("normalizeLink（リンクの正規化）", () => {
  it("http・https の URL は、そのまま使える（前後の空白は取り除く）", () => {
    expect(normalizeLink("  https://example.com/a?b=1#c  ")).toBe("https://example.com/a?b=1#c");
    expect(normalizeLink("http://example.com/path")).toBe("http://example.com/path");
  });

  it("スキームがなければ、https:// を補う（ポート番号つきでも）", () => {
    expect(normalizeLink("example.com/path")).toBe("https://example.com/path");
    expect(normalizeLink("example.com:8080/x")).toBe("https://example.com:8080/x");
  });

  it("日本語のドメインやパスも、URL として正規化する", () => {
    expect(normalizeLink("https://例え.jp/パス")).toBe(new URL("https://例え.jp/パス").href);
  });

  it("空（空白だけ）なら、リンクなし（undefined）", () => {
    expect(normalizeLink("")).toBeUndefined();
    expect(normalizeLink("   ")).toBeUndefined();
  });

  it.each([
    ["javascript:alert(1)"],
    ["JavaScript:alert(1)"],
    ["data:text/html,<b>x</b>"],
    ["file:///etc/passwd"],
    ["mailto:a@example.com"],
    ["ftp://example.com/"],
    ["vbscript:x"],
  ])("http・https 以外（%s）は、エラーにする", (input) => {
    expect(() => normalizeLink(input)).toThrow("リンクは、http か https の URL にしてください");
  });

  it("URL として読めないもの、長すぎるものは、エラーにする", () => {
    expect(() => normalizeLink("https://")).toThrow("リンクは、http か https の URL にしてください");
    expect(() => normalizeLink("http://exa mple.com")).toThrow(
      "リンクは、http か https の URL にしてください",
    );
    expect(() => normalizeLink(`https://example.com/${"a".repeat(MAX_LINK_LENGTH)}`)).toThrow(
      "リンクが長すぎます",
    );
  });
});

describe("linkError（入力中のリンクの検証）", () => {
  it("有効、または空なら null。無効なら、理由を返す", () => {
    expect(linkError("example.com")).toBeNull();
    expect(linkError("")).toBeNull();
    expect(linkError("javascript:x")).toBe("リンクは、http か https の URL にしてください");
    expect(linkError(`https://e.com/${"a".repeat(MAX_LINK_LENGTH)}`)).toBe(
      `リンクが長すぎます（上限 ${MAX_LINK_LENGTH} 文字）`,
    );
  });
});

describe("isLink / isNote（保存データの検証）", () => {
  it("isLink は、http・https の URL（上限以内）だけを認める", () => {
    expect(isLink("https://example.com/")).toBe(true);
    expect(isLink("http://example.com")).toBe(true);
    expect(isLink("javascript:alert(1)")).toBe(false);
    expect(isLink("example.com")).toBe(false);
    expect(isLink("https://")).toBe(false);
    expect(isLink(`https://e.com/${"a".repeat(MAX_LINK_LENGTH)}`)).toBe(false);
    expect(isLink(1)).toBe(false);
  });

  it("isNote は、上限以内の文字列を認める", () => {
    expect(isNote("メモ")).toBe(true);
    expect(isNote("a".repeat(MAX_NOTE_LENGTH))).toBe(true);
    expect(isNote("a".repeat(MAX_NOTE_LENGTH + 1))).toBe(false);
    expect(isNote(1)).toBe(false);
  });
});

describe("setNodeNote（メモの設定）", () => {
  it("メモを設定する。元のマップは変えない", () => {
    const { map, id } = sample();

    const updated = setNodeNote(map, id, "補足の文章");

    expect(updated.nodes[id].note).toBe("補足の文章");
    expect(map.nodes[id].note).toBeUndefined();
  });

  it("前後の空白は取り除く。空（空白だけ）なら、メモを外す", () => {
    const { map, id } = sample();
    const noted = setNodeNote(map, id, "  メモ \n");

    expect(noted.nodes[id].note).toBe("メモ");
    const cleared = setNodeNote(noted, id, "  \n");
    expect("note" in cleared.nodes[id]).toBe(false);
  });

  it("undefined で外す。変化がなければ、同じマップを返す", () => {
    const { map, id } = sample();
    const noted = setNodeNote(map, id, "メモ");

    expect(setNodeNote(noted, id, "メモ")).toBe(noted);
    expect(setNodeNote(map, id, undefined)).toBe(map);
    expect("note" in setNodeNote(noted, id, undefined).nodes[id]).toBe(false);
  });

  it("長すぎるメモ・存在しないノードは、エラーにする", () => {
    const { map, id } = sample();

    expect(() => setNodeNote(map, id, "a".repeat(MAX_NOTE_LENGTH + 1))).toThrow("メモが長すぎます");
    expect(() => setNodeNote(map, "ghost", "x")).toThrow("ノードが存在しません: ghost");
  });
});

describe("setNodeLink（リンクの設定）", () => {
  it("リンクを設定する。元のマップは変えない", () => {
    const { map, id } = sample();

    const updated = setNodeLink(map, id, "https://example.com/");

    expect(updated.nodes[id].link).toBe("https://example.com/");
    expect(map.nodes[id].link).toBeUndefined();
  });

  it("undefined で外す。変化がなければ、同じマップを返す", () => {
    const { map, id } = sample();
    const linked = setNodeLink(map, id, "https://example.com/");

    expect(setNodeLink(linked, id, "https://example.com/")).toBe(linked);
    expect(setNodeLink(map, id, undefined)).toBe(map);
    expect("link" in setNodeLink(linked, id, undefined).nodes[id]).toBe(false);
  });

  it("http・https の URL でなければ、エラーにする。存在しないノードも、エラー", () => {
    const { map, id } = sample();

    expect(() => setNodeLink(map, id, "javascript:alert(1)")).toThrow(
      "リンクは、http か https の URL にしてください",
    );
    expect(() => setNodeLink(map, "ghost", "https://example.com/")).toThrow("ノードが存在しません: ghost");
  });
});
