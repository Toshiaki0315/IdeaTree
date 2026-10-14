import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { addChild } from "./domain/addChild";
import { createMindMap } from "./domain/mindmap";
import type { RecentFile } from "./domain/recentFiles";
import { readAutosave } from "./files/autosave";
import { confirmDiscard } from "./files/confirmDiscard";
import { loadFile, loadFileAt } from "./files/loadFile";
import { onOpenFileRequest, takePendingOpenFiles } from "./files/openRequests";
import { readRecentFiles, writeRecentFiles } from "./files/recent";
import { saveFile } from "./files/saveFile";
import { registerCloseGuard } from "./files/closeGuard";

vi.mock("./files/saveFile", () => ({ saveFile: vi.fn() }));
vi.mock("./files/loadFile", () => ({ loadFile: vi.fn(), loadFileAt: vi.fn() }));
vi.mock("./files/pickImage", () => ({ pickImage: vi.fn() }));
vi.mock("./files/confirmDiscard", () => ({ confirmDiscard: vi.fn() }));
vi.mock("./files/closeGuard", () => ({ registerCloseGuard: vi.fn() }));
vi.mock("./files/autosave", () => ({
  writeAutosave: vi.fn(),
  readAutosave: vi.fn(),
  clearAutosave: vi.fn(),
}));
vi.mock("./files/confirmRestore", () => ({ confirmRestore: vi.fn() }));
vi.mock("./files/clipboard", () => ({ readClipboardText: vi.fn(), writeClipboardText: vi.fn() }));
vi.mock("./files/exportFile", () => ({ exportFile: vi.fn() }));
vi.mock("./files/recent", () => ({ readRecentFiles: vi.fn(), writeRecentFiles: vi.fn() }));
vi.mock("./files/openRequests", () => ({ takePendingOpenFiles: vi.fn(), onOpenFileRequest: vi.fn() }));

const mockedSaveFile = vi.mocked(saveFile);
const mockedLoadFile = vi.mocked(loadFile);
const mockedLoadFileAt = vi.mocked(loadFileAt);
const mockedConfirmDiscard = vi.mocked(confirmDiscard);
const mockedReadRecent = vi.mocked(readRecentFiles);
const mockedWriteRecent = vi.mocked(writeRecentFiles);
const mockedTakePending = vi.mocked(takePendingOpenFiles);
const mockedOnOpenRequest = vi.mocked(onOpenFileRequest);
const unlistenOpen = vi.fn();

const RECENT: RecentFile[] = [
  { path: "/Users/me/first.ideatree", openedAt: "2026-10-14T10:00:00.000Z" },
  { path: "/Users/me/second.json", openedAt: "2026-10-13T10:00:00.000Z" },
];

function loadedMap() {
  const base = createMindMap("読込");
  return addChild(base, base.rootId, "子A").map;
}

const docState = () => document.querySelector(".doc-state")?.textContent ?? "";
const panel = () => screen.getByRole("dialog", { name: "最近使ったファイル" });
const openPanel = () => fireEvent.keyDown(window, { key: "O", metaKey: true, shiftKey: true });
/** 起動時の非同期処理（自動保存の確認・一覧の読み込み）が終わるのを待つ */
const settle = () => act(async () => {});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(registerCloseGuard).mockResolvedValue(vi.fn());
  vi.mocked(readAutosave).mockResolvedValue(null);
  mockedConfirmDiscard.mockResolvedValue(true);
  mockedReadRecent.mockResolvedValue(RECENT);
  mockedWriteRecent.mockResolvedValue(undefined);
  mockedTakePending.mockResolvedValue([]);
  mockedOnOpenRequest.mockResolvedValue(unlistenOpen);
  mockedLoadFileAt.mockImplementation(async (path) => ({ map: loadedMap(), path }));
});

