import { describe, expect, it } from "vitest";
import { SHORTCUT_GROUPS } from "./shortcuts";

const allItems = SHORTCUT_GROUPS.flatMap((group) => group.items);
const find = (keys: string) => allItems.find((item) => item.keys === keys);

describe("SHORTCUT_GROUPS（ショートカット一覧）", () => {
  it("いくつかのグループに分かれ、各グループに題名と、1つ以上の項目がある", () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThanOrEqual(4);
    for (const group of SHORTCUT_GROUPS) {
      expect(group.title).not.toBe("");
      expect(group.items.length).toBeGreaterThan(0);
    }
    expect(new Set(SHORTCUT_GROUPS.map((g) => g.title)).size).toBe(SHORTCUT_GROUPS.length);
  });

  it("すべての項目に、キーと説明があり、キーは重複しない", () => {
    for (const item of allItems) {
      expect(item.keys).not.toBe("");
      expect(item.description).not.toBe("");
    }
    const keys = allItems.map((item) => item.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([
    ["Tab", "子"],
    ["Enter", "兄弟"],
    ["F2", "編集"],
    ["Delete / Backspace", "削除"],
    ["Space", "折りたた"],
    ["Cmd + Z", "元に戻"],
    ["Cmd + Shift + Z", "やり直"],
    ["Cmd + C / V / X", "コピー"],
    ["Cmd + B / I", "太字"],
    ["Cmd + K", "スタイル"],
    ["Cmd + Shift + I", "画像"],
    ["Cmd + S", "保存"],
    ["Cmd + Shift + S", "名前を付けて保存"],
    ["Cmd + O", "開く"],
    ["Cmd + Shift + E", "SVG"],
    ["Cmd + = / Cmd + - / Cmd + 0", "拡大"],
    ["Cmd + /", "ショートカット"],
  ])("主なショートカット「%s」が、説明（%s を含む）つきで載っている", (keys, word) => {
    const item = find(keys);

    expect(item, keys).toBeDefined();
    expect(item!.description).toContain(word);
  });

  it("マウスの操作（クリック・ドラッグ）も載っている", () => {
    expect(allItems.some((item) => item.keys.includes("ドラッグ"))).toBe(true);
    expect(allItems.some((item) => item.keys.includes("クリック"))).toBe(true);
  });
});
