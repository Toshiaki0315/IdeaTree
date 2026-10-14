import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addChild } from "../domain/addChild";
import { createMindMap } from "../domain/mindmap";
import { serialize } from "../domain/serialize";
import { clearAutosave, readAutosave, writeAutosave } from "./autosave";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

function sampleMap() {
  const base = createMindMap("アイデア");
  return addChild(base, base.rootId, "企画").map;
}

describe("自動保存（フロントエンド）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("writeAutosave", () => {
    it("マップと保存先と時刻を、JSON にして、write_autosave コマンドに渡す", async () => {
      mockedInvoke.mockResolvedValue(undefined);
      const map = sampleMap();

      await writeAutosave(map, "/Users/me/map.json", new Date("2026-10-14T12:34:56.000Z"));

      expect(mockedInvoke).toHaveBeenCalledTimes(1);
      const [command, args] = mockedInvoke.mock.calls[0] as [string, { contents: string }];
      expect(command).toBe("write_autosave");
      expect(JSON.parse(args.contents)).toEqual({
        savedAt: "2026-10-14T12:34:56.000Z",
        filePath: "/Users/me/map.json",
        document: serialize(map),
      });
    });

    it("保存先がまだないときは、filePath を null にする。時刻を省略すると、現在の時刻", async () => {
      mockedInvoke.mockResolvedValue(undefined);

      await writeAutosave(sampleMap(), undefined);

      const [, args] = mockedInvoke.mock.calls[0] as [string, { contents: string }];
      const saved = JSON.parse(args.contents);
      expect(saved.filePath).toBeNull();
      expect(Math.abs(new Date(saved.savedAt).getTime() - Date.now())).toBeLessThan(5000);
    });

    it("失敗したら、理由を含む日本語のエラーにする（文字列でも Error でも）", async () => {
      mockedInvoke.mockRejectedValueOnce("disk full");
      await expect(writeAutosave(sampleMap(), undefined)).rejects.toThrow(
        "自動保存に失敗しました: disk full",
      );

      mockedInvoke.mockRejectedValueOnce(new Error("busy"));
      await expect(writeAutosave(sampleMap(), undefined)).rejects.toThrow("自動保存に失敗しました: busy");
    });
  });

  describe("readAutosave", () => {
    const stored = (map = sampleMap(), filePath: string | null = "/Users/me/map.json") =>
      JSON.stringify({ savedAt: "2026-10-14T12:34:56.000Z", filePath, document: serialize(map) });

    it("read_autosave コマンドの結果を読んで、マップ・保存先・時刻を返す", async () => {
      const map = sampleMap();
      mockedInvoke.mockResolvedValue(stored(map));

      const result = await readAutosave();

      expect(mockedInvoke).toHaveBeenCalledWith("read_autosave");
      expect(result).toEqual({
        map,
        filePath: "/Users/me/map.json",
        savedAt: new Date("2026-10-14T12:34:56.000Z"),
      });
    });

    it("保存先が null なら、filePath は undefined", async () => {
      mockedInvoke.mockResolvedValue(stored(sampleMap(), null));

      expect((await readAutosave())!.filePath).toBeUndefined();
    });

    it("自動保存がなければ、null を返す", async () => {
      mockedInvoke.mockResolvedValue(null);

      expect(await readAutosave()).toBeNull();
    });

    it.each([
      ["JSON として不正", "{ not json"],
      ["オブジェクトでない", "[]"],
      ["document がない", JSON.stringify({ savedAt: "2026-10-14T00:00:00.000Z", filePath: null })],
      [
        "savedAt が不正な日付",
        JSON.stringify({ savedAt: "いつか", filePath: null, document: serialize(sampleMap()) }),
      ],
      [
        "savedAt が文字列でない",
        JSON.stringify({ savedAt: 1, filePath: null, document: serialize(sampleMap()) }),
      ],
      [
        "filePath の型が不正",
        JSON.stringify({
          savedAt: "2026-10-14T00:00:00.000Z",
          filePath: 1,
          document: serialize(sampleMap()),
        }),
      ],
      [
        "マップの内容が不正",
        JSON.stringify({
          savedAt: "2026-10-14T00:00:00.000Z",
          filePath: null,
          document: JSON.stringify({ version: 99 }),
        }),
      ],
    ])("壊れた自動保存（%s）は、復元できないものとして null を返す", async (_name, contents) => {
      mockedInvoke.mockResolvedValue(contents);

      expect(await readAutosave()).toBeNull();
    });

    it("読み込みに失敗したら、理由を含む日本語のエラーにする", async () => {
      mockedInvoke.mockRejectedValueOnce("denied");
      await expect(readAutosave()).rejects.toThrow("自動保存を読み込めません: denied");

      mockedInvoke.mockRejectedValueOnce(new Error("busy"));
      await expect(readAutosave()).rejects.toThrow("自動保存を読み込めません: busy");
    });
  });

  describe("clearAutosave", () => {
    it("clear_autosave コマンドを呼ぶ", async () => {
      mockedInvoke.mockResolvedValue(undefined);

      await clearAutosave();

      expect(mockedInvoke).toHaveBeenCalledWith("clear_autosave");
    });

    it("失敗したら、理由を含む日本語のエラーにする", async () => {
      mockedInvoke.mockRejectedValueOnce("denied");
      await expect(clearAutosave()).rejects.toThrow("自動保存を削除できません: denied");

      mockedInvoke.mockRejectedValueOnce(new Error("busy"));
      await expect(clearAutosave()).rejects.toThrow("自動保存を削除できません: busy");
    });
  });
});