describe("最近使ったファイル", () => {
  describe("Cmd+Shift+O: 一覧", () => {
    it("開くと、一覧を表示し、Escape で閉じる", async () => {
      render(<App />);
      await settle();

      openPanel();
      expect(within(panel()).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "first.ideatree/Users/me",
        "second.json/Users/me",
      ]);

      await userEvent.setup().keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("もう一度押すと閉じる。Cmd+O（Shift なし）は、一覧ではなく、ダイアログで開く", async () => {
      mockedLoadFile.mockResolvedValue(null);
      render(<App />);
      await settle();

      openPanel();
      openPanel();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: "o", metaKey: true });
      await waitFor(() => expect(mockedLoadFile).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("検索・スタイル・ショートカット一覧とは、同時には開かない", async () => {
      render(<App />);
      await settle();

      fireEvent.keyDown(window, { key: "f", metaKey: true });
      openPanel();
      expect(screen.queryByRole("search")).not.toBeInTheDocument();
      expect(panel()).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(screen.queryByRole("dialog", { name: "最近使ったファイル" })).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "スタイル" })).toBeInTheDocument();

      openPanel();
      expect(screen.queryByRole("dialog", { name: "スタイル" })).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: "/", metaKey: true });
      expect(screen.queryByRole("dialog", { name: "最近使ったファイル" })).not.toBeInTheDocument();

      openPanel();
      fireEvent.keyDown(panel(), { key: "Escape" });
      fireEvent.keyDown(window, { key: "f", metaKey: true });
      expect(screen.getByRole("search")).toBeInTheDocument();
    });

    it("一覧を読み込めなくても、空として扱う", async () => {
      mockedReadRecent.mockRejectedValue(new Error("読み込めません"));
      render(<App />);
      await settle();

      openPanel();
      expect(screen.getByText("最近使ったファイルはありません")).toBeInTheDocument();
    });
  });

  describe("一覧から開く", () => {
    it("Enter で、選んだファイルを開き、パネルを閉じる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await settle();

      openPanel();
      await user.keyboard("{ArrowDown}{Enter}");

      await waitFor(() => expect(docState()).toBe("second.json"));
      expect(mockedLoadFileAt).toHaveBeenCalledWith("/Users/me/second.json");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText("開きました: /Users/me/second.json")).toBeInTheDocument();
    });

    it("開いたファイルを、一覧の先頭にして保存する", async () => {
      const user = userEvent.setup();
      render(<App />);
      await settle();

      openPanel();
      await user.keyboard("{ArrowDown}{Enter}");

      await waitFor(() => expect(mockedWriteRecent).toHaveBeenCalledTimes(1));
      expect(mockedWriteRecent.mock.calls[0][0].map((f) => f.path)).toEqual([
        "/Users/me/second.json",
        "/Users/me/first.ideatree",
      ]);
    });

    it("未保存の変更があれば確認し、やめたら開かない", async () => {
      mockedConfirmDiscard.mockResolvedValue(false);
      const user = userEvent.setup();
      render(<App />);
      await settle();
      await user.keyboard("{Tab}子{Enter}");

      openPanel();
      await user.keyboard("{Enter}");

      await waitFor(() => expect(mockedConfirmDiscard).toHaveBeenCalled());
      expect(mockedLoadFileAt).not.toHaveBeenCalled();
    });

    it("開けなかったら、エラーを表示し、一覧から外す", async () => {
      mockedLoadFileAt.mockRejectedValue(new Error("読み込みに失敗しました: なし"));
      const user = userEvent.setup();
      render(<App />);
      await settle();

      openPanel();
      await user.keyboard("{Enter}");

      expect(await screen.findByRole("alert")).toHaveTextContent("読み込みに失敗しました: なし");
      await waitFor(() => expect(mockedWriteRecent).toHaveBeenCalled());
      expect(mockedWriteRecent.mock.calls[0][0].map((f) => f.path)).toEqual(["/Users/me/second.json"]);
    });
  });

  describe("保存・開くと、一覧に加える", () => {
    it("保存すると、一覧の先頭に加える（保存できなかったときは加えない）", async () => {
      mockedSaveFile.mockResolvedValueOnce(null).mockResolvedValueOnce("/Users/me/new.ideatree");
      render(<App />);
      await settle();

      fireEvent.keyDown(window, { key: "s", metaKey: true });
      await waitFor(() => expect(mockedSaveFile).toHaveBeenCalledTimes(1));
      expect(mockedWriteRecent).not.toHaveBeenCalled();

      fireEvent.keyDown(window, { key: "s", metaKey: true });
      await waitFor(() => expect(mockedWriteRecent).toHaveBeenCalledTimes(1));
      expect(mockedWriteRecent.mock.calls[0][0].map((f) => f.path)).toEqual([
        "/Users/me/new.ideatree",
        "/Users/me/first.ideatree",
        "/Users/me/second.json",
      ]);
    });

    it("ダイアログで開いたファイルも加える。一覧の保存に失敗しても、無視する", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/dialog.ideatree" });
      mockedWriteRecent.mockRejectedValue(new Error("保存できません"));
      render(<App />);
      await settle();

      fireEvent.keyDown(window, { key: "o", metaKey: true });

      await waitFor(() => expect(docState()).toBe("dialog.ideatree"));
      expect(mockedWriteRecent).toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("一覧の読み込みが終わる前に加えても、読み込んだ一覧と合わせる", async () => {
      let resolveRead: (list: RecentFile[]) => void = () => {};
      mockedReadRecent.mockReturnValue(new Promise((resolve) => (resolveRead = resolve)));
      mockedSaveFile.mockResolvedValue("/Users/me/first.ideatree");
      render(<App />);
      await settle();

      fireEvent.keyDown(window, { key: "s", metaKey: true });
      await waitFor(() => expect(mockedWriteRecent).toHaveBeenCalledTimes(1));
      await act(async () => resolveRead(RECENT));

      openPanel();
      expect(within(panel()).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "first.ideatree/Users/me",
        "second.json/Users/me",
      ]);
    });
  });

  describe("Finder から開く", () => {
    it("起動時に渡されたファイルを、自動保存の確認のあとで開く", async () => {
      mockedTakePending.mockResolvedValue(["/Users/me/from-finder.ideatree", "/Users/me/other.ideatree"]);
      render(<App />);

      await waitFor(() => expect(docState()).toBe("from-finder.ideatree"));
      expect(mockedLoadFileAt).toHaveBeenCalledTimes(1);
      expect(mockedLoadFileAt).toHaveBeenCalledWith("/Users/me/from-finder.ideatree");
    });

    it("渡されたファイルがなければ、何も開かない。取り出せなくても、無視する", async () => {
      render(<App />);
      await settle();
      expect(mockedLoadFileAt).not.toHaveBeenCalled();

      vi.mocked(readAutosave).mockResolvedValue(null);
      mockedTakePending.mockRejectedValue(new Error("Tauri の外"));
      render(<App />);
      await settle();
      expect(mockedLoadFileAt).not.toHaveBeenCalled();
    });

    it("起動中に頼まれたファイルを開く（未保存の変更は確認する）", async () => {
      let handler: (path: string) => void = () => {};
      mockedOnOpenRequest.mockImplementation(async (h) => {
        handler = h;
        return unlistenOpen;
      });
      const user = userEvent.setup();
      render(<App />);
      await settle();
      await user.keyboard("{Tab}");

      mockedConfirmDiscard.mockResolvedValueOnce(false);
      act(() => handler("/Users/me/a.ideatree"));
      await waitFor(() => expect(mockedConfirmDiscard).toHaveBeenCalledTimes(1));
      expect(mockedLoadFileAt).not.toHaveBeenCalled();

      act(() => handler("/Users/me/a.ideatree"));
      await waitFor(() => expect(docState()).toBe("a.ideatree"));
    });

    it("画面を閉じたら監視をやめる。監視できなくても、無視する", async () => {
      const first = render(<App />);
      await settle();
      first.unmount();
      expect(unlistenOpen).toHaveBeenCalledTimes(1);

      mockedOnOpenRequest.mockRejectedValue(new Error("Tauri の外"));
      const second = render(<App />);
      await settle();
      second.unmount();
      expect(unlistenOpen).toHaveBeenCalledTimes(1);
    });

    it("監視の準備が終わる前に閉じたら、すぐに解除する", async () => {
      let resolveListen: (fn: () => void) => void = () => {};
      mockedOnOpenRequest.mockReturnValue(new Promise((resolve) => (resolveListen = resolve)));
      const { unmount } = render(<App />);
      unmount();

      await act(async () => resolveListen(unlistenOpen));
      expect(unlistenOpen).toHaveBeenCalledTimes(1);
    });
  });
});
