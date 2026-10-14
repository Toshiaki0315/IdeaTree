import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addRecentFile, serializeRecentFiles } from "../domain/recentFiles";
import { readRecentFiles, writeRecentFiles } from "./recent";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const sample = addRecentFile(
  addRecentFile([], "/a.ideatree", new Date(2026, 9, 14)),
  "/b.ideatree",
  new Date(2026, 9, 15),
);

describe("最近使ったファイルの読み書き", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("readRecentFiles", () => {
    it("read_recent_files コマンドの結果を、一覧として返す", async () => {
      mockedInvoke.mockResolvedValue(serializeRecentFiles(sample));

      expect(await readRecentFiles()).toEqual(sample);
      expect(mockedInvoke).toHaveBeenCalledWith("read_recent_files");
    });

    it("一覧がなければ、壊れていれば、空の一覧を返す", async () => {
      mockedInvoke.mockResolvedValueOnce(null);
      expect(await readRecentFiles()).toEqual([]);

      mockedInvoke.mockResolvedValueOnce("{ not json");
      expect(await readRecentFiles()).toEqual([]);
    });

    it("読み込みに失敗したら、理由を含む日本語のエラーにする（文字列でも Error でも）", async () => {
      mockedInvoke.mockRejectedValueOnce("denied");
      await expect(readRecentFiles()).rejects.toThrow("最近使ったファイルを読み込めません: denied");

      mockedInvoke.mockRejectedValueOnce(new Error("busy"));
      await expect(readRecentFiles()).rejects.toThrow("最近使ったファイルを読み込めません: busy");
    });
  });

  describe("writeRecentFiles", () => {
    it("一覧を JSON にして、write_recent_files コマンドに渡す", async () => {
      mockedInvoke.mockResolvedValue(undefined);

      await writeRecentFiles(sample);

      expect(mockedInvoke).toHaveBeenCalledWith("write_recent_files", {
        contents: serializeRecentFiles(sample),
      });
    });

    it("書き込みに失敗したら、理由を含む日本語のエラーにする", async () => {
      mockedInvoke.mockRejectedValueOnce("disk full");
      await expect(writeRecentFiles(sample)).rejects.toThrow("最近使ったファイルを保存できません: disk full");

      mockedInvoke.mockRejectedValueOnce(new Error("busy"));
      await expect(writeRecentFiles(sample)).rejects.toThrow("最近使ったファイルを保存できません: busy");
    });
  });
});
