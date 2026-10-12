import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addChild } from "../domain/addChild";
import { createMindMap } from "../domain/mindmap";
import { serialize } from "../domain/serialize";
import { saveFile } from "./saveFile";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

const mockedSave = vi.mocked(save);
const mockedInvoke = vi.mocked(invoke);

function sampleMap() {
  const base = createMindMap("アイデア");
  return addChild(base, base.rootId, "企画").map;
}

describe("saveFile（JSON保存 / Cmd+S）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("保存先が未決定のとき（名前を付けて保存）", () => {
    it("JSONフィルタと既定のファイル名を指定して、保存ダイアログを開く", async () => {
      mockedSave.mockResolvedValue("/Users/me/map.json");

      await saveFile(sampleMap());

      expect(mockedSave).toHaveBeenCalledWith({
        title: "マインドマップを保存",
        defaultPath: "IdeaTree.json",
        filters: [{ name: "IdeaTree (JSON)", extensions: ["json"] }],
      });
    });

    it("選ばれたパスへ、シリアライズしたJSONを書き込み、そのパスを返す", async () => {
      const map = sampleMap();
      mockedSave.mockResolvedValue("/Users/me/map.json");
      mockedInvoke.mockResolvedValue(undefined);

      const result = await saveFile(map);

      expect(mockedInvoke).toHaveBeenCalledWith("save_file", {
        path: "/Users/me/map.json",
        contents: serialize(map),
      });
      expect(result).toBe("/Users/me/map.json");
    });

    it("拡張子が .json でなければ補う", async () => {
      mockedSave.mockResolvedValue("/Users/me/map");
      mockedInvoke.mockResolvedValue(undefined);

      const result = await saveFile(sampleMap());

      expect(mockedInvoke).toHaveBeenCalledWith(
        "save_file",
        expect.objectContaining({ path: "/Users/me/map.json" }),
      );
      expect(result).toBe("/Users/me/map.json");
    });

    it("拡張子の大文字小文字は区別せず、既に .JSON なら補わない", async () => {
      mockedSave.mockResolvedValue("/Users/me/MAP.JSON");
      mockedInvoke.mockResolvedValue(undefined);

      expect(await saveFile(sampleMap())).toBe("/Users/me/MAP.JSON");
    });

    it("ダイアログをキャンセルしたら、何も書き込まず null を返す", async () => {
      mockedSave.mockResolvedValue(null);

      const result = await saveFile(sampleMap());

      expect(result).toBeNull();
      expect(mockedInvoke).not.toHaveBeenCalled();
    });
  });

  describe("保存先が決まっているとき（上書き保存）", () => {
    it("ダイアログを開かず、既存のパスへ書き込む", async () => {
      const map = sampleMap();
      mockedInvoke.mockResolvedValue(undefined);

      const result = await saveFile(map, "/Users/me/existing.json");

      expect(mockedSave).not.toHaveBeenCalled();
      expect(mockedInvoke).toHaveBeenCalledWith("save_file", {
        path: "/Users/me/existing.json",
        contents: serialize(map),
      });
      expect(result).toBe("/Users/me/existing.json");
    });
  });

  describe("エラー", () => {
    it("書き込みに失敗したら、理由を含む日本語のエラーにする", async () => {
      mockedSave.mockResolvedValue("/Users/me/map.json");
      mockedInvoke.mockRejectedValue("Permission denied");

      await expect(saveFile(sampleMap())).rejects.toThrow("保存に失敗しました: Permission denied");
    });

    it("Error オブジェクトで失敗した場合も、メッセージを含める", async () => {
      mockedInvoke.mockRejectedValue(new Error("disk full"));

      await expect(saveFile(sampleMap(), "/x.json")).rejects.toThrow("保存に失敗しました: disk full");
    });
  });
});
