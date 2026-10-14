import { describe, expect, it } from "vitest";
import {
  MAX_RECENT_FILES,
  addRecentFile,
  parseRecentFiles,
  recentFileFolder,
  recentFileName,
  removeRecentFile,
  serializeRecentFiles,
} from "./recentFiles";

const t = (n: number) => new Date(Date.UTC(2026, 9, 14, 0, n));

describe("addRecentFile（最近使ったファイルへの追加）", () => {
  it("空の一覧に、パスと開いた時刻を追加する", () => {
    expect(addRecentFile([], "/Users/me/a.ideatree", t(1))).toEqual([
      { path: "/Users/me/a.ideatree", openedAt: t(1).toISOString() },
    ]);
  });

  it("新しく開いたファイルが、先頭になる（新しい順）", () => {
    const list = addRecentFile(addRecentFile([], "/a", t(1)), "/b", t(2));

    expect(list.map((f) => f.path)).toEqual(["/b", "/a"]);
  });

  it("すでにあるパスは、重複せず、先頭に移動して、時刻を更新する", () => {
    let list = addRecentFile([], "/a", t(1));
    list = addRecentFile(list, "/b", t(2));
    list = addRecentFile(list, "/a", t(3));

    expect(list).toEqual([
      { path: "/a", openedAt: t(3).toISOString() },
      { path: "/b", openedAt: t(2).toISOString() },
    ]);
  });

  it(`${MAX_RECENT_FILES} 件を超えたら、古いものから捨てる`, () => {
    let list: ReturnType<typeof addRecentFile> = [];
    for (let i = 0; i < MAX_RECENT_FILES + 3; i++) list = addRecentFile(list, `/file${i}`, t(i));

    expect(list).toHaveLength(MAX_RECENT_FILES);
    expect(list[0].path).toBe(`/file${MAX_RECENT_FILES + 2}`);
    expect(list.map((f) => f.path)).not.toContain("/file0");
  });

  it("元の一覧を変更しない", () => {
    const list = addRecentFile([], "/a", t(1));
    const before = structuredClone(list);

    addRecentFile(list, "/b", t(2));

    expect(list).toEqual(before);
  });
});

describe("removeRecentFile（一覧から外す）", () => {
  it("指定したパスを外し、他は順序を保つ。ないパスなら、同じ内容を返す", () => {
    let list = addRecentFile([], "/a", t(1));
    list = addRecentFile(list, "/b", t(2));
    list = addRecentFile(list, "/c", t(3));

    expect(removeRecentFile(list, "/b").map((f) => f.path)).toEqual(["/c", "/a"]);
    expect(removeRecentFile(list, "/zzz")).toEqual(list);
  });
});

describe("serializeRecentFiles・parseRecentFiles（保存と読み込み）", () => {
  it("保存したものを、そのまま読み込める（往復）", () => {
    let list = addRecentFile([], "/Users/me/日本語.ideatree", t(1));
    list = addRecentFile(list, "/Users/me/b.json", t(2));

    expect(parseRecentFiles(serializeRecentFiles(list))).toEqual(list);
  });

  it.each([["JSONとして不正", "{ not json"], ["配列でない", "{}"], ["null", "null"], ["空文字列", ""]])(
    "読み込めない内容（%s）は、空の一覧になる",
    (_name, text) => {
      expect(parseRecentFiles(text)).toEqual([]);
    },
  );

  it("不正な項目（パスが文字列でない・空、時刻が不正）は、取り除き、正しい項目だけを残す", () => {
    const text = JSON.stringify([
      { path: "/ok", openedAt: t(1).toISOString() },
      { path: 123, openedAt: t(1).toISOString() },
      { path: "", openedAt: t(1).toISOString() },
      { path: "/bad-time", openedAt: "いつか" },
      { path: "/no-time" },
      null,
      "文字列",
    ]);

    expect(parseRecentFiles(text)).toEqual([{ path: "/ok", openedAt: t(1).toISOString() }]);
  });

  it("重複するパスは、先に出てきたものだけを残し、件数の上限に収める", () => {
    const entries = Array.from({ length: MAX_RECENT_FILES + 5 }, (_, i) => ({
      path: `/f${i}`,
      openedAt: t(i).toISOString(),
    }));
    const text = JSON.stringify([{ path: "/f0", openedAt: t(99).toISOString() }, ...entries]);

    const list = parseRecentFiles(text);

    expect(list).toHaveLength(MAX_RECENT_FILES);
    expect(list.filter((f) => f.path === "/f0")).toHaveLength(1);
    expect(list[0].openedAt).toBe(t(99).toISOString());
  });
});

describe("recentFileName・recentFileFolder（一覧に表示する名前と場所）", () => {
  it("ファイル名は、パスの最後の部分。場所は、その親のフォルダ", () => {
    expect(recentFileName("/Users/me/Documents/ideas.ideatree")).toBe("ideas.ideatree");
    expect(recentFileFolder("/Users/me/Documents/ideas.ideatree")).toBe("/Users/me/Documents");
  });

  it("ルート直下のファイルは、場所が「/」。フォルダのないパスは、場所が空", () => {
    expect(recentFileFolder("/a.ideatree")).toBe("/");
    expect(recentFileName("a.ideatree")).toBe("a.ideatree");
    expect(recentFileFolder("a.ideatree")).toBe("");
  });
});
