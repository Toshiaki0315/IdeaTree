import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addChild } from "../domain/addChild";
import { createMindMap } from "../domain/mindmap";
import { serialize } from "../domain/serialize";
import { loadFile, loadFileAt } from "./loadFile";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const mockedOpen = vi.mocked(open);
const mockedInvoke = vi.mocked(invoke);

function sampleMap() {
  const base = createMindMap("アイデア");
  return addChild(base, base.rootId, "企画").map;
}

describe("loadFile（JSON読み込み / Cmd+O）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("JSONフィルタを指定し、単一ファイルを選ぶ読み込みダイアログを開く", async () => {
    mockedOpen.mockResolvedValue(null);

    await loadFile();

    expect(mockedOpen).toHaveBeenCalledWith({
      title: "マインドマップを開く",
      multiple: false,
      directory: false,
      filters: [{ name: "IdeaTree (JSON)", extensions: ["json"] }],
    });
  });

  it("選ばれたパスのファイルを読み込み、復元したマップとパスを返す", async () => {
    const map = sampleMap();
    mockedOpen.mockResolvedValue("/Users/me/map.json");
    mockedInvoke.mockResolvedValue(serialize(map));

    const result = await loadFile();

    expect(mockedInvoke).toHaveBeenCalledWith("load_file", { path: "/Users/me/map.json" });
    expect(result).toEqual({ map, path: "/Users/me/map.json" });
  });

  it("ダイアログをキャンセルしたら、何も読み込まず null を返す", async () => {
    mockedOpen.mockResolvedValue(null);

    expect(await loadFile()).toBeNull();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  describe("エラー", () => {
    beforeEach(() => {
      mockedOpen.mockResolvedValue("/Users/me/map.json");
    });

    it("ファイルの読み込みに失敗したら、理由を含む日本語のエラーにする", async () => {
      mockedInvoke.mockRejectedValue("No such file");

      await expect(loadFile()).rejects.toThrow("読み込みに失敗しました: No such file");
    });

    it("Error オブジェクトで失敗した場合も、メッセージを含める", async () => {
      mockedInvoke.mockRejectedValue(new Error("permission denied"));

      await expect(loadFile()).rejects.toThrow("読み込みに失敗しました: permission denied");
    });

    it("JSONとして不正な内容なら、理由を含むエラーにする", async () => {
      mockedInvoke.mockResolvedValue("{ not json");

      await expect(loadFile()).rejects.toThrow("読み込みに失敗しました: JSONの形式が不正です");
    });

    it("未対応のバージョンのファイルなら、そのバージョンを含むエラーにする", async () => {
      const data = JSON.parse(serialize(sampleMap()));
      data.version = 2;
      mockedInvoke.mockResolvedValue(JSON.stringify(data));

      await expect(loadFile()).rejects.toThrow(
        "読み込みに失敗しました: 未対応のバージョンです: 2",
      );
    });

    it("親子関係が壊れたデータは、読み込まずにエラーにする", async () => {
      const map = sampleMap();
      const data = JSON.parse(serialize(map));
      data.nodes[map.rootId].childIds.push("ghost");
      mockedInvoke.mockResolvedValue(JSON.stringify(data));

      await expect(loadFile()).rejects.toThrow(
        "読み込みに失敗しました: 子ノードが存在しません: ghost",
      );
    });
  });
});

describe("loadFileAt（パスを指定してファイルを読み込む）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ダイアログを開かず、指定したパスのファイルを読み込み、復元したマップとパスを返す", async () => {
    const map = sampleMap();
    mockedInvoke.mockResolvedValue(serialize(map));

    const result = await loadFileAt("/Users/me/map.ideatree");

    expect(mockedOpen).not.toHaveBeenCalled();
    expect(mockedInvoke).toHaveBeenCalledWith("load_file", { path: "/Users/me/map.ideatree" });
    expect(result).toEqual({ map, path: "/Users/me/map.ideatree" });
  });

  it("読み込めない・壊れたファイルは、理由を含む日本語のエラーにする", async () => {
    mockedInvoke.mockRejectedValueOnce("ファイルが見つかりません: /x");
    await expect(loadFileAt("/x")).rejects.toThrow("読み込みに失敗しました: ファイルが見つかりません: /x");

    mockedInvoke.mockResolvedValueOnce("{ not json");
    await expect(loadFileAt("/x")).rejects.toThrow("読み込みに失敗しました: JSONの形式が不正です");
  });
});

