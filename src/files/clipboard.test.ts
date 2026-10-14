import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readClipboardText, writeClipboardText } from "./clipboard";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: vi.fn(),
  writeText: vi.fn(),
}));

const mockedReadText = vi.mocked(readText);
const mockedWriteText = vi.mocked(writeText);

describe("システムのクリップボードの読み書き", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("writeClipboardText", () => {
    it("指定した文字列を、システムのクリップボードに書き込む", async () => {
      mockedWriteText.mockResolvedValue(undefined);

      await writeClipboardText("コピーした内容");

      expect(mockedWriteText).toHaveBeenCalledWith("コピーした内容");
    });

    it("書き込みに失敗したら、理由を含む日本語のエラーにする（文字列でも Error でも）", async () => {
      mockedWriteText.mockRejectedValueOnce("denied");
      await expect(writeClipboardText("x")).rejects.toThrow("クリップボードに書き込めません: denied");

      mockedWriteText.mockRejectedValueOnce(new Error("busy"));
      await expect(writeClipboardText("x")).rejects.toThrow("クリップボードに書き込めません: busy");
    });
  });

  describe("readClipboardText", () => {
    it("システムのクリップボードの文字列を返す", async () => {
      mockedReadText.mockResolvedValue("貼り付ける内容");

      expect(await readClipboardText()).toBe("貼り付ける内容");
    });

    it("クリップボードが空なら、空文字列を返す", async () => {
      mockedReadText.mockResolvedValue("");

      expect(await readClipboardText()).toBe("");
    });

    it("読み込みに失敗したら（文字列以外が入っている場合を含む）、理由を含む日本語のエラーにする", async () => {
      mockedReadText.mockRejectedValueOnce("not supported");
      await expect(readClipboardText()).rejects.toThrow("クリップボードを読み込めません: not supported");

      mockedReadText.mockRejectedValueOnce(new Error("busy"));
      await expect(readClipboardText()).rejects.toThrow("クリップボードを読み込めません: busy");
    });
  });
});
