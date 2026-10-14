import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onOpenFileRequest, takePendingOpenFiles } from "./openRequests";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

describe("Finder から開くよう頼まれたファイル", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("takePendingOpenFiles（起動時に溜まっていたパス）", () => {
    it("take_pending_open_files コマンドの結果（パスの一覧）を返す", async () => {
      mockedInvoke.mockResolvedValue(["/a.ideatree", "/b.ideatree"]);

      expect(await takePendingOpenFiles()).toEqual(["/a.ideatree", "/b.ideatree"]);
      expect(mockedInvoke).toHaveBeenCalledWith("take_pending_open_files");
    });

    it("文字列でない要素は、取り除く", async () => {
      mockedInvoke.mockResolvedValue(["/a.ideatree", 1, null, "/b.ideatree"]);

      expect(await takePendingOpenFiles()).toEqual(["/a.ideatree", "/b.ideatree"]);
    });
  });

  describe("onOpenFileRequest（アプリの起動中に届く依頼）", () => {
    it("open-file イベントを監視し、届いたパスを、ハンドラに渡す。戻り値で、監視を解除できる", async () => {
      const unlisten = vi.fn();
      let callback: (event: { payload: unknown }) => void = () => {};
      mockedListen.mockImplementation(async (_name, cb) => {
        callback = cb as typeof callback;
        return unlisten;
      });
      const handler = vi.fn();

      const stop = await onOpenFileRequest(handler);
      callback({ payload: "/Users/me/a.ideatree" });

      expect(mockedListen).toHaveBeenCalledWith("open-file", expect.any(Function));
      expect(handler).toHaveBeenCalledWith("/Users/me/a.ideatree");
      stop();
      expect(unlisten).toHaveBeenCalledTimes(1);
    });

    it("パスが文字列でない依頼は、無視する", async () => {
      let callback: (event: { payload: unknown }) => void = () => {};
      mockedListen.mockImplementation(async (_name, cb) => {
        callback = cb as typeof callback;
        return () => {};
      });
      const handler = vi.fn();
      await onOpenFileRequest(handler);

      callback({ payload: 123 });
      callback({ payload: "" });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
