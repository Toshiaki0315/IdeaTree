import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { BRANCH_COLORS } from "./domain/branchColor";
import { addChild } from "./domain/addChild";
import { parseClipboardText, subtreeToText } from "./domain/clipboardText";
import { copyNode } from "./domain/copyNode";
import { hitAreaSize } from "./domain/hitArea";
import { layout } from "./domain/layout";
import { exportSvg } from "./domain/svgExport";
import { SHORTCUT_GROUPS } from "./domain/shortcuts";
import { createMindMap } from "./domain/mindmap";
import type { MindMap } from "./domain/mindmap";
import { ICON_PRESETS, setNodeIcon } from "./domain/nodeIcon";
import { setNodeImage } from "./domain/nodeImage";
import { setNodeStyle } from "./domain/nodeStyle";
import { clearAutosave, readAutosave, writeAutosave } from "./files/autosave";
import { readClipboardText, writeClipboardText } from "./files/clipboard";
import { registerCloseGuard } from "./files/closeGuard";
import { confirmDiscard } from "./files/confirmDiscard";
import { confirmRestore } from "./files/confirmRestore";
import { exportFile } from "./files/exportFile";
import { loadFile } from "./files/loadFile";
import { pickImage } from "./files/pickImage";
import { saveFile } from "./files/saveFile";

vi.mock("./files/saveFile", () => ({ saveFile: vi.fn() }));
vi.mock("./files/loadFile", () => ({ loadFile: vi.fn() }));
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

const mockedSaveFile = vi.mocked(saveFile);
const mockedLoadFile = vi.mocked(loadFile);
const mockedPickImage = vi.mocked(pickImage);
const mockedConfirmDiscard = vi.mocked(confirmDiscard);
const mockedRegisterCloseGuard = vi.mocked(registerCloseGuard);
const unlistenCloseGuard = vi.fn();
const mockedReadAutosave = vi.mocked(readAutosave);
const mockedWriteAutosave = vi.mocked(writeAutosave);
const mockedClearAutosave = vi.mocked(clearAutosave);
const mockedConfirmRestore = vi.mocked(confirmRestore);
const mockedReadClipboard = vi.mocked(readClipboardText);
const mockedWriteClipboard = vi.mocked(writeClipboardText);
const mockedExportFile = vi.mocked(exportFile);

/** 読み込み用のマップ（中心「読込」の下に「子A」「子B」） */
function loadedMap() {
  const base = createMindMap("読込");
  const a = addChild(base, base.rootId, "子A");
  return addChild(a.map, base.rootId, "子B").map;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedConfirmDiscard.mockResolvedValue(true); // 既定では、破棄してよいと答える
  mockedRegisterCloseGuard.mockResolvedValue(unlistenCloseGuard);
  mockedPickImage.mockResolvedValue(null);
  // 既定では、前回の自動保存はなく、書き込み・削除は成功する
  mockedReadAutosave.mockResolvedValue(null);
  mockedWriteAutosave.mockResolvedValue(undefined);
  mockedClearAutosave.mockResolvedValue(undefined);
  mockedConfirmRestore.mockResolvedValue(true);
  // 既定では、システムのクリップボードを読み書きできない（アプリの中のコピーだけを使う）状態にする
  mockedWriteClipboard.mockResolvedValue(undefined);
  mockedReadClipboard.mockRejectedValue(new Error("クリップボードを読み込めません: 利用できません"));
});

type User = ReturnType<typeof userEvent.setup>;

const nodes = (container: HTMLElement) => container.querySelectorAll("g[data-node-id]");
const selectedText = (container: HTMLElement) =>
  container.querySelector('g[data-node-id][data-selected="true"]')?.textContent;

/** 選択ノードの子を追加し、テキストを入力して確定する（Tab → 入力 → Enter） */
async function addChildNamed(user: User, text: string) {
  await user.keyboard("{Tab}");
  await user.keyboard(text);
  await user.keyboard("{Enter}");
}

/** 選択ノードの兄弟を追加し、テキストを入力して確定する（Enter → 入力 → Enter） */
async function addSiblingNamed(user: User, text: string) {
  await user.keyboard("{Enter}");
  await user.keyboard(text);
  await user.keyboard("{Enter}");
}

describe("App（マインドマップ編集UI）", () => {
  describe("初期表示", () => {
    it("マインドマップ領域(SVG)に、中央ノードが表示される", () => {
      const { container } = render(<App />);

      expect(screen.getByRole("application", { name: "マインドマップ" })).toBeInTheDocument();
      expect(nodes(container)).toHaveLength(1);
      expect(screen.getByText("中心テーマ")).toBeInTheDocument();
    });

    it("中央ノードが選択されており、編集入力欄は表示されない", () => {
      const { container } = render(<App />);

      expect(selectedText(container)).toBe("中心テーマ");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  describe("Tab: 子ノードの追加", () => {
    it("子ノードが追加され、選択されて、フォーカス済みの空の入力欄が表示される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard("{Tab}");

      expect(nodes(container)).toHaveLength(2);
      expect(screen.getByRole("textbox", { name: "ノードのテキスト" })).toHaveFocus();
      expect(screen.getByRole("textbox")).toHaveValue("");
    });

    it("入力して Enter で確定すると、テキストが表示され入力欄が消える", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await addChildNamed(user, "企画");

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("企画")).toBeInTheDocument();
      expect(selectedText(container)).toBe("企画");
    });

    it("追加したノードごとに、親から伸びるブランチ(曲線)が描かれ、メインブランチの色が付く", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await addChildNamed(user, "企画");

      const paths = container.querySelectorAll("path");
      expect(paths).toHaveLength(1);
      expect(paths[0]).toHaveAttribute("stroke", BRANCH_COLORS[0]);
    });

    it("空のまま確定すると、追加したノードは破棄され、親が選択される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard("{Tab}");
      await user.keyboard("{Enter}");

      expect(nodes(container)).toHaveLength(1);
      expect(selectedText(container)).toBe("中心テーマ");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("Escape で入力を取り消すと、追加したノードは破棄される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard("{Tab}");
      await user.keyboard("途中");
      await user.keyboard("{Escape}");

      expect(nodes(container)).toHaveLength(1);
      expect(screen.queryByText("途中")).not.toBeInTheDocument();
      expect(selectedText(container)).toBe("中心テーマ");
    });
  });

  describe("Enter: 兄弟ノードの追加", () => {
    it("選択ノードの兄弟が追加され、入力して確定できる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await addChildNamed(user, "企画");
      await user.keyboard("{Enter}");
      expect(screen.getByRole("textbox")).toHaveFocus();
      await user.keyboard("予算");
      await user.keyboard("{Enter}");

      expect(nodes(container)).toHaveLength(3);
      expect(screen.getByText("企画")).toBeInTheDocument();
      expect(screen.getByText("予算")).toBeInTheDocument();
      expect(selectedText(container)).toBe("予算");
    });

    it("兄弟ブランチは別のメインブランチ色になる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await addChildNamed(user, "企画");
      await addSiblingNamed(user, "予算");

      const strokes = [...container.querySelectorAll("path")].map((p) => p.getAttribute("stroke"));
      expect(strokes).toEqual([BRANCH_COLORS[0], BRANCH_COLORS[1]]);
    });

    it("中央ノードでは何も起きない（ルートに兄弟は作れない）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard("{Enter}");

      expect(nodes(container)).toHaveLength(1);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  describe("矢印キー: ノード間の移動", () => {
    it("→ で最初の子、← で親、↓ で次の兄弟、↑ で前の兄弟へ移動する", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
      await user.keyboard("{ArrowUp}");
      expect(selectedText(container)).toBe("a");

      await user.keyboard("{ArrowRight}"); // 子がないので移動しない
      expect(selectedText(container)).toBe("a");

      await addChildNamed(user, "a1");
      expect(selectedText(container)).toBe("a1");

      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("a");
      await user.keyboard("{ArrowDown}");
      expect(selectedText(container)).toBe("b");
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("中心テーマ");
      await user.keyboard("{ArrowRight}");
      expect(selectedText(container)).toBe("a");
    });
  });

  describe("Delete / Backspace: ノードの削除", () => {
    it.each([["{Delete}"], ["{Backspace}"]])(
      "%s で選択ノードをサブツリーごと削除し、親を選択する",
      async (key) => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await addChildNamed(user, "a");
        await addChildNamed(user, "a1");
        await user.keyboard("{ArrowLeft}");
        expect(selectedText(container)).toBe("a");

        await user.keyboard(key);

        expect(nodes(container)).toHaveLength(1);
        expect(screen.queryByText("a1")).not.toBeInTheDocument();
        expect(selectedText(container)).toBe("中心テーマ");
      },
    );

    it("中央ノードは削除できない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard("{Delete}");

      expect(nodes(container)).toHaveLength(1);
      expect(screen.getByText("中心テーマ")).toBeInTheDocument();
    });
  });

  describe("F2: テキスト編集", () => {
    it("選択ノードの現在のテキストが入った入力欄が開き、変更を確定できる", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard("{F2}");
      const input = screen.getByRole("textbox", { name: "ノードのテキスト" });
      expect(input).toHaveValue("中心テーマ");
      expect(input).toHaveFocus();

      await user.clear(input);
      await user.keyboard("新テーマ{Enter}");

      expect(screen.getByText("新テーマ")).toBeInTheDocument();
      expect(screen.queryByText("中心テーマ")).not.toBeInTheDocument();
    });

    it("Escape で取り消すと、元のテキストのまま（ノードも残る）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "企画");

      await user.keyboard("{F2}");
      await user.keyboard("あああ{Escape}");

      expect(screen.getByText("企画")).toBeInTheDocument();
      expect(nodes(container)).toHaveLength(2);
    });

    it("既存ノードを空にして確定した場合は、元のテキストを保つ", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard("{F2}");
      await user.clear(screen.getByRole("textbox"));
      await user.keyboard("{Enter}");

      expect(screen.getByText("中心テーマ")).toBeInTheDocument();
    });
  });

  describe("編集中のキー入力", () => {
    it("入力欄の中では、ノード操作のショートカット(Tab・矢印・Delete)は無効", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard("{Tab}");
      await user.keyboard("{Tab}{ArrowLeft}{Delete}{Backspace}");

      expect(nodes(container)).toHaveLength(2);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });

  describe("対象外のキー", () => {
    it("修飾キー付き（Cmd+Tab など）や未割り当てのキーでは、何も起きない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard("{Meta>}{Tab}{/Meta}");
      await user.keyboard("a");

      expect(nodes(container)).toHaveLength(1);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  describe("Cmd+S: JSON保存", () => {
    const CMD_S = "{Meta>}s{/Meta}";
    const CMD_SHIFT_S = "{Meta>}{Shift>}s{/Shift}{/Meta}";

    it("現在のマインドマップを saveFile に渡して保存する", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "企画");

      await user.keyboard(CMD_S);

      expect(mockedSaveFile).toHaveBeenCalledTimes(1);
      const [map, path] = mockedSaveFile.mock.calls[0];
      expect(Object.values(map.nodes).map((n) => n.text)).toEqual(["中心テーマ", "企画"]);
      expect(path).toBeUndefined();
    });

    it("ブラウザ標準の動作（ページの保存）を止める", async () => {
      mockedSaveFile.mockResolvedValue(null);
      render(<App />);

      const notPrevented = fireEvent.keyDown(window, { key: "s", metaKey: true });

      expect(notPrevented).toBe(false);
    });

    it("保存に成功したら、保存先のパスをステータスに表示する", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_S);

      expect(await screen.findByRole("status")).toHaveTextContent("保存しました: /Users/me/map.json");
    });

    it("2回目以降は、前回の保存先へ上書き保存する（ダイアログを開かない）", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_S);
      await screen.findByRole("status");
      await user.keyboard(CMD_S);

      expect(mockedSaveFile).toHaveBeenCalledTimes(2);
      expect(mockedSaveFile.mock.calls[1][1]).toBe("/Users/me/map.json");
    });

    it("Cmd+Shift+S は、保存先を決め直す（名前を付けて保存）", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard(CMD_S);
      await screen.findByRole("status");

      await user.keyboard(CMD_SHIFT_S);

      expect(mockedSaveFile).toHaveBeenCalledTimes(2);
      expect(mockedSaveFile.mock.calls[1][1]).toBeUndefined();
    });

    it("ダイアログをキャンセルしたら、メッセージは出さず、保存先も記憶しない", async () => {
      mockedSaveFile.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_S);
      await waitFor(() => expect(mockedSaveFile).toHaveBeenCalledTimes(1));
      await user.keyboard(CMD_S);

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(mockedSaveFile.mock.calls[1][1]).toBeUndefined();
    });

    it("保存に失敗したら、エラーメッセージをアラートに表示する", async () => {
      mockedSaveFile.mockRejectedValue(new Error("保存に失敗しました: disk full"));
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_S);

      expect(await screen.findByRole("alert")).toHaveTextContent("保存に失敗しました: disk full");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("Error 以外の値で失敗した場合も、その内容を表示する", async () => {
      mockedSaveFile.mockRejectedValue("boom");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_S);

      expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    });

    it("保存に成功すると、前回のエラーメッセージは消える", async () => {
      mockedSaveFile
        .mockRejectedValueOnce(new Error("保存に失敗しました: disk full"))
        .mockResolvedValueOnce("/Users/me/map.json");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_S);
      await screen.findByRole("alert");
      await user.keyboard(CMD_S);

      expect(await screen.findByRole("status")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("テキスト編集中は保存しない", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}");

      await user.keyboard(CMD_S);

      expect(mockedSaveFile).not.toHaveBeenCalled();
    });

    it("Ctrl+S や、Cmd と他のキーの組み合わせでは保存しない", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard("{Control>}s{/Control}");
      await user.keyboard("{Meta>}a{/Meta}");

      expect(mockedSaveFile).not.toHaveBeenCalled();
    });
  });

  describe("Cmd+O: JSON読み込み", () => {
    const CMD_O = "{Meta>}o{/Meta}";

    it("読み込んだマップで、表示中のマップを置き換え、ルートを選択する", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "古い子");

      await user.keyboard(CMD_O);

      expect(await screen.findByText("子A")).toBeInTheDocument();
      expect(screen.getByText("子B")).toBeInTheDocument();
      expect(screen.queryByText("古い子")).not.toBeInTheDocument();
      expect(screen.queryByText("中心テーマ")).not.toBeInTheDocument();
      expect(nodes(container)).toHaveLength(3);
      expect(selectedText(container)).toBe("読込");
    });

    it("ブラウザ標準の動作（ファイルを開く）を止める", async () => {
      mockedLoadFile.mockResolvedValue(null);
      render(<App />);

      const notPrevented = fireEvent.keyDown(window, { key: "o", metaKey: true });

      expect(notPrevented).toBe(false);
    });

    it("読み込みに成功したら、パスをステータスに表示する", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_O);

      expect(await screen.findByRole("status")).toHaveTextContent("開きました: /Users/me/map.json");
    });

    it("読み込んだファイルが保存先になり、Cmd+S でそのファイルへ上書き保存する", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard(CMD_O);
      await screen.findByRole("status");

      await user.keyboard("{Meta>}s{/Meta}");

      expect(mockedSaveFile).toHaveBeenCalledTimes(1);
      const [map, path] = mockedSaveFile.mock.calls[0];
      expect(Object.values(map.nodes).map((n) => n.text)).toEqual(["読込", "子A", "子B"]);
      expect(path).toBe("/Users/me/map.json");
    });

    it("読み込み後のマップを、そのままキーボードで編集できる", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard(CMD_O);
      await screen.findByRole("status");

      await addChildNamed(user, "追加");
      await user.keyboard("{ArrowLeft}");

      expect(nodes(container)).toHaveLength(4);
      expect(selectedText(container)).toBe("読込");
    });

    it("ダイアログをキャンセルしたら、マップもメッセージも変えない", async () => {
      mockedLoadFile.mockResolvedValue(null);
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "企画");

      await user.keyboard(CMD_O);
      await waitFor(() => expect(mockedLoadFile).toHaveBeenCalledTimes(1));

      expect(screen.getByText("企画")).toBeInTheDocument();
      expect(nodes(container)).toHaveLength(2);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("読み込みに失敗したら、エラーを表示し、編集中のマップは変えない", async () => {
      mockedLoadFile.mockRejectedValue(new Error("読み込みに失敗しました: JSONの形式が不正です"));
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "企画");

      await user.keyboard(CMD_O);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "読み込みに失敗しました: JSONの形式が不正です",
      );
      expect(screen.getByText("企画")).toBeInTheDocument();
      expect(nodes(container)).toHaveLength(2);
    });

    it("失敗しても、保存先は変わらない（前回の保存先が残る）", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/current.json");
      mockedLoadFile.mockRejectedValue(new Error("読み込みに失敗しました: x"));
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Meta>}s{/Meta}");
      await screen.findByRole("status");
      await user.keyboard(CMD_O);
      await screen.findByRole("alert");

      await user.keyboard("{Meta>}s{/Meta}");

      expect(mockedSaveFile.mock.calls[1][1]).toBe("/Users/me/current.json");
    });

    it("Error 以外の値で失敗した場合も、その内容を表示する", async () => {
      mockedLoadFile.mockRejectedValue("boom");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_O);

      expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    });

    it("読み込みに成功すると、前回のエラーメッセージは消える", async () => {
      mockedLoadFile
        .mockRejectedValueOnce(new Error("読み込みに失敗しました: x"))
        .mockResolvedValueOnce({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_O);
      await screen.findByRole("alert");
      await user.keyboard(CMD_O);

      expect(await screen.findByRole("status")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("テキスト編集中や、Ctrl+O では読み込まない", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard("{Control>}o{/Control}");
      await user.keyboard("{Tab}");
      await user.keyboard(CMD_O);

      expect(mockedLoadFile).not.toHaveBeenCalled();
    });
  });

  describe("Cmd+Shift+E: 書き出し（SVG・PNG・PDF）", () => {
    const CMD_SHIFT_E = "{Meta>}{Shift>}e{/Shift}{/Meta}";

    it("現在のマインドマップを exportFile に渡して書き出す", async () => {
      mockedExportFile.mockResolvedValue("/Users/me/map.svg");
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "企画");

      await user.keyboard(CMD_SHIFT_E);

      expect(mockedExportFile).toHaveBeenCalledTimes(1);
      const [map] = mockedExportFile.mock.calls[0];
      expect(Object.values(map.nodes).map((n) => n.text)).toEqual(["中心テーマ", "企画"]);
    });

    it("ブラウザ標準の動作を止める", async () => {
      mockedExportFile.mockResolvedValue(null);
      render(<App />);

      const notPrevented = fireEvent.keyDown(window, { key: "E", metaKey: true, shiftKey: true });

      expect(notPrevented).toBe(false);
    });

    it("書き出しに成功したら、パスをステータスに表示する", async () => {
      mockedExportFile.mockResolvedValue("/Users/me/map.svg");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_E);

      expect(await screen.findByRole("status")).toHaveTextContent("書き出しました: /Users/me/map.svg");
    });

    it("書き出しても、Cmd+S の保存先は変わらない", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      mockedExportFile.mockResolvedValue("/Users/me/map.svg");
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Meta>}s{/Meta}");
      await screen.findByText("保存しました: /Users/me/map.json");

      await user.keyboard(CMD_SHIFT_E);
      await screen.findByText("書き出しました: /Users/me/map.svg");
      await user.keyboard("{Meta>}s{/Meta}");

      expect(mockedSaveFile.mock.calls[1][1]).toBe("/Users/me/map.json");
    });

    it("ダイアログをキャンセルしたら、メッセージは出さない", async () => {
      mockedExportFile.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_E);
      await waitFor(() => expect(mockedExportFile).toHaveBeenCalledTimes(1));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("書き出しに失敗したら、エラーメッセージをアラートに表示する", async () => {
      mockedExportFile.mockRejectedValue(new Error("書き出しに失敗しました: disk full"));
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_E);

      expect(await screen.findByRole("alert")).toHaveTextContent("書き出しに失敗しました: disk full");
    });

    it("Error 以外の値で失敗した場合も、その内容を表示する", async () => {
      mockedExportFile.mockRejectedValue("boom");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_E);

      expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    });

    it("書き出しに成功すると、前回のエラーメッセージは消える", async () => {
      mockedExportFile
        .mockRejectedValueOnce(new Error("書き出しに失敗しました: x"))
        .mockResolvedValueOnce("/Users/me/map.svg");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_E);
      await screen.findByRole("alert");
      await user.keyboard(CMD_SHIFT_E);

      expect(await screen.findByRole("status")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("Shift なしの Cmd+E や、Ctrl+Shift+E、テキスト編集中は書き出さない", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard("{Meta>}e{/Meta}");
      await user.keyboard("{Control>}{Shift>}e{/Shift}{/Control}");
      await user.keyboard("{Tab}");
      await user.keyboard(CMD_SHIFT_E);

      expect(mockedExportFile).not.toHaveBeenCalled();
    });
  });

  describe("Cmd+Z: 元に戻す（Undo）", () => {
    const CMD_Z = "{Meta>}z{/Meta}";

    it("ノードの追加を元に戻す（追加前のノードが選択される）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "企画");

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(1);
      expect(screen.queryByText("企画")).not.toBeInTheDocument();
      expect(selectedText(container)).toBe("中心テーマ");
    });

    it("操作を1つずつ、順番にさかのぼれる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");

      await user.keyboard(CMD_Z);
      expect(nodes(container)).toHaveLength(2);
      expect(screen.queryByText("b")).not.toBeInTheDocument();
      expect(selectedText(container)).toBe("a");

      await user.keyboard(CMD_Z);
      expect(nodes(container)).toHaveLength(1);
    });

    it("テキスト編集の確定を元に戻す", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard("{F2}");
      await user.clear(screen.getByRole("textbox"));
      await user.keyboard("新テーマ{Enter}");
      expect(screen.getByText("新テーマ")).toBeInTheDocument();

      await user.keyboard(CMD_Z);

      expect(screen.getByText("中心テーマ")).toBeInTheDocument();
      expect(screen.queryByText("新テーマ")).not.toBeInTheDocument();
    });

    it("ノードの削除を元に戻す（サブツリーごと復活し、削除したノードが選択される）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await addChildNamed(user, "a1");
      await user.keyboard("{ArrowLeft}");
      await user.keyboard("{Delete}");
      expect(nodes(container)).toHaveLength(1);

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(3);
      expect(screen.getByText("a1")).toBeInTheDocument();
      expect(selectedText(container)).toBe("a");
    });

    it("何も操作していないときは、何も起きない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(1);
      expect(screen.getByText("中心テーマ")).toBeInTheDocument();
    });

    it("ノードの移動（矢印キー）は履歴に残らない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
      await user.keyboard("{ArrowUp}{ArrowLeft}");

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(2);
      expect(screen.queryByText("b")).not.toBeInTheDocument();
    });

    it("取り消し・空のまま確定して破棄したノードは、履歴に残らない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{Tab}{Escape}");
      await user.keyboard("{Tab}{Enter}");

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(1);
      expect(screen.queryByText("a")).not.toBeInTheDocument();
    });

    it("変化のない操作（ルートの削除・兄弟追加）は履歴に残らない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{ArrowLeft}");
      await user.keyboard("{Delete}");
      await user.keyboard("{Enter}");

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(1);
      expect(screen.queryByText("a")).not.toBeInTheDocument();
    });

    it("テキストを変えずに確定した編集は、履歴に残らない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{F2}{Enter}");

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(1);
      expect(screen.queryByText("a")).not.toBeInTheDocument();
    });

    it("元に戻した後も、通常どおり編集を続けられる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_Z);

      await addChildNamed(user, "b");

      expect(nodes(container)).toHaveLength(2);
      expect(screen.getByText("b")).toBeInTheDocument();
      expect(screen.queryByText("a")).not.toBeInTheDocument();
    });

    it("ブラウザ標準の動作を止める", async () => {
      render(<App />);

      const notPrevented = fireEvent.keyDown(window, { key: "z", metaKey: true });

      expect(notPrevented).toBe(false);
    });

    it("ファイルを開くと履歴は新しくなり、読み込む前の状態には戻れない", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "古い子");
      await user.keyboard("{Meta>}o{/Meta}");
      await screen.findByRole("status");

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(3);
      expect(screen.getByText("子A")).toBeInTheDocument();
      expect(screen.queryByText("古い子")).not.toBeInTheDocument();
    });

    it("読み込み後の編集は、読み込んだ状態まで元に戻せる", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard("{Meta>}o{/Meta}");
      await screen.findByRole("status");
      await addChildNamed(user, "追加");
      expect(nodes(container)).toHaveLength(4);

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(3);
      expect(screen.getByText("子A")).toBeInTheDocument();
    });

    it("テキスト編集中は元に戻さない（入力欄の文字の取り消しはブラウザに任せる）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{Tab}");

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(3);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("Ctrl+Z では元に戻さない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");

      await user.keyboard("{Control>}z{/Control}");

      expect(nodes(container)).toHaveLength(2);
    });
  });

  describe("Cmd+Shift+Z: やり直し（Redo）", () => {
    const CMD_Z = "{Meta>}z{/Meta}";
    const CMD_SHIFT_Z = "{Meta>}{Shift>}z{/Shift}{/Meta}";

    it("Undo したノードの追加を、やり直す（そのノードが選択される）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "企画");
      await user.keyboard(CMD_Z);
      expect(nodes(container)).toHaveLength(1);

      await user.keyboard(CMD_SHIFT_Z);

      expect(nodes(container)).toHaveLength(2);
      expect(screen.getByText("企画")).toBeInTheDocument();
      expect(selectedText(container)).toBe("企画");
    });

    it("複数回 Undo した後、1つずつ順番にやり直せる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
      await user.keyboard(`${CMD_Z}${CMD_Z}`);
      expect(nodes(container)).toHaveLength(1);

      await user.keyboard(CMD_SHIFT_Z);
      expect(nodes(container)).toHaveLength(2);
      expect(screen.queryByText("b")).not.toBeInTheDocument();

      await user.keyboard(CMD_SHIFT_Z);
      expect(nodes(container)).toHaveLength(3);
      expect(selectedText(container)).toBe("b");
    });

    it("テキスト編集の確定をやり直す", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{F2}");
      await user.clear(screen.getByRole("textbox"));
      await user.keyboard("新テーマ{Enter}");
      await user.keyboard(CMD_Z);
      expect(screen.getByText("中心テーマ")).toBeInTheDocument();

      await user.keyboard(CMD_SHIFT_Z);

      expect(screen.getByText("新テーマ")).toBeInTheDocument();
      expect(screen.queryByText("中心テーマ")).not.toBeInTheDocument();
    });

    it("ノードの削除をやり直す（再び削除され、親が選択される）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{Delete}");
      await user.keyboard(CMD_Z);
      expect(nodes(container)).toHaveLength(2);

      await user.keyboard(CMD_SHIFT_Z);

      expect(nodes(container)).toHaveLength(1);
      expect(selectedText(container)).toBe("中心テーマ");
    });

    it("Undo や新しい操作をしていないときは、何も起きない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");

      await user.keyboard(CMD_SHIFT_Z);

      expect(nodes(container)).toHaveLength(2);
      expect(selectedText(container)).toBe("a");
    });

    it("Undo の後に新しい操作をすると、やり直しの履歴は破棄される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_Z);
      await addChildNamed(user, "b");

      await user.keyboard(CMD_SHIFT_Z);

      expect(nodes(container)).toHaveLength(2);
      expect(screen.getByText("b")).toBeInTheDocument();
      expect(screen.queryByText("a")).not.toBeInTheDocument();
    });

    it("Undo の後にノードを移動（矢印キー）しても、やり直しの履歴は残る", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
      await user.keyboard(CMD_Z);
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("中心テーマ");

      await user.keyboard(CMD_SHIFT_Z);

      expect(nodes(container)).toHaveLength(3);
      expect(selectedText(container)).toBe("b");
    });

    it("ブラウザ標準の動作を止める", async () => {
      render(<App />);

      const notPrevented = fireEvent.keyDown(window, { key: "Z", metaKey: true, shiftKey: true });

      expect(notPrevented).toBe(false);
    });

    it("ファイルを開くと、やり直しの履歴は破棄される", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "古い子");
      await user.keyboard(CMD_Z);
      await user.keyboard("{Meta>}o{/Meta}");
      await screen.findByRole("status");

      await user.keyboard(CMD_SHIFT_Z);

      expect(nodes(container)).toHaveLength(3);
      expect(screen.queryByText("古い子")).not.toBeInTheDocument();
    });

    it("テキスト編集中や、Ctrl+Shift+Z ではやり直さない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_Z);

      await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
      expect(nodes(container)).toHaveLength(1);

      await user.keyboard("{Tab}");
      await user.keyboard(CMD_SHIFT_Z);

      expect(nodes(container)).toHaveLength(2);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(screen.queryByText("a")).not.toBeInTheDocument();
    });
  });

  describe("Cmd+C / Cmd+V: コピー＆ペースト", () => {
    const CMD_C = "{Meta>}c{/Meta}";
    const CMD_V = "{Meta>}v{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";

    const selectedNodeId = (container: HTMLElement) =>
      container.querySelector('g[data-node-id][data-selected="true"]')?.getAttribute("data-node-id");
    const nodeIdOf = (text: string) =>
      screen.getByText(text).closest("g[data-node-id]")?.getAttribute("data-node-id");

    /** 中心 ─ a(a1) / b を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addChildNamed(user, "a1");
      await user.keyboard("{ArrowLeft}");
      await addSiblingNamed(user, "b");
    }

    it("選択ノードをコピーし、別のノードの子として貼り付ける（貼り付けたノードが選択される）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user); // 選択: b
      await user.keyboard("{ArrowUp}"); // 選択: a
      const originalId = nodeIdOf("a");

      await user.keyboard(CMD_C);
      await user.keyboard("{ArrowDown}"); // 選択: b
      await user.keyboard(CMD_V);

      expect(nodes(container)).toHaveLength(6);
      expect(screen.getAllByText("a")).toHaveLength(2);
      expect(screen.getAllByText("a1")).toHaveLength(2);
      expect(selectedText(container)).toBe("a");
      expect(selectedNodeId(container)).not.toBe(originalId);
      // 貼り付けたノードは b の子
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("b");
    });

    it("コピーしても、マップは変わらず、履歴にも残らない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");

      await user.keyboard(CMD_C);
      expect(nodes(container)).toHaveLength(2);
      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(1); // a の追加が1手で戻る（コピーは手数に含まれない）
    });

    it("貼り付けを元に戻し、やり直せる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_C);
      await user.keyboard("{ArrowLeft}");
      await user.keyboard(CMD_V);
      expect(nodes(container)).toHaveLength(3);

      await user.keyboard(CMD_Z);
      expect(nodes(container)).toHaveLength(2);
      expect(selectedText(container)).toBe("中心テーマ");

      await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
      expect(nodes(container)).toHaveLength(3);
    });

    it("同じ内容を何度でも貼り付けられる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_C);
      await user.keyboard("{ArrowLeft}");

      await user.keyboard(CMD_V);
      await user.keyboard("{ArrowLeft}");
      await user.keyboard(CMD_V);

      expect(nodes(container)).toHaveLength(4);
      expect(screen.getAllByText("a")).toHaveLength(3);
    });

    it("コピーした後に元のノードを編集・削除しても、貼り付けるのはコピー時点の内容", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_C);
      await user.keyboard("{F2}");
      await user.clear(screen.getByRole("textbox"));
      await user.keyboard("変更後{Enter}");
      await user.keyboard("{Delete}");

      await user.keyboard(CMD_V);

      expect(nodes(container)).toHaveLength(2);
      expect(screen.getByText("a")).toBeInTheDocument();
      expect(screen.queryByText("変更後")).not.toBeInTheDocument();
    });

    it("中心ノードをコピーして貼り付けると、全体がブランチとして貼り付く", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{ArrowLeft}");

      await user.keyboard(CMD_C);
      await user.keyboard(CMD_V);

      expect(nodes(container)).toHaveLength(4);
      expect(screen.getAllByText("中心テーマ")).toHaveLength(2);
      expect(container.querySelectorAll("ellipse")).toHaveLength(1);
    });

    it("コピーしていないときの Cmd+V は、何もしない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard(CMD_V);

      expect(nodes(container)).toHaveLength(1);
    });

    it("コピーした内容は、別のファイルを開いた後でも貼り付けられる", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "持ち越し");
      await user.keyboard(CMD_C);
      await user.keyboard("{Meta>}o{/Meta}");
      await screen.findByRole("status");

      await user.keyboard(CMD_V);

      expect(nodes(container)).toHaveLength(4);
      expect(screen.getByText("持ち越し")).toBeInTheDocument();
    });

    it("Cmd+C と Cmd+V は、ブラウザ標準の動作を止める", async () => {
      render(<App />);

      expect(fireEvent.keyDown(window, { key: "c", metaKey: true })).toBe(false);
      expect(fireEvent.keyDown(window, { key: "v", metaKey: true })).toBe(false);
    });

    it("テキスト編集中や、Ctrl+C / Ctrl+V では、コピー＆ペーストしない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{Control>}c{/Control}");
      await user.keyboard("{Control>}v{/Control}");
      expect(nodes(container)).toHaveLength(2);

      await user.keyboard(CMD_C);
      await user.keyboard("{Tab}");
      await user.keyboard(CMD_V);

      expect(nodes(container)).toHaveLength(3);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });

  describe("Cmd+X: カット", () => {
    const CMD_X = "{Meta>}x{/Meta}";
    const CMD_V = "{Meta>}v{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";

    /** 中心 ─ a(a1) / b を作り、a を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addChildNamed(user, "a1");
      await user.keyboard("{ArrowLeft}");
      await addSiblingNamed(user, "b");
      await user.keyboard("{ArrowUp}");
    }

    it("選択ノードをサブツリーごと削除し、親を選択する", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user); // 選択: a

      await user.keyboard(CMD_X);

      expect(nodes(container)).toHaveLength(2);
      expect(screen.queryByText("a")).not.toBeInTheDocument();
      expect(screen.queryByText("a1")).not.toBeInTheDocument();
      expect(selectedText(container)).toBe("中心テーマ");
    });

    it("カットした内容を、別のノードの子として貼り付けられる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.keyboard(CMD_X);
      await user.keyboard("{ArrowRight}"); // 残った子 b を選択
      expect(selectedText(container)).toBe("b");
      await user.keyboard(CMD_V);

      expect(nodes(container)).toHaveLength(4);
      expect(screen.getByText("a")).toBeInTheDocument();
      expect(screen.getByText("a1")).toBeInTheDocument();
      expect(selectedText(container)).toBe("a");
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("b");
    });

    it("カットは1手の履歴になり、元に戻すとサブツリーごと復活する", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_X);

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(4);
      expect(screen.getByText("a1")).toBeInTheDocument();
      expect(selectedText(container)).toBe("a");
    });

    it("カットした後に何度でも貼り付けられる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_X);

      await user.keyboard(CMD_V);
      await user.keyboard("{ArrowLeft}");
      await user.keyboard(CMD_V);

      expect(nodes(container)).toHaveLength(6);
      expect(screen.getAllByText("a")).toHaveLength(2);
    });

    it("前にコピーした内容は、カットした内容で置き換わる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user); // 選択: a
      await user.keyboard("{ArrowDown}"); // b
      await user.keyboard("{Meta>}c{/Meta}"); // b をコピー
      await user.keyboard("{ArrowUp}"); // a
      await user.keyboard(CMD_X); // a をカット

      await user.keyboard(CMD_V);

      expect(screen.getAllByText("b")).toHaveLength(1);
      expect(screen.getByText("a")).toBeInTheDocument();
    });

    it("中心ノードはカットできない（何も起きず、コピーの内容も変わらない）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{Meta>}c{/Meta}"); // a をコピー
      await user.keyboard("{ArrowLeft}"); // 中心ノード

      await user.keyboard(CMD_X);

      expect(nodes(container)).toHaveLength(2);
      expect(selectedText(container)).toBe("中心テーマ");
      await user.keyboard(CMD_V); // 貼り付けるのは、前にコピーした a
      expect(screen.getAllByText("a")).toHaveLength(2);
    });

    it("中心ノードでカットを試みても、履歴には残らない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{ArrowLeft}");
      await user.keyboard(CMD_X);

      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(1);
    });

    it("ブラウザ標準の動作を止める", async () => {
      render(<App />);

      expect(fireEvent.keyDown(window, { key: "x", metaKey: true })).toBe(false);
    });

    it("テキスト編集中や、Ctrl+X では、カットしない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{Control>}x{/Control}");
      expect(nodes(container)).toHaveLength(2);

      await user.keyboard("{Tab}");
      await user.keyboard(CMD_X);

      expect(nodes(container)).toHaveLength(3);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(screen.getByText("a")).toBeInTheDocument();
    });
  });

  describe("Space: 折りたたみ / 展開", () => {
    const CMD_Z = "{Meta>}z{/Meta}";

    /** 中心 ─ a(a1, a2) / b を作り、a を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addChildNamed(user, "a1");
      await addSiblingNamed(user, "a2");
      await user.keyboard("{ArrowLeft}");
      await addSiblingNamed(user, "b");
      await user.keyboard("{ArrowUp}");
    }

    it("選択ノードの子孫を非表示にし、ラベルの末尾に「…」を付ける（選択は変わらない）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      expect(nodes(container)).toHaveLength(5);

      await user.keyboard(" ");

      expect(nodes(container)).toHaveLength(3);
      expect(screen.queryByText("a1")).not.toBeInTheDocument();
      expect(screen.queryByText("a2")).not.toBeInTheDocument();
      expect(screen.getByText("a…")).toBeInTheDocument();
      expect(selectedText(container)).toBe("a…");
      expect(container.querySelectorAll("path")).toHaveLength(2);
    });

    it("もう一度 Space で、子孫が再び表示され、「…」が消える", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(" ");

      await user.keyboard(" ");

      expect(nodes(container)).toHaveLength(5);
      expect(screen.getByText("a1")).toBeInTheDocument();
      expect(screen.getByText("a")).toBeInTheDocument();
      expect(screen.queryByText("a…")).not.toBeInTheDocument();
    });

    it("折りたたんだノードでは → で子へ進めず、展開すると進める", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(" ");

      await user.keyboard("{ArrowRight}");
      expect(selectedText(container)).toBe("a…");

      await user.keyboard(" ");
      await user.keyboard("{ArrowRight}");
      expect(selectedText(container)).toBe("a1");
    });

    it("折りたたみ・展開を、元に戻したりやり直したりできる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(" ");
      expect(nodes(container)).toHaveLength(3);

      await user.keyboard(CMD_Z);
      expect(nodes(container)).toHaveLength(5);

      await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
      expect(nodes(container)).toHaveLength(3);
    });

    it("子を持たないノードでは何も起きず、履歴にも残らない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");

      await user.keyboard(" ");
      expect(screen.getByText("a")).toBeInTheDocument();
      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(1); // a の追加が1手で戻る
    });

    it("中心ノードも折りたためる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard("{ArrowLeft}");

      await user.keyboard(" ");

      expect(nodes(container)).toHaveLength(1);
      expect(screen.getByText("中心テーマ…")).toBeInTheDocument();
    });

    it("折りたたまれたノードに子を追加（Tab）すると、自動で展開され、新しいノードを編集できる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(" ");

      await user.keyboard("{Tab}");

      expect(screen.getByRole("textbox")).toHaveFocus();
      expect(screen.getByText("a1")).toBeInTheDocument();
      expect(nodes(container)).toHaveLength(6);
      await user.keyboard("a3{Enter}");
      expect(screen.getByText("a3")).toBeInTheDocument();
      expect(screen.queryByText("a…")).not.toBeInTheDocument();
    });

    it("折りたたまれたノードに貼り付けると、自動で展開され、貼り付けたノードが表示・選択される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard("{ArrowDown}"); // b
      await user.keyboard("{Meta>}c{/Meta}");
      await user.keyboard("{ArrowUp}"); // a
      await user.keyboard(" ");

      await user.keyboard("{Meta>}v{/Meta}");

      expect(screen.getByText("a1")).toBeInTheDocument();
      expect(screen.getAllByText("b")).toHaveLength(2);
      expect(selectedText(container)).toBe("b");
    });

    it("折りたたまれたノードをコピーすると、見えていない子孫も含めて複製される", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(" "); // a を折りたたむ
      await user.keyboard("{Meta>}c{/Meta}");
      await user.keyboard("{ArrowDown}"); // b
      await user.keyboard("{Meta>}v{/Meta}"); // 貼り付けたコピー（折りたたみ状態も引き継ぐ）

      expect(screen.getAllByText("a…")).toHaveLength(2);
      await user.keyboard(" ");

      expect(screen.getByText("a1")).toBeInTheDocument();
      expect(screen.getByText("a2")).toBeInTheDocument();
    });

    it("ブラウザ標準の動作（ページのスクロール）を止める", async () => {
      render(<App />);

      expect(fireEvent.keyDown(window, { key: " " })).toBe(false);
    });

    it("テキスト編集中は折りたたまず、Cmd+Space などの修飾キー付きでも折りたたまない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard("{Meta>} {/Meta}");
      expect(nodes(container)).toHaveLength(5);

      await user.keyboard("{F2}");
      await user.keyboard(" ");

      // Space は入力欄にそのまま入力され（開いた直後は全選択なので置き換わる）、折りたたみは起きない
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toContain(" ");
      expect(nodes(container)).toHaveLength(5);
    });
  });

  describe("マウス操作: クリックで選択、ダブルクリックで編集", () => {
    const CMD_Z = "{Meta>}z{/Meta}";

    /** 中心 ─ a(a1) / b を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addChildNamed(user, "a1");
      await user.keyboard("{ArrowLeft}");
      await addSiblingNamed(user, "b");
    }

    it("ノードをクリックすると、そのノードが選択される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      expect(selectedText(container)).toBe("b");

      await user.click(screen.getByText("a1"));
      expect(selectedText(container)).toBe("a1");

      await user.click(screen.getByText("中心テーマ"));
      expect(selectedText(container)).toBe("中心テーマ");
    });

    it("クリックしただけでは、編集は始まらず、履歴にも残らない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.click(screen.getByText("a"));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      await user.keyboard(CMD_Z);

      expect(nodes(container)).toHaveLength(3); // b の追加だけが1手で戻る
      expect(screen.queryByText("b")).not.toBeInTheDocument();
    });

    it("クリックで選んだノードから、そのままキーボード操作を続けられる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.click(screen.getByText("a"));
      await addChildNamed(user, "a2");
      await user.keyboard("{ArrowLeft}");

      expect(nodes(container)).toHaveLength(5);
      expect(selectedText(container)).toBe("a");
    });

    it("折りたたまれたノードも、クリックで選択できる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.click(screen.getByText("a"));
      await user.keyboard(" ");
      await user.click(screen.getByText("b"));

      await user.click(screen.getByText("a…"));

      expect(selectedText(container)).toBe("a…");
    });

    it("何もない場所をクリックしても、選択は変わらない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.click(screen.getByRole("application"));

      expect(selectedText(container)).toBe("b");
    });

    it("ノードをダブルクリックすると、そのノードを選択して編集を始める", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);

      await user.dblClick(screen.getByText("a1"));

      const input = screen.getByRole("textbox", { name: "ノードのテキスト" });
      expect(input).toHaveValue("a1");
      expect(input).toHaveFocus();
    });

    it("中心ノードもダブルクリックで編集できる", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.dblClick(screen.getByText("中心テーマ"));
      await user.clear(screen.getByRole("textbox"));
      await user.keyboard("新テーマ{Enter}");

      expect(screen.getByText("新テーマ")).toBeInTheDocument();
    });

    it("編集中に別のノードをクリックすると、編集を確定し、クリックしたノードを選択する", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.click(screen.getByText("a"));
      await user.keyboard("{F2}");
      await user.clear(screen.getByRole("textbox"));
      await user.keyboard("変更後");

      await user.click(screen.getByText("b"));

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("変更後")).toBeInTheDocument();
      expect(selectedText(container)).toBe("b");
    });

    it("編集中に何もない場所をクリックしても、編集を確定する", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{F2}");
      await user.clear(screen.getByRole("textbox"));
      await user.keyboard("新テーマ");

      await user.click(screen.getByRole("application"));

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("新テーマ")).toBeInTheDocument();
    });

    it("追加直後の空のノードは、別の場所をクリックすると破棄される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard("{Tab}");
      expect(nodes(container)).toHaveLength(5);

      await user.click(screen.getByText("a"));

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(nodes(container)).toHaveLength(4);
      expect(selectedText(container)).toBe("a");
    });

    it("クリックで確定した編集は、元に戻す操作1回で戻る（二重に記録されない）", async () => {
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{F2}");
      await user.clear(screen.getByRole("textbox"));
      await user.keyboard("変更後");
      await user.click(screen.getByText("中心テーマ"));

      await user.keyboard(CMD_Z);

      expect(screen.getByText("a")).toBeInTheDocument();
      expect(screen.queryByText("変更後")).not.toBeInTheDocument();
    });

    it("入力欄の中でダブルクリックしても、入力途中のテキストは失われない（単語選択などに使える）", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{F2}");
      await user.clear(screen.getByRole("textbox"));
      await user.keyboard("入力途中");

      await user.dblClick(screen.getByRole("textbox"));

      expect(screen.getByRole("textbox")).toHaveValue("入力途中");
    });

    it("入力欄そのものをクリックしても、編集は続く", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{F2}");

      await user.click(screen.getByRole("textbox"));

      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });

  describe("Cmd+B / Cmd+I: 太字・斜体", () => {
    const CMD_B = "{Meta>}b{/Meta}";
    const CMD_I = "{Meta>}i{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";

    const weightOf = (text: string) => screen.getByText(text).getAttribute("font-weight");
    const fontStyleOf = (text: string) => screen.getByText(text).getAttribute("font-style");

    /** 中心 ─ a / b を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
    }

    it("Cmd+B で選択ノードを太字にし、もう一度で標準に戻す", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      expect(weightOf("b")).toBe("normal");

      await user.keyboard(CMD_B);
      expect(weightOf("b")).toBe("bold");

      await user.keyboard(CMD_B);
      expect(weightOf("b")).toBe("normal");
    });

    it("Cmd+I で選択ノードを斜体にし、もう一度で標準に戻す", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);

      await user.keyboard(CMD_I);
      expect(fontStyleOf("b")).toBe("italic");

      await user.keyboard(CMD_I);
      expect(fontStyleOf("b")).toBe("normal");
    });

    it("太字と斜体は独立していて、選択していない他のノードは変わらない", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);

      await user.keyboard(CMD_B);
      await user.keyboard(CMD_I);
      await user.keyboard(CMD_B);

      expect(weightOf("b")).toBe("normal");
      expect(fontStyleOf("b")).toBe("italic");
      expect(weightOf("a")).toBe("normal");
      expect(fontStyleOf("a")).toBe("normal");
    });

    it("中心ノードにも設定できる", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_B);

      expect(weightOf("中心テーマ")).toBe("bold");
    });

    it("スタイルの変更は1手の履歴になり、元に戻したりやり直したりできる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_B);

      await user.keyboard(CMD_Z);
      expect(weightOf("b")).toBe("normal");

      await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
      expect(weightOf("b")).toBe("bold");
    });

    it("スタイルはファイルに保存される内容に含まれる", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_B);
      await user.keyboard(CMD_I);

      await user.keyboard("{Meta>}s{/Meta}");

      const [map] = mockedSaveFile.mock.calls[0];
      const saved = Object.values(map.nodes).find((n) => n.text === "b");
      expect(saved?.style).toEqual({ bold: true, italic: true });
    });

    it("スタイルを持つファイルを開くと、画面に反映される", async () => {
      const base = loadedMap();
      const rootId = base.rootId;
      mockedLoadFile.mockResolvedValue({
        map: setNodeStyle(base, rootId, { bold: true, italic: true }),
        path: "/Users/me/map.json",
      });
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard("{Meta>}o{/Meta}");
      await screen.findByRole("status");

      expect(weightOf("読込")).toBe("bold");
      expect(fontStyleOf("読込")).toBe("italic");
    });

    it("コピー＆ペーストで、スタイルも引き継がれる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_B);
      await user.keyboard("{Meta>}c{/Meta}");
      await user.keyboard("{ArrowUp}"); // a
      await user.keyboard("{Meta>}v{/Meta}");

      const bolds = screen.getAllByText("b").map((el) => el.getAttribute("font-weight"));

      expect(bolds).toEqual(["bold", "bold"]);
    });

    it("ブラウザ標準の動作を止める", async () => {
      render(<App />);

      expect(fireEvent.keyDown(window, { key: "b", metaKey: true })).toBe(false);
      expect(fireEvent.keyDown(window, { key: "i", metaKey: true })).toBe(false);
    });

    it("テキスト編集中は、ノードのスタイルを変えない", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard("{F2}");

      await user.keyboard(CMD_B);
      await user.keyboard(CMD_I);
      await user.keyboard("{Escape}");

      expect(weightOf("b")).toBe("normal");
      expect(fontStyleOf("b")).toBe("normal");
    });

    it("Ctrl や Shift との組み合わせ（Ctrl+B・Cmd+Shift+B など）では変えない", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);

      await user.keyboard("{Control>}b{/Control}");
      await user.keyboard("{Meta>}{Shift>}b{/Shift}{/Meta}");
      await user.keyboard("{Meta>}{Shift>}i{/Shift}{/Meta}");

      expect(weightOf("b")).toBe("normal");
      expect(fontStyleOf("b")).toBe("normal");
    });
  });

  describe("Cmd+K: スタイルパネル（色・フォント・文字サイズ）", () => {
    const CMD_K = "{Meta>}k{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";
    const COLOR_NAMES = ["赤", "オレンジ", "黄", "緑", "青", "紫", "ピンク", "茶"];

    const panel = () => screen.getByRole("dialog", { name: "スタイル" });
    const radio = (name: string) => within(panel()).getByRole("radio", { name });
    const fontSelect = () => within(panel()).getByRole("combobox", { name: "フォント" });
    const sizeSelect = () => within(panel()).getByRole("combobox", { name: "文字サイズ" });
    const fillOf = (text: string) => screen.getByText(text).getAttribute("fill");
    const strokeOfBranch = (container: HTMLElement, text: string) => {
      const id = screen.getByText(text).closest("g[data-node-id]")?.getAttribute("data-node-id");
      return container.querySelector(`path[data-node-id="${id}"]`)?.getAttribute("stroke");
    };

    /** 中心 ─ a / b を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
    }

    describe("開閉", () => {
      it("Cmd+K で、選択ノード用のパネルが開き、フォーカスがパネルの中に移る", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await user.keyboard(CMD_K);

        expect(panel()).toBeInTheDocument();
        expect(within(panel()).getByText("選択中: b")).toBeInTheDocument();
        expect(panel()).toContainElement(document.activeElement as HTMLElement);
      });

      it("もう一度 Cmd+K、Escape、閉じるボタンのいずれでも閉じる", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);

        await user.keyboard(CMD_K);
        await user.keyboard(CMD_K);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await user.keyboard(CMD_K);
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await user.keyboard(CMD_K);
        await user.click(within(panel()).getByRole("button", { name: "閉じる" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      it("閉じた後は、通常のキーボード操作に戻る", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);
        await user.keyboard("{Escape}");

        await addChildNamed(user, "b1");

        expect(nodes(container)).toHaveLength(4);
        expect(selectedText(container)).toBe("b1");
      });

      it("ブラウザ標準の動作を止める。Ctrl+K・Cmd+Shift+K、テキスト編集中は開かない", async () => {
        const user = userEvent.setup();
        render(<App />);
        expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(false);
        await user.keyboard("{Meta>}k{/Meta}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // 上の keyDown で開いたものを閉じた
        await user.keyboard("{Control>}k{/Control}");
        await user.keyboard("{Meta>}{Shift>}k{/Shift}{/Meta}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await user.keyboard("{F2}");
        await user.keyboard(CMD_K);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    describe("色", () => {
      it("「自動」と、8色のパレットが選べ、初期状態では「自動」が選ばれている", async () => {
        const user = userEvent.setup();
        render(<App />);
        await user.keyboard(CMD_K);

        const group = within(panel()).getByRole("radiogroup", { name: "色" });
        const names = within(group)
          .getAllByRole("radio")
          .map((r) => r.getAttribute("aria-label"));

        expect(names).toEqual(["自動", ...COLOR_NAMES]);
        expect(radio("自動")).toBeChecked();
      });

      it("色を選ぶと、すぐにノードのテキストと、親から伸びる枝に反映される", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);

        await user.click(radio("青"));

        expect(fillOf("b")).toBe(BRANCH_COLORS[4]);
        expect(strokeOfBranch(container, "b")).toBe(BRANCH_COLORS[4]);
        expect(radio("青")).toBeChecked();
      });

      it("色の選択は、選択しているノードだけに効き、他のノードは変わらない", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);

        await user.click(radio("茶"));

        expect(fillOf("b")).toBe(BRANCH_COLORS[7]);
        expect(fillOf("a")).toBe(BRANCH_COLORS[0]);
      });

      it("「自動」を選ぶと、メインブランチの色に戻る", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);
        await user.click(radio("紫"));
        expect(fillOf("b")).toBe(BRANCH_COLORS[5]);

        await user.click(radio("自動"));

        expect(fillOf("b")).toBe(BRANCH_COLORS[1]);
        expect(radio("自動")).toBeChecked();
      });

      it("中心ノードにも色を付けられる", async () => {
        const user = userEvent.setup();
        render(<App />);
        await user.keyboard(CMD_K);

        await user.click(radio("青"));

        expect(fillOf("中心テーマ")).toBe(BRANCH_COLORS[4]);
      });
    });

    describe("フォントと文字サイズ", () => {
      it("フォントを選ぶと、ノードのテキストに反映され、「自動」で既定に戻る", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        const defaultFamily = screen.getByText("b").getAttribute("font-family");
        await user.keyboard(CMD_K);

        await user.selectOptions(fontSelect(), "ヒラギノ明朝");
        expect(screen.getByText("b").getAttribute("font-family")).toMatch(/^'Hiragino Mincho ProN', /);

        await user.selectOptions(fontSelect(), "等幅");
        expect(screen.getByText("b").getAttribute("font-family")).toMatch(/^'Menlo', /);

        await user.selectOptions(fontSelect(), "自動");
        expect(screen.getByText("b").getAttribute("font-family")).toBe(defaultFamily);
      });

      it("文字サイズを選ぶと、ノードのテキストに反映され、「自動」で既定に戻る", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        const defaultSize = screen.getByText("b").getAttribute("font-size");
        await user.keyboard(CMD_K);

        await user.selectOptions(sizeSelect(), "32");
        expect(screen.getByText("b").getAttribute("font-size")).toBe("32");
        expect(screen.getByText("a").getAttribute("font-size")).toBe(defaultSize);

        await user.selectOptions(sizeSelect(), "自動");
        expect(screen.getByText("b").getAttribute("font-size")).toBe(defaultSize);
      });

      it("選択肢には、現在のスタイルが反映されている（ファイルから読み込んだ、候補にない値も表示する）", async () => {
        const base = loadedMap();
        mockedLoadFile.mockResolvedValue({
          map: setNodeStyle(base, base.rootId, { fontSize: 30, fontFamily: "Custom Font", color: "#123456" }),
          path: "/Users/me/map.json",
        });
        const user = userEvent.setup();
        render(<App />);
        await user.keyboard("{Meta>}o{/Meta}");
        await screen.findByRole("status");

        await user.keyboard(CMD_K);

        expect(sizeSelect()).toHaveValue("30");
        expect(within(sizeSelect()).getByRole("option", { name: "30" })).toBeInTheDocument();
        expect(fontSelect()).toHaveDisplayValue("Custom Font");
        expect(within(panel()).getByRole("radio", { name: "#123456" })).toBeChecked();
      });
    });

    describe("選択ノードとの連動", () => {
      it("パネルは、現在選択しているノードの値を表示し、別のノードをクリックすると切り替わる", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);
        await user.click(radio("緑"));

        await user.click(screen.getByText("a"));

        expect(within(panel()).getByText("選択中: a")).toBeInTheDocument();
        expect(radio("自動")).toBeChecked();

        await user.click(screen.getByText("b"));
        expect(within(panel()).getByText("選択中: b")).toBeInTheDocument();
        expect(radio("緑")).toBeChecked();
      });
    });

    describe("履歴と保存", () => {
      it("1回の変更が1手の履歴になり、閉じた後に Cmd+Z で戻せる", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);
        await user.click(radio("赤"));
        await user.click(radio("青"));
        await user.keyboard("{Escape}");

        await user.keyboard(CMD_Z);
        expect(fillOf("b")).toBe(BRANCH_COLORS[0]);

        await user.keyboard(CMD_Z);
        expect(fillOf("b")).toBe(BRANCH_COLORS[1]);
      });

      it("同じ値を選び直しても、履歴は増えない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);
        await user.click(radio("赤"));
        await user.click(radio("赤"));
        await user.selectOptions(sizeSelect(), "24");
        await user.selectOptions(sizeSelect(), "24");
        await user.keyboard("{Escape}");

        await user.keyboard(CMD_Z); // サイズ
        await user.keyboard(CMD_Z); // 色
        await user.keyboard(CMD_Z); // b の追加

        expect(nodes(container)).toHaveLength(2);
      });

      it("変更したスタイルは、保存されるファイルの内容に含まれる", async () => {
        mockedSaveFile.mockResolvedValue("/Users/me/map.json");
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);
        await user.click(radio("緑"));
        await user.selectOptions(fontSelect(), "ヒラギノ角ゴ");
        await user.selectOptions(sizeSelect(), "20");
        await user.keyboard("{Escape}");

        await user.keyboard("{Meta>}s{/Meta}");

        const [map] = mockedSaveFile.mock.calls[0];
        const saved = Object.values(map.nodes).find((n) => n.text === "b");
        expect(saved?.style).toEqual({ color: BRANCH_COLORS[3], fontFamily: "Hiragino Sans", fontSize: 20 });
      });
    });

    describe("キーボード操作", () => {
      it("パネルの中のキー入力では、ノードの追加・削除・移動などの操作は起きない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);
        within(panel()).getByRole("button", { name: "閉じる" }).focus();

        await user.keyboard("{Delete}{Backspace}{ArrowLeft}{ArrowUp}");
        await user.keyboard("{Meta>}c{/Meta}{Meta>}b{/Meta}");

        expect(panel()).toBeInTheDocument();

        expect(nodes(container)).toHaveLength(3);
        expect(selectedText(container)).toBe("b");
        expect(screen.getByText("b").getAttribute("font-weight")).toBe("normal");
      });

      it("Tab キーで、パネルの中のコントロール間を移動できる（ノードは追加されない）", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);
        await user.keyboard(CMD_K);

        await user.tab();
        await user.tab();

        expect(nodes(container)).toHaveLength(3);
        expect(panel()).toContainElement(document.activeElement as HTMLElement);
      });
    });
  });

  describe("メインブランチの色の固定", () => {
    it("途中のメインブランチを削除しても、残りのブランチの色は変わらない", async () => {
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
      await addSiblingNamed(user, "c");
      expect(screen.getByText("c").getAttribute("fill")).toBe(BRANCH_COLORS[2]);
      await user.click(screen.getByText("b"));

      await user.keyboard("{Delete}");

      expect(screen.getByText("a").getAttribute("fill")).toBe(BRANCH_COLORS[0]);
      expect(screen.getByText("c").getAttribute("fill")).toBe(BRANCH_COLORS[2]);
    });

    it("削除で空いた色は、次に追加するメインブランチに使われる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
      await user.click(screen.getByText("a"));
      await user.keyboard("{Delete}");

      await user.keyboard("{Tab}");
      await user.keyboard("d{Enter}");

      expect(screen.getByText("d").getAttribute("fill")).toBe(BRANCH_COLORS[0]);
    });
  });

  describe("未保存の変更の確認", () => {
    const CMD_O = "{Meta>}o{/Meta}";
    const CMD_S = "{Meta>}s{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";
    const docState = () => document.querySelector(".doc-state")?.textContent ?? "";

    it("変更がないときは、ファイルを開く前に確認しない", async () => {
      mockedLoadFile.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_O);
      await waitFor(() => expect(mockedLoadFile).toHaveBeenCalledTimes(1));

      expect(mockedConfirmDiscard).not.toHaveBeenCalled();
    });

    it("変更があるときは、ファイルを開く前に確認する。破棄を選ぶと開く", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "古い子");

      await user.keyboard(CMD_O);

      expect(await screen.findByText("子A")).toBeInTheDocument();
      expect(mockedConfirmDiscard).toHaveBeenCalledTimes(1);
      expect(nodes(container)).toHaveLength(3);
    });

    it("確認でキャンセルすると、ファイルを開かず、編集中のマップも変えない", async () => {
      mockedConfirmDiscard.mockResolvedValue(false);
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "古い子");

      await user.keyboard(CMD_O);
      await waitFor(() => expect(mockedConfirmDiscard).toHaveBeenCalledTimes(1));

      expect(mockedLoadFile).not.toHaveBeenCalled();
      expect(screen.getByText("古い子")).toBeInTheDocument();
      expect(nodes(container)).toHaveLength(2);
    });

    it("確認のダイアログで失敗したときは、エラーを表示して、ファイルを開かない", async () => {
      mockedConfirmDiscard.mockRejectedValue(new Error("ダイアログを開けません"));
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "古い子");

      await user.keyboard(CMD_O);

      expect(await screen.findByRole("alert")).toHaveTextContent("ダイアログを開けません");
      expect(mockedLoadFile).not.toHaveBeenCalled();
    });

    it("保存に成功すると、変更なしの状態に戻り、確認されない", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      mockedLoadFile.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_S);
      await screen.findByRole("status");

      await user.keyboard(CMD_O);
      await waitFor(() => expect(mockedLoadFile).toHaveBeenCalledTimes(1));

      expect(mockedConfirmDiscard).not.toHaveBeenCalled();
    });

    it("保存後に、さらに変更すると、再び確認される", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      mockedLoadFile.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_S);
      await screen.findByRole("status");
      await addSiblingNamed(user, "b");

      await user.keyboard(CMD_O);
      await waitFor(() => expect(mockedConfirmDiscard).toHaveBeenCalledTimes(1));
    });

    it("保存したときの状態まで元に戻すと、変更なしと見なされる（保存前の状態まで戻すと、変更ありになる）", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      mockedLoadFile.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_S);
      await screen.findByRole("status");
      await addSiblingNamed(user, "b");
      await user.keyboard(CMD_Z);

      expect(docState()).not.toContain("未保存");

      await user.keyboard(CMD_Z);
      expect(docState()).toContain("未保存");
    });

    it("保存に失敗したときや、保存ダイアログをキャンセルしたときは、変更ありのまま", async () => {
      mockedSaveFile.mockRejectedValueOnce(new Error("保存に失敗しました: x")).mockResolvedValueOnce(null);
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "a");

      await user.keyboard(CMD_S);
      await screen.findByRole("alert");
      expect(docState()).toContain("未保存");

      await user.keyboard(CMD_S);
      await waitFor(() => expect(mockedSaveFile).toHaveBeenCalledTimes(2));
      expect(docState()).toContain("未保存");
    });

    it("名前を付けて保存（Cmd+Shift+S）でも、変更なしの状態になる", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/copy.json");
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "a");

      await user.keyboard("{Meta>}{Shift>}s{/Shift}{/Meta}");
      await screen.findByRole("status");

      expect(docState()).not.toContain("未保存");
    });

    it("ファイルを開いた直後は変更なしで、SVGの書き出しは変更に影響しない", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      mockedExportFile.mockResolvedValue("/Users/me/map.svg");
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "古い子");
      await user.keyboard(CMD_O);
      await screen.findByRole("status");
      expect(docState()).not.toContain("未保存");

      await user.keyboard("{Meta>}{Shift>}e{/Shift}{/Meta}");
      await screen.findByText(/書き出しました/);

      expect(docState()).not.toContain("未保存");
    });

    it("選択の移動やコピーは、変更として扱わない。ノードの編集・折りたたみ・スタイル変更は、変更として扱う", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "a");
      await addChildNamed(user, "a1");
      await user.keyboard(CMD_S);
      await screen.findByRole("status");

      await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowRight}");
      await user.keyboard("{Meta>}c{/Meta}");
      expect(docState()).not.toContain("未保存");

      await user.keyboard(" "); // 折りたたみ
      expect(docState()).toContain("未保存");
      await user.keyboard(CMD_Z);
      expect(docState()).not.toContain("未保存");

      await user.keyboard("{Meta>}b{/Meta}"); // 太字
      expect(docState()).toContain("未保存");
    });

    it("ファイル名と、変更の有無を表示する（保存前は「無題」）", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/Documents/ideas.json");
      const user = userEvent.setup();
      render(<App />);
      expect(docState()).toBe("無題");

      await addChildNamed(user, "a");
      expect(docState()).toBe("無題 ● 未保存");

      await user.keyboard(CMD_S);
      await screen.findByRole("status");
      expect(docState()).toBe("ideas.json");
    });
  });

  describe("ウィンドウを閉じるときの確認", () => {
    /** 登録された、未保存かどうかを返す関数 */
    const isDirty = () => {
      const calls = mockedRegisterCloseGuard.mock.calls;
      return calls[calls.length - 1][0]();
    };

    it("起動時に、閉じる操作の監視を登録し、確認には confirmDiscard を使う", async () => {
      render(<App />);

      await waitFor(() => expect(mockedRegisterCloseGuard).toHaveBeenCalled());
      await mockedRegisterCloseGuard.mock.calls[0][1]();
      expect(mockedConfirmDiscard).toHaveBeenCalledTimes(1);
    });

    it("未保存かどうかは、現在の状態を反映する（変更で未保存になり、保存で戻る）", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      render(<App />);
      await waitFor(() => expect(mockedRegisterCloseGuard).toHaveBeenCalled());
      expect(isDirty()).toBe(false);

      await addChildNamed(user, "a");
      expect(isDirty()).toBe(true);

      await user.keyboard("{Meta>}s{/Meta}");
      await screen.findByRole("status");
      expect(isDirty()).toBe(false);
    });

    it("画面を閉じるときに、監視を解除する", async () => {
      const { unmount } = render(<App />);
      await waitFor(() => expect(mockedRegisterCloseGuard).toHaveBeenCalled());

      unmount();

      await waitFor(() => expect(unlistenCloseGuard).toHaveBeenCalledTimes(1));
    });

    it("登録の完了前に画面が閉じられても、後から確実に解除される", async () => {
      let finish: (unlisten: () => void) => void = () => {};
      mockedRegisterCloseGuard.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const { unmount } = render(<App />);
      unmount();

      finish(unlistenCloseGuard);

      await waitFor(() => expect(unlistenCloseGuard).toHaveBeenCalledTimes(1));
    });

    it("Tauri の外（ブラウザでの開発など）で登録に失敗しても、アプリは動き続ける", async () => {
      mockedRegisterCloseGuard.mockRejectedValue(new Error("Tauri が利用できません"));
      const user = userEvent.setup();
      const { container } = render(<App />);
      await waitFor(() => expect(mockedRegisterCloseGuard).toHaveBeenCalled());

      await addChildNamed(user, "a");

      expect(nodes(container)).toHaveLength(2);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("システムのクリップボードとの連携", () => {
    const CMD_C = "{Meta>}c{/Meta}";
    const CMD_V = "{Meta>}v{/Meta}";
    const CMD_X = "{Meta>}x{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";

    /** 別のIdeaTreeからコピーされた、「外部」「外部の子」のサブツリーを、クリップボードの文字列にする */
    function externalSubtreeText(style?: { bold: true }) {
      const base = createMindMap("別のマップ");
      const x = addChild(base, base.rootId, "外部");
      const xChild = addChild(x.map, x.nodeId, "外部の子");
      const map = style ? setNodeStyle(xChild.map, x.nodeId, style) : xChild.map;
      return subtreeToText(copyNode(map, x.nodeId));
    }

    /** 書き込んだ内容を、そのまま読み出せる、システムのクリップボードの代役 */
    function useWorkingClipboard(initial = "") {
      let content = initial;
      mockedWriteClipboard.mockImplementation(async (text) => {
        content = text;
      });
      mockedReadClipboard.mockImplementation(async () => content);
    }

    describe("コピー・カット", () => {
      it("Cmd+C で、コピーしたサブツリーを、システムのクリップボードにも書き込む", async () => {
        const user = userEvent.setup();
        render(<App />);
        await addChildNamed(user, "a");
        await addChildNamed(user, "a1");
        await user.keyboard("{ArrowLeft}");

        await user.keyboard(CMD_C);

        expect(mockedWriteClipboard).toHaveBeenCalledTimes(1);
        const content = parseClipboardText(mockedWriteClipboard.mock.calls[0][0]);
        expect(content.kind).toBe("subtree");
        if (content.kind === "subtree") {
          expect(content.subtree.nodes[content.subtree.rootId].text).toBe("a");
          expect(Object.keys(content.subtree.nodes)).toHaveLength(2);
        }
      });

      it("Cmd+X でも、カットしたサブツリーを、システムのクリップボードに書き込む", async () => {
        const user = userEvent.setup();
        render(<App />);
        await addChildNamed(user, "a");

        await user.keyboard(CMD_X);

        expect(mockedWriteClipboard).toHaveBeenCalledTimes(1);
        expect(parseClipboardText(mockedWriteClipboard.mock.calls[0][0]).kind).toBe("subtree");
        expect(screen.queryByText("a")).not.toBeInTheDocument();
      });

      it("書き込みに失敗しても、エラーは表示せず、アプリの中のコピーは使える", async () => {
        mockedWriteClipboard.mockRejectedValue(new Error("クリップボードに書き込めません: x"));
        const user = userEvent.setup();
        const { container } = render(<App />);
        await addChildNamed(user, "a");
        await user.keyboard(CMD_C);
        await user.keyboard("{ArrowLeft}");

        await user.keyboard(CMD_V);

        await waitFor(() => expect(nodes(container)).toHaveLength(3));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });

      it("コピーしたものを、同じマップに貼り付けると、複製される（システムのクリップボード経由）", async () => {
        useWorkingClipboard();
        const user = userEvent.setup();
        const { container } = render(<App />);
        await addChildNamed(user, "a");
        await user.keyboard(CMD_C);
        await user.keyboard("{ArrowLeft}");

        await user.keyboard(CMD_V);

        await waitFor(() => expect(nodes(container)).toHaveLength(3));
        expect(screen.getAllByText("a")).toHaveLength(2);
      });
    });

    describe("貼り付け: IdeaTree のサブツリー", () => {
      it("別のアプリや別のウィンドウでコピーしたサブツリーを、選択ノードの子として貼り付け、選択する", async () => {
        mockedReadClipboard.mockResolvedValue(externalSubtreeText());
        const user = userEvent.setup();
        const { container } = render(<App />);

        await user.keyboard(CMD_V);

        expect(await screen.findByText("外部")).toBeInTheDocument();
        expect(screen.getByText("外部の子")).toBeInTheDocument();
        expect(nodes(container)).toHaveLength(3);
        expect(selectedText(container)).toBe("外部");
      });

      it("サブツリーのスタイルも、引き継がれる", async () => {
        mockedReadClipboard.mockResolvedValue(externalSubtreeText({ bold: true }));
        const user = userEvent.setup();
        render(<App />);

        await user.keyboard(CMD_V);

        expect((await screen.findByText("外部")).getAttribute("font-weight")).toBe("bold");
      });

      it("システムのクリップボードの内容が、アプリの中のコピーより優先される", async () => {
        const user = userEvent.setup();
        render(<App />);
        await addChildNamed(user, "内部のコピー");
        await user.keyboard(CMD_C);
        await user.keyboard("{ArrowLeft}");
        mockedReadClipboard.mockResolvedValue(externalSubtreeText());

        await user.keyboard(CMD_V);

        expect(await screen.findByText("外部")).toBeInTheDocument();
        expect(screen.getAllByText("内部のコピー")).toHaveLength(1);
      });

      it("貼り付けは1手の履歴で、元に戻せる", async () => {
        mockedReadClipboard.mockResolvedValue(externalSubtreeText());
        const user = userEvent.setup();
        const { container } = render(<App />);
        await user.keyboard(CMD_V);
        await screen.findByText("外部");

        await user.keyboard(CMD_Z);

        expect(nodes(container)).toHaveLength(1);
      });
    });

    describe("貼り付け: 普通のテキスト", () => {
      it("複数行のテキストを、1行1ノードで、選択ノードの子として追加し、最初のノードを選択する", async () => {
        mockedReadClipboard.mockResolvedValue("企画\n\n  予算  \n調査");
        const user = userEvent.setup();
        const { container } = render(<App />);

        await user.keyboard(CMD_V);

        expect(await screen.findByText("企画")).toBeInTheDocument();
        expect(screen.getByText("予算")).toBeInTheDocument();
        expect(screen.getByText("調査")).toBeInTheDocument();
        expect(nodes(container)).toHaveLength(4);
        expect(selectedText(container)).toBe("企画");
      });

      it("1行のテキストは、1つのノードになる", async () => {
        mockedReadClipboard.mockResolvedValue("アイデア");
        const user = userEvent.setup();
        const { container } = render(<App />);

        await user.keyboard(CMD_V);

        expect(await screen.findByText("アイデア")).toBeInTheDocument();
        expect(nodes(container)).toHaveLength(2);
      });

      it("中心ノードに貼り付けた行は、それぞれ別の色のメインブランチになる", async () => {
        mockedReadClipboard.mockResolvedValue("a\nb");
        const user = userEvent.setup();
        render(<App />);

        await user.keyboard(CMD_V);

        expect((await screen.findByText("a")).getAttribute("fill")).toBe(BRANCH_COLORS[0]);
        expect(screen.getByText("b").getAttribute("fill")).toBe(BRANCH_COLORS[1]);
      });

      it("折りたたまれたノードに貼り付けると、自動で展開される", async () => {
        const user = userEvent.setup();
        render(<App />);
        await addChildNamed(user, "親");
        await addChildNamed(user, "子");
        await user.keyboard("{ArrowLeft}");
        await user.keyboard(" ");
        expect(screen.getByText("親…")).toBeInTheDocument();
        mockedReadClipboard.mockResolvedValue("追加");

        await user.keyboard(CMD_V);

        expect(await screen.findByText("追加")).toBeInTheDocument();
        expect(screen.getByText("子")).toBeInTheDocument();
      });

      it("貼り付けは1手の履歴で、複数行をまとめて元に戻せる", async () => {
        mockedReadClipboard.mockResolvedValue("a\nb\nc");
        const user = userEvent.setup();
        const { container } = render(<App />);
        await user.keyboard(CMD_V);
        await screen.findByText("c");

        await user.keyboard(CMD_Z);

        expect(nodes(container)).toHaveLength(1);
      });
    });

    describe("貼り付けるものがない・読み込めない場合", () => {
      it.each([[""], ["   \n  "], ['{"a": 1}'], ["[1, 2]"]])(
        "クリップボードが空、または貼り付けられない内容（%j）のときは、何もしない（アプリの中のコピーも使わない）",
        async (content) => {
          const user = userEvent.setup();
          const { container } = render(<App />);
          await addChildNamed(user, "内部のコピー");
          await user.keyboard(CMD_C);
          await user.keyboard("{ArrowLeft}");
          mockedReadClipboard.mockResolvedValue(content);

          await user.keyboard(CMD_V);
          await waitFor(() => expect(mockedReadClipboard).toHaveBeenCalled());

          expect(nodes(container)).toHaveLength(2);
          expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        },
      );

      it("システムのクリップボードを読み込めないときは、アプリの中のコピーを貼り付ける", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await addChildNamed(user, "内部のコピー");
        await user.keyboard(CMD_C);
        await user.keyboard("{ArrowLeft}");

        await user.keyboard(CMD_V);

        await waitFor(() => expect(nodes(container)).toHaveLength(3));
        expect(screen.getAllByText("内部のコピー")).toHaveLength(2);
      });

      it("読み込めず、アプリの中のコピーもないときは、何もしない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);

        await user.keyboard(CMD_V);
        await waitFor(() => expect(mockedReadClipboard).toHaveBeenCalled());

        expect(nodes(container)).toHaveLength(1);
      });
    });

    it("テキスト編集中の Cmd+V では、ノードを貼り付けない（入力欄の貼り付けに任せる）", async () => {
      mockedReadClipboard.mockResolvedValue("貼り付け");
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard("{Tab}");

      await user.keyboard(CMD_V);

      expect(mockedReadClipboard).not.toHaveBeenCalled();
      expect(nodes(container)).toHaveLength(2);
    });
  });

  describe("Option + 矢印キー: ノードの移動・並べ替え", () => {
    const ALT_UP = "{Alt>}{ArrowUp}{/Alt}";
    const ALT_DOWN = "{Alt>}{ArrowDown}{/Alt}";
    const ALT_LEFT = "{Alt>}{ArrowLeft}{/Alt}";
    const ALT_RIGHT = "{Alt>}{ArrowRight}{/Alt}";
    const CMD_Z = "{Meta>}z{/Meta}";

    /** 描かれている順（深さ優先）のノードのテキスト */
    const order = (container: HTMLElement) => [...nodes(container)].map((g) => g.textContent);

    /** 中心 ─ a / b / c を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
      await addSiblingNamed(user, "c");
      await user.keyboard("{ArrowUp}");
    }

    describe("↑ ↓: 兄弟の順序の入れ替え", () => {
      it("Option+↑ で1つ前へ、Option+↓ で1つ後ろへ移動する（選択は、移動したノードのまま）", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);

        await user.keyboard(ALT_UP);
        expect(order(container)).toEqual(["中心テーマ", "b", "a", "c"]);
        expect(selectedText(container)).toBe("b");

        await user.keyboard(ALT_DOWN);
        await user.keyboard(ALT_DOWN);
        expect(order(container)).toEqual(["中心テーマ", "a", "c", "b"]);
        expect(selectedText(container)).toBe("b");
      });

      it("先頭で ↑、末尾で ↓ を押しても、何も起きず、履歴にも残らない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);
        await user.keyboard(ALT_UP);

        await user.keyboard(ALT_UP);
        expect(order(container)).toEqual(["中心テーマ", "b", "a", "c"]);

        await user.keyboard(CMD_Z); // 1回の移動だけが戻る
        expect(order(container)).toEqual(["中心テーマ", "a", "b", "c"]);
      });
    });

    describe("→: 前の兄弟の子にする（インデント）", () => {
      it("前の兄弟の、最後の子になる", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);

        await user.keyboard(ALT_RIGHT);

        expect(order(container)).toEqual(["中心テーマ", "a", "b", "c"]);
        expect(selectedText(container)).toBe("b");
        await user.keyboard("{ArrowLeft}");
        expect(selectedText(container)).toBe("a");
      });

      it("前の兄弟が折りたたまれていると、自動で展開される", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        await user.keyboard("{ArrowUp}"); // a
        await addChildNamed(user, "a1");
        await user.keyboard("{ArrowLeft}");
        await user.keyboard(" "); // a を折りたたむ
        await user.keyboard("{ArrowDown}"); // b

        await user.keyboard(ALT_RIGHT);

        expect(screen.getByText("a1")).toBeInTheDocument();
        expect(screen.getByText("a")).toBeInTheDocument(); // 「a…」ではない
      });

      it("前の兄弟がいない（先頭の）ノードでは、何も起きない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);
        await user.keyboard("{ArrowUp}"); // a

        await user.keyboard(ALT_RIGHT);

        expect(order(container)).toEqual(["中心テーマ", "a", "b", "c"]);
        await user.keyboard("{ArrowLeft}");
        expect(selectedText(container)).toBe("中心テーマ");
      });
    });

    describe("←: 親の兄弟にする（アウトデント）", () => {
      it("親の直後の兄弟になる", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);
        await user.keyboard("{ArrowUp}"); // a
        await addChildNamed(user, "a1");

        await user.keyboard(ALT_LEFT);

        expect(selectedText(container)).toBe("a1");
        await user.keyboard("{ArrowLeft}");
        expect(selectedText(container)).toBe("中心テーマ"); // 親は中心ノードになった
        await user.keyboard("{ArrowRight}{ArrowDown}");
        expect(selectedText(container)).toBe("a1"); // a の直後
      });

      it("中心ノードの子に移動すると、新しいメインブランチとして、色が割り当てられる", async () => {
        const user = userEvent.setup();
        render(<App />);
        await buildTree(user);
        await user.keyboard("{ArrowUp}");
        await addChildNamed(user, "a1");
        expect(screen.getByText("a1").getAttribute("fill")).toBe(BRANCH_COLORS[0]); // a の色を引き継ぐ

        await user.keyboard(ALT_LEFT);

        expect(screen.getByText("a1").getAttribute("fill")).toBe(BRANCH_COLORS[3]); // a, b, c が使用済み
      });

      it("メインブランチ（中心ノードの子）では、何も起きない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);

        await user.keyboard(ALT_LEFT);

        expect(order(container)).toEqual(["中心テーマ", "a", "b", "c"]);
        await user.keyboard("{ArrowLeft}");
        expect(selectedText(container)).toBe("中心テーマ");
      });
    });

    describe("共通", () => {
      it("移動は1手の履歴で、元に戻したり、やり直したりできる", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);

        await user.keyboard(ALT_RIGHT);
        await user.keyboard(CMD_Z);
        expect(order(container)).toEqual(["中心テーマ", "a", "b", "c"]);
        await user.keyboard("{ArrowLeft}");
        expect(selectedText(container)).toBe("中心テーマ"); // 移動前の親（中心ノード）

        await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
        expect(nodes(container)).toHaveLength(4);
      });

      it("中心ノードでは、何も起きない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);
        await user.keyboard("{ArrowLeft}"); // 中心ノード

        await user.keyboard(ALT_UP + ALT_DOWN + ALT_LEFT + ALT_RIGHT);

        expect(order(container)).toEqual(["中心テーマ", "a", "b", "c"]);
        expect(selectedText(container)).toBe("中心テーマ");
      });

      it("ブラウザ標準の動作を止める", async () => {
        render(<App />);

        expect(fireEvent.keyDown(window, { key: "ArrowUp", altKey: true })).toBe(false);
        expect(fireEvent.keyDown(window, { key: "ArrowRight", altKey: true })).toBe(false);
      });

      it("Shift や Cmd と組み合わせたとき、テキスト編集中は、移動しない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await buildTree(user);

        await user.keyboard("{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}");
        await user.keyboard("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");
        await user.keyboard("{F2}");
        await user.keyboard(ALT_UP);
        await user.keyboard("{Escape}"); // 編集を取り消す（編集中は、ノードのテキストが入力欄に置き換わるため）

        expect(order(container)).toEqual(["中心テーマ", "a", "b", "c"]);
      });
    });
  });

  describe("マウスのドラッグ: ノードを別のノードの子へつなぎ替える", () => {
    const CMD_Z = "{Meta>}z{/Meta}";
    const at = (x: number, y: number) => ({ clientX: x, clientY: y });

    /** 描かれている順（深さ優先）のノードのテキスト */
    const order = (container: HTMLElement) => [...nodes(container)].map((g) => g.textContent);
    const nodeG = (text: string) => screen.getByText(text).closest("g[data-node-id]") as Element;

    /** ノードを押して、十分に動かしてから、別のノードの上まで移動する（まだ離さない） */
    async function dragOver(user: User, from: string, to: string) {
      await user.pointer([
        { keys: "[MouseLeft>]", target: screen.getByText(from), coords: at(100, 100) },
        { target: screen.getByText(from), coords: at(130, 130) },
        { target: screen.getByText(to), coords: at(300, 300) },
      ]);
    }

    /** ドラッグして、ドロップ先で離す */
    async function drag(user: User, from: string, to: string) {
      await dragOver(user, from, to);
      await user.pointer({ keys: "[/MouseLeft]", target: screen.getByText(to), coords: at(300, 300) });
    }

    /** 中心 ─ a(a1) / b を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addChildNamed(user, "a1");
      await user.keyboard("{ArrowLeft}");
      await addSiblingNamed(user, "b");
    }

    it("ノードを別のノードの上にドラッグして離すと、そのノードの子になり、移動したノードが選択される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await drag(user, "b", "a1");

      expect(selectedText(container)).toBe("b");
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("a1");
      expect(order(container)).toEqual(["中心テーマ", "a", "a1", "b"]);
    });

    it("中心ノードの上にドラッグすると、中心ノードの子（メインブランチ）になり、色が割り当てられる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      expect(screen.getByText("a1").getAttribute("fill")).toBe(BRANCH_COLORS[0]);

      await drag(user, "a1", "中心テーマ");

      expect(screen.getByText("a1").getAttribute("fill")).toBe(BRANCH_COLORS[2]); // a, b が使用済み
    });

    it("メインブランチを、別のブランチの下にドラッグすると、移動先のブランチの色になる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      expect(screen.getByText("b").getAttribute("fill")).toBe(BRANCH_COLORS[1]);

      await drag(user, "b", "a");

      expect(screen.getByText("b").getAttribute("fill")).toBe(BRANCH_COLORS[0]);
    });

    it("折りたたまれたノードの上に離すと、自動で展開される", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.click(screen.getByText("a"));
      await user.keyboard(" ");
      expect(screen.getByText("a…")).toBeInTheDocument();

      await drag(user, "b", "a…");

      expect(screen.getByText("a1")).toBeInTheDocument();
      expect(screen.getByText("a")).toBeInTheDocument();
    });

    it("移動は1手の履歴で、元に戻したり、やり直したりできる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await drag(user, "b", "a1");

      await user.keyboard(CMD_Z);
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("中心テーマ"); // b は、元どおり中心ノードの子

      await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("a1");
    });

    it("ドラッグ中は、ドロップできるノードが強調表示され、離すと消える", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);

      await dragOver(user, "b", "a1");
      expect(nodeG("a1")).toHaveAttribute("data-drop-target", "true");
      expect(nodeG("a")).not.toHaveAttribute("data-drop-target", "true");

      await user.pointer({ keys: "[/MouseLeft]", target: screen.getByText("a1"), coords: at(300, 300) });
      expect(document.querySelector('[data-drop-target="true"]')).toBeNull();
    });

    it("何もない場所に離すと、何も起きない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.pointer([
        { keys: "[MouseLeft>]", target: screen.getByText("b"), coords: at(100, 100) },
        { target: screen.getByText("b"), coords: at(150, 150) },
        { target: screen.getByRole("application"), coords: at(400, 400) },
        { keys: "[/MouseLeft]", target: screen.getByRole("application"), coords: at(400, 400) },
      ]);

      expect(order(container)).toEqual(["中心テーマ", "a", "a1", "b"]);
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("中心テーマ");
      await user.keyboard(CMD_Z);
      expect(nodes(container)).toHaveLength(3); // 履歴には残っていない（b の追加が戻る）
    });

    it("自分自身・自分の子孫・今の親の上に離しても、何も起きず、強調表示もされない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await dragOver(user, "a", "a1");
      expect(document.querySelector('[data-drop-target="true"]')).toBeNull();
      await user.pointer({ keys: "[/MouseLeft]", target: screen.getByText("a1"), coords: at(300, 300) });

      await drag(user, "a", "a");
      await drag(user, "a1", "a");

      expect(order(container)).toEqual(["中心テーマ", "a", "a1", "b"]);
      await user.keyboard(CMD_Z);
      expect(nodes(container)).toHaveLength(3); // 履歴に残っていない
    });

    it("中心ノードは、ドラッグしても移動しない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await drag(user, "中心テーマ", "a1");

      expect(order(container)).toEqual(["中心テーマ", "a", "a1", "b"]);
    });

    it("少ししか動かしていない操作は、ドラッグではなくクリック（選択）として扱われる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.pointer([
        { keys: "[MouseLeft>]", target: screen.getByText("a"), coords: at(100, 100) },
        { target: screen.getByText("a"), coords: at(102, 101) },
        { keys: "[/MouseLeft]", target: screen.getByText("a"), coords: at(102, 101) },
      ]);

      expect(selectedText(container)).toBe("a");
      expect(order(container)).toEqual(["中心テーマ", "a", "a1", "b"]);
    });

    it("ドラッグの途中で Escape を押すと、取り消され、離しても移動しない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await dragOver(user, "b", "a1");

      await user.keyboard("{Escape}");
      expect(document.querySelector('[data-drop-target="true"]')).toBeNull();
      await user.pointer({ keys: "[/MouseLeft]", target: screen.getByText("a1"), coords: at(300, 300) });

      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("中心テーマ");
    });

    it("左ボタン以外では、ドラッグしない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.pointer([
        { keys: "[MouseRight>]", target: screen.getByText("b"), coords: at(100, 100) },
        { target: screen.getByText("b"), coords: at(130, 130) },
        { target: screen.getByText("a1"), coords: at(300, 300) },
        { keys: "[/MouseRight]", target: screen.getByText("a1"), coords: at(300, 300) },
      ]);

      expect(order(container)).toEqual(["中心テーマ", "a", "a1", "b"]);
    });
  });

  describe("ノードの画像（Cmd+Shift+I）", () => {
    const PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
    const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    const CMD_SHIFT_I = "{Meta>}{Shift>}i{/Shift}{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";
    const images = (container: HTMLElement) => container.querySelectorAll("image");

    /** 中心 ─ a / b を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
    }

    it("Cmd+Shift+I で画像を選ぶダイアログを開き、選んだ画像が、選択ノードに設定されて表示される", async () => {
      mockedPickImage.mockResolvedValue(PNG);
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.keyboard(CMD_SHIFT_I);

      await waitFor(() => expect(images(container)).toHaveLength(1));
      expect(mockedPickImage).toHaveBeenCalledTimes(1);
      expect(images(container)[0].getAttribute("href")).toBe(PNG);
      expect(images(container)[0].closest("g[data-node-id]")?.textContent).toBe("b");
    });

    it("中心ノードに設定すると、楕円の代わりに画像（セントラルイメージ）が表示され、テキストも残る", async () => {
      mockedPickImage.mockResolvedValue(PNG);
      const user = userEvent.setup();
      const { container } = render(<App />);
      expect(container.querySelector("ellipse")).not.toBeNull();

      await user.keyboard(CMD_SHIFT_I);

      await waitFor(() => expect(images(container)).toHaveLength(1));
      expect(container.querySelector("ellipse")).toBeNull();
      expect(screen.getByText("中心テーマ")).toBeInTheDocument();
    });

    it("ダイアログをキャンセルしたら、何も起きず、履歴にも残らない", async () => {
      mockedPickImage.mockResolvedValue(null);
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.keyboard(CMD_SHIFT_I);
      await waitFor(() => expect(mockedPickImage).toHaveBeenCalledTimes(1));
      await user.keyboard(CMD_Z);

      expect(images(container)).toHaveLength(0);
      expect(screen.queryByText("b")).not.toBeInTheDocument(); // b の追加が、1手で戻る
    });

    it("画像を読み込めなかったときは、エラーを表示し、ノードは変わらない", async () => {
      mockedPickImage.mockRejectedValue(new Error("画像を読み込めません: 画像が大きすぎます（上限 2 MB）"));
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard(CMD_SHIFT_I);

      expect(await screen.findByRole("alert")).toHaveTextContent("画像が大きすぎます");
      expect(images(container)).toHaveLength(0);
    });

    it("不正な形式の画像が返されたときも、エラーを表示し、設定しない", async () => {
      mockedPickImage.mockResolvedValue("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_I);

      expect(await screen.findByRole("alert")).toHaveTextContent("画像の形式が不正です");
    });

    it("画像の設定は1手の履歴で、元に戻したり、やり直したりできる", async () => {
      mockedPickImage.mockResolvedValue(PNG);
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard(CMD_SHIFT_I);
      await waitFor(() => expect(images(container)).toHaveLength(1));

      await user.keyboard(CMD_Z);
      expect(images(container)).toHaveLength(0);

      await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
      expect(images(container)).toHaveLength(1);
    });

    it("同じ画像をもう一度設定しても、履歴は増えない", async () => {
      mockedPickImage.mockResolvedValue(PNG);
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_SHIFT_I);
      await waitFor(() => expect(images(container)).toHaveLength(1));

      await user.keyboard(CMD_SHIFT_I);
      await waitFor(() => expect(mockedPickImage).toHaveBeenCalledTimes(2));
      await user.keyboard(CMD_Z); // 画像の設定が、1手で戻る
      expect(images(container)).toHaveLength(0);
      expect(screen.getByText("a")).toBeInTheDocument();
    });

    it("画像は、ファイルに保存される内容に含まれ、開いたファイルでも表示される", async () => {
      mockedPickImage.mockResolvedValue(PNG);
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard(CMD_SHIFT_I);
      await waitFor(() => expect(images(container)).toHaveLength(1));
      await user.keyboard("{Meta>}s{/Meta}");
      await screen.findByRole("status");
      const [saved] = mockedSaveFile.mock.calls[0];
      expect(Object.values(saved.nodes).filter((n) => n.image === PNG)).toHaveLength(1);

      const base = loadedMap();
      mockedLoadFile.mockResolvedValue({
        map: setNodeImage(base, base.rootId, GIF),
        path: "/Users/me/other.json",
      });
      await user.keyboard("{Meta>}o{/Meta}");
      await screen.findByText(/開きました/);

      expect(images(container)[0].getAttribute("href")).toBe(GIF);
    });

    it("画像をクリックすると、そのノードが選択される", async () => {
      mockedPickImage.mockResolvedValue(PNG);
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_SHIFT_I);
      await waitFor(() => expect(images(container)).toHaveLength(1));
      await user.click(screen.getByText("a"));
      expect(selectedText(container)).toBe("a");

      await user.click(images(container)[0]);

      expect(selectedText(container)).toBe("b");
    });

    it("コピー＆ペーストで、画像も引き継がれる", async () => {
      mockedPickImage.mockResolvedValue(PNG);
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_SHIFT_I);
      await waitFor(() => expect(images(container)).toHaveLength(1));
      await user.keyboard("{Meta>}c{/Meta}");
      await user.keyboard("{ArrowUp}");
      await user.keyboard("{Meta>}v{/Meta}");

      await waitFor(() => expect(images(container)).toHaveLength(2));
    });

    it("ブラウザ標準の動作を止める。Ctrl+Shift+I や Cmd+I（斜体）、テキスト編集中では、画像を選ばない", async () => {
      const user = userEvent.setup();
      render(<App />);
      expect(fireEvent.keyDown(window, { key: "I", metaKey: true, shiftKey: true })).toBe(false);
      await waitFor(() => expect(mockedPickImage).toHaveBeenCalledTimes(1));
      mockedPickImage.mockClear();

      await user.keyboard("{Control>}{Shift>}i{/Shift}{/Control}");
      await user.keyboard("{Meta>}i{/Meta}");
      await user.keyboard("{F2}");
      await user.keyboard(CMD_SHIFT_I);

      expect(mockedPickImage).not.toHaveBeenCalled();
    });

    describe("スタイルパネルからの操作", () => {
      const panel = () => screen.getByRole("dialog", { name: "スタイル" });

      it("「画像を選ぶ…」で、画像を設定できる（Cmd+Shift+I と同じ）", async () => {
        mockedPickImage.mockResolvedValue(PNG);
        const user = userEvent.setup();
        const { container } = render(<App />);
        await user.keyboard("{Meta>}k{/Meta}");

        await user.click(within(panel()).getByRole("button", { name: "画像を選ぶ…" }));

        await waitFor(() => expect(images(container)).toHaveLength(1));
      });

      it("「画像を外す」で画像を外せる。画像がないときは、押せない", async () => {
        mockedPickImage.mockResolvedValue(PNG);
        const user = userEvent.setup();
        const { container } = render(<App />);
        await user.keyboard("{Meta>}k{/Meta}");
        const remove = () => within(panel()).getByRole("button", { name: "画像を外す" });
        expect(remove()).toBeDisabled();

        await user.click(within(panel()).getByRole("button", { name: "画像を選ぶ…" }));
        await waitFor(() => expect(images(container)).toHaveLength(1));
        expect(remove()).toBeEnabled();

        await user.click(remove());
        expect(images(container)).toHaveLength(0);
        expect(container.querySelector("ellipse")).not.toBeNull();
        expect(remove()).toBeDisabled();
      });

      it("画像を外す操作も、1手の履歴になる", async () => {
        mockedPickImage.mockResolvedValue(PNG);
        const user = userEvent.setup();
        const { container } = render(<App />);
        await user.keyboard("{Meta>}k{/Meta}");
        await user.click(within(panel()).getByRole("button", { name: "画像を選ぶ…" }));
        await waitFor(() => expect(images(container)).toHaveLength(1));
        await user.click(within(panel()).getByRole("button", { name: "画像を外す" }));
        await user.keyboard("{Escape}");

        await user.keyboard(CMD_Z);

        expect(images(container)).toHaveLength(1);
      });
    });
  });

  describe("クリックできる範囲の拡大", () => {
    const hitArea = (text: string) =>
      screen.getByText(text).closest("g[data-node-id]")!.querySelector('rect[data-role="hit-area"]');

    /** 中心 ─ a(a1) / b を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addChildNamed(user, "a1");
      await user.keyboard("{ArrowLeft}");
      await addSiblingNamed(user, "b");
    }

    it("中心ノード以外の各ノードに、文字のまわりの、透明なクリック範囲がある", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      expect(container.querySelectorAll('rect[data-role="hit-area"]')).toHaveLength(3);
      expect(
        screen.getByText("中心テーマ").closest("g")!.querySelector('rect[data-role="hit-area"]'),
      ).toBeNull();
      expect(hitArea("a")!.getAttribute("fill")).toBe("transparent");
    });

    it("クリック範囲は、ラベルと同じ位置を中心にし、文字の大きさに見合う大きさである", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);

      for (const [text, size] of [
        ["a", 20],
        ["a1", 16],
        ["b", 20],
      ] as const) {
        const rect = hitArea(text)!;
        const label = screen.getByText(text);
        const { width, height } = hitAreaSize(text, size);
        expect(Number(rect.getAttribute("width"))).toBeCloseTo(width);
        expect(Number(rect.getAttribute("height"))).toBeCloseTo(height);
        expect(Number(rect.getAttribute("x")) + width / 2).toBeCloseTo(Number(label.getAttribute("x")));
        expect(Number(rect.getAttribute("y")) + height / 2).toBeCloseTo(Number(label.getAttribute("y")));
      }
    });

    it("文字を大きくすると、クリック範囲（の高さ）も大きくなる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      const before = Number(hitArea("b")!.getAttribute("height"));

      await user.keyboard("{Meta>}k{/Meta}");
      await user.selectOptions(screen.getByRole("combobox", { name: "文字サイズ" }), "48");

      expect(Number(hitArea("b")!.getAttribute("height"))).toBeGreaterThan(before);
    });

    it("クリック範囲をクリックすると、そのノードが選択され、ダブルクリックで編集できる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.click(hitArea("a")!);
      expect(selectedText(container)).toBe("a");

      await user.dblClick(hitArea("a1")!);
      expect(screen.getByRole("textbox")).toHaveValue("a1");
    });

    it("クリック範囲からでも、ノードをドラッグしてつなぎ替えられる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.pointer([
        { keys: "[MouseLeft>]", target: hitArea("b")!, coords: { clientX: 100, clientY: 100 } },
        { target: hitArea("b")!, coords: { clientX: 130, clientY: 130 } },
        { target: hitArea("a1")!, coords: { clientX: 300, clientY: 300 } },
        { keys: "[/MouseLeft]", target: hitArea("a1")!, coords: { clientX: 300, clientY: 300 } },
      ]);

      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("a1");
    });

    it("折りたたまれたノードのクリック範囲は、「…」を含む表示に合わせた大きさになる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "企画");
      await addChildNamed(user, "調査");
      await user.keyboard("{ArrowLeft}");
      const before = Number(hitArea("企画")!.getAttribute("width"));

      await user.keyboard(" ");

      expect(Number(hitArea("企画…")!.getAttribute("width"))).toBeGreaterThan(before);
    });
  });

  describe("スタイルパネル: 色の自由入力", () => {
    const CMD_K = "{Meta>}k{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";
    const panel = () => screen.getByRole("dialog", { name: "スタイル" });
    const codeField = () => within(panel()).getByRole("textbox", { name: "色コード" });
    const picker = () => within(panel()).getByLabelText("色を選ぶ") as HTMLInputElement;
    const fillOf = (text: string) => screen.getByText(text).getAttribute("fill");

    /** 中心 ─ a / b を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
    }

    it("色コード（#RRGGBB）を入力して Enter で、選択ノードの色を、任意の色にできる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      expect(codeField()).toHaveValue("");

      await user.type(codeField(), "#12abEF{Enter}");

      expect(fillOf("b")).toBe("#12ABEF");
      expect(codeField()).toHaveValue("#12ABEF");
      expect(within(panel()).getByRole("radio", { name: "#12ABEF" })).toBeChecked();
      expect(panel()).toBeInTheDocument(); // Enter でパネルは閉じない
    });

    it("パレットと同じ色を（小文字などで）入力すると、そのパレットの色が選ばれる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);

      await user.type(codeField(), "#e63946{Enter}");

      expect(within(panel()).getByRole("radio", { name: "赤" })).toBeChecked();
    });

    it("形式が正しくない色コードは、エラーを表示して、色を変えない。正しく入力し直すと、エラーが消える", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      const before = fillOf("b");

      await user.type(codeField(), "red{Enter}");

      expect(codeField()).toHaveAttribute("aria-invalid", "true");
      expect(within(panel()).getByText("色は #RRGGBB の形式で指定してください")).toBeInTheDocument();
      expect(fillOf("b")).toBe(before);

      await user.clear(codeField());
      await user.type(codeField(), "#00FF00{Enter}");
      expect(codeField()).not.toHaveAttribute("aria-invalid", "true");
      expect(within(panel()).queryByText("色は #RRGGBB の形式で指定してください")).not.toBeInTheDocument();
      expect(fillOf("b")).toBe("#00FF00");
    });

    it("空にして Enter を押すと、「自動」（メインブランチの色）に戻る", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      await user.type(codeField(), "#00FF00{Enter}");

      await user.clear(codeField());
      await user.keyboard("{Enter}");

      expect(fillOf("b")).toBe(BRANCH_COLORS[1]);
      expect(within(panel()).getByRole("radio", { name: "自動" })).toBeChecked();
    });

    it("色の選択ボタン（カラーピッカー）で選んだ色も、反映される", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);

      fireEvent.change(picker(), { target: { value: "#00ff00" } });

      expect(fillOf("b")).toBe("#00FF00");
      expect(codeField()).toHaveValue("#00FF00");
    });

    it("色の選択ボタンは、現在の色（スタイルがなければ、ブランチの色）を表示する", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);

      expect(picker().value.toUpperCase()).toBe(BRANCH_COLORS[1]);

      await user.type(codeField(), "#123456{Enter}");
      expect(picker().value.toUpperCase()).toBe("#123456");
    });

    it("色の変更は1手の履歴で、同じ色を入力し直しても、増えない", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      await user.type(codeField(), "#00FF00{Enter}");
      await user.type(codeField(), "{Enter}");
      await user.keyboard("{Escape}");

      await user.keyboard(CMD_Z);

      expect(fillOf("b")).toBe(BRANCH_COLORS[1]);
    });

    it("入力欄は、選択しているノードの色を表示し、別のノードを選ぶと切り替わる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      await user.type(codeField(), "#00FF00{Enter}");

      await user.click(screen.getByText("a"));
      expect(codeField()).toHaveValue("");

      await user.click(screen.getByText("b"));
      expect(codeField()).toHaveValue("#00FF00");
    });

    it("入力欄の中のキー（文字の入力・Backspace など）は、ノードの操作として扱われない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);

      await user.type(codeField(), "#abc{Backspace}{Backspace} ");

      expect(nodes(container)).toHaveLength(3);
      expect(selectedText(container)).toBe("b");
    });
  });

  describe("ドラッグでの兄弟の順序の指定（Shift を押しながら、兄弟の上で離す）", () => {
    const CMD_Z = "{Meta>}z{/Meta}";
    const at = (x: number, y: number) => ({ clientX: x, clientY: y });
    const order = (container: HTMLElement) => [...nodes(container)].map((g) => g.textContent);
    const nodeG = (text: string) => screen.getByText(text).closest("g[data-node-id]") as Element;

    async function dragOver(user: User, from: string, to: string) {
      await user.pointer([
        { keys: "[MouseLeft>]", target: screen.getByText(from), coords: at(100, 100) },
        { target: screen.getByText(from), coords: at(130, 130) },
        { target: screen.getByText(to), coords: at(300, 300) },
      ]);
    }
    async function drop(user: User, to: string) {
      await user.pointer({ keys: "[/MouseLeft]", target: screen.getByText(to), coords: at(300, 300) });
    }

    /** 中心 ─ a(a1) / b / c を作る */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addChildNamed(user, "a1");
      await user.keyboard("{ArrowLeft}");
      await addSiblingNamed(user, "b");
      await addSiblingNamed(user, "c");
    }

    it("Shift を押しながら、後ろの兄弟を前の兄弟の上で離すと、その位置に入る", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.keyboard("{Shift>}");
      await dragOver(user, "c", "a");
      await drop(user, "a");
      await user.keyboard("{/Shift}");

      expect(order(container)).toEqual(["中心テーマ", "c", "a", "a1", "b"]);
      expect(selectedText(container)).toBe("c");
    });

    it("前の兄弟を、後ろの兄弟の上で離すと、その位置に入る", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.keyboard("{Shift>}");
      await dragOver(user, "a", "c");
      await drop(user, "c");
      await user.keyboard("{/Shift}");

      expect(order(container)).toEqual(["中心テーマ", "b", "c", "a", "a1"]);
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("中心テーマ"); // 中心ノードの子のまま（c の子にはなっていない）
    });

    it("入れ替えは、メインブランチの色を変えず、1手の履歴で元に戻せる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard("{Shift>}");
      await dragOver(user, "c", "a");
      await drop(user, "a");
      await user.keyboard("{/Shift}");
      expect(screen.getByText("c").getAttribute("fill")).toBe(BRANCH_COLORS[2]);

      await user.keyboard(CMD_Z);

      expect(order(container)).toEqual(["中心テーマ", "a", "a1", "b", "c"]);
    });

    it("Shift を押さずに兄弟の上で離すと、これまでどおり、その子につなぎ替える", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await dragOver(user, "c", "b");
      await drop(user, "b");

      expect(order(container)).toEqual(["中心テーマ", "a", "a1", "b", "c"]);
      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("b"); // c は b の子になった
    });

    it("Shift を押していても、兄弟でないノードの上では、子につなぎ替える", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.keyboard("{Shift>}");
      await dragOver(user, "c", "a1");
      await drop(user, "a1");
      await user.keyboard("{/Shift}");

      await user.keyboard("{ArrowLeft}");
      expect(selectedText(container)).toBe("a1");
    });

    it("ドラッグ中は、離したときの動作（入れ替え・つなぎ替え）が、強調表示に示される", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);

      await dragOver(user, "c", "a");
      expect(nodeG("a")).toHaveAttribute("data-drop-mode", "child");
      await drop(user, "a");

      await user.keyboard("{Shift>}");
      await dragOver(user, "b", "a");
      expect(nodeG("a")).toHaveAttribute("data-drop-mode", "reorder");
      expect(nodeG("a")).toHaveAttribute("data-drop-target", "true");
      await drop(user, "a");
      await user.keyboard("{/Shift}");
      expect(document.querySelector("[data-drop-mode]")?.getAttribute("data-drop-mode")).not.toBe("reorder");
    });

    it("自分自身の上や、何もない場所では、Shift を押していても、何も起きない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);

      await user.keyboard("{Shift>}");
      await dragOver(user, "b", "b");
      await drop(user, "b");
      await user.keyboard("{/Shift}");

      expect(order(container)).toEqual(["中心テーマ", "a", "a1", "b", "c"]);
      await user.keyboard(CMD_Z);
      expect(screen.queryByText("c")).not.toBeInTheDocument(); // c の追加が、1手で戻る
    });
  });

  describe("ズーム・パン", () => {
    const svgEl = (container: HTMLElement) => container.querySelector("svg.mindmap") as SVGSVGElement;
    /** 表示範囲（viewBox）を [x, y, width, height] で返す */
    const viewBox = (container: HTMLElement) =>
      svgEl(container).getAttribute("viewBox")!.split(" ").map(Number);
    /** 画面上の幅を 900px に固定する（jsdom には、レイアウトがないため） */
    const fixScreenWidth = (container: HTMLElement) => {
      svgEl(container).getBoundingClientRect = () =>
        ({ width: 900, height: 900, left: 0, top: 0, right: 900, bottom: 900, x: 0, y: 0 }) as DOMRect;
    };
    const zoomState = () => document.querySelector(".zoom-state")?.textContent;

    it("起動直後は、拡大率 100% で、原点が中心。拡大率の表示は出ない", () => {
      const { container } = render(<App />);

      expect(viewBox(container)).toEqual([-450, -450, 900, 900]);
      expect(zoomState()).toBeUndefined();
    });

    it("Cmd+= / Cmd++ で拡大し、Cmd+- で縮小し、Cmd+0 で、拡大率と位置を元に戻す", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.keyboard("{Meta>}={/Meta}");
      expect(viewBox(container)[2]).toBeCloseTo(720); // 900 ÷ 1.25
      expect(zoomState()).toBe("125%");

      await user.keyboard("{Meta>}{Shift>}+{/Shift}{/Meta}");
      expect(viewBox(container)[2]).toBeCloseTo(576);

      await user.keyboard("{Meta>}-{/Meta}{Meta>}-{/Meta}{Meta>}-{/Meta}");
      expect(viewBox(container)[2]).toBeCloseTo(1125);
      expect(zoomState()).toBe("80%");

      await user.keyboard("{Meta>}0{/Meta}");
      expect(viewBox(container)).toEqual([-450, -450, 900, 900]);
      expect(zoomState()).toBeUndefined();
    });

    it("拡大率には、上限（400%）と下限（25%）がある", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);

      for (let i = 0; i < 12; i++) await user.keyboard("{Meta>}={/Meta}");
      expect(viewBox(container)[2]).toBeCloseTo(225);
      expect(zoomState()).toBe("400%");

      await user.keyboard("{Meta>}0{/Meta}");
      for (let i = 0; i < 12; i++) await user.keyboard("{Meta>}-{/Meta}");
      expect(viewBox(container)[2]).toBeCloseTo(3600);
      expect(zoomState()).toBe("25%");
    });

    it("ブラウザ標準の動作を止める。Ctrl との組み合わせや、テキスト編集中は、拡大・縮小しない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      expect(fireEvent.keyDown(window, { key: "=", metaKey: true })).toBe(false);
      expect(fireEvent.keyDown(window, { key: "-", metaKey: true })).toBe(false);
      expect(fireEvent.keyDown(window, { key: "0", metaKey: true })).toBe(false);
      await user.keyboard("{Meta>}0{/Meta}");

      await user.keyboard("{Control>}={/Control}");
      await user.keyboard("{F2}");
      await user.keyboard("{Meta>}={/Meta}");

      expect(viewBox(container)).toEqual([-450, -450, 900, 900]);
    });

    describe("マウスホイール・トラックパッド", () => {
      it("Ctrl（ピンチ）や Cmd を押しながら回すと、拡大・縮小する", () => {
        const { container } = render(<App />);
        const svg = svgEl(container);

        expect(fireEvent.wheel(svg, { deltaY: -100, ctrlKey: true })).toBe(false);
        expect(viewBox(container)[2]).toBeCloseTo(720);

        fireEvent.wheel(svg, { deltaY: 100, metaKey: true });
        fireEvent.wheel(svg, { deltaY: 100, ctrlKey: true });
        expect(viewBox(container)[2]).toBeCloseTo(1125);
      });

      it("そのまま回す（2本指のスクロール）と、表示位置が動く（パン）", () => {
        const { container } = render(<App />);
        fixScreenWidth(container);

        const notPrevented = fireEvent.wheel(svgEl(container), { deltaX: 30, deltaY: 100 });

        expect(notPrevented).toBe(false);
        expect(viewBox(container).slice(0, 2)).toEqual([-420, -350]);
        expect(viewBox(container)[2]).toBe(900); // 拡大率は変わらない
      });

      it("画面の幅が分からないとき（0）は、移動量を、そのままマップの座標として扱う", () => {
        const { container } = render(<App />);

        fireEvent.wheel(svgEl(container), { deltaX: 0, deltaY: 40 });

        expect(viewBox(container)[1]).toBe(-450 + 40);
      });

      it("ウィンドウの外など、ノードでない場所でノードのドラッグを終えても、エラーにならず、何も起きない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await addChildNamed(user, "a");

        fireEvent.mouseDown(screen.getByText("a"), { button: 0, clientX: 100, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 160, clientY: 160 });
        fireEvent.mouseUp(document);

        expect(nodes(container)).toHaveLength(2);
      });

      it("拡大しているときは、画面上の移動量が、マップの座標では小さくなる", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await user.keyboard("{Meta>}={/Meta}");
        fixScreenWidth(container); // 画面 900px に、マップの 720 が映っている

        fireEvent.wheel(svgEl(container), { deltaX: 0, deltaY: 100 });

        expect(viewBox(container)[1]).toBeCloseTo(-360 + 80); // 100px × (720÷900)
      });
    });

    describe("何もない場所のドラッグ", () => {
      it("何もない場所をドラッグすると、その分だけ、表示位置が動く（パン）", () => {
        const { container } = render(<App />);
        fixScreenWidth(container);
        const svg = svgEl(container);

        fireEvent.mouseDown(svg, { button: 0, clientX: 100, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 150, clientY: 130 });
        fireEvent.mouseUp(window);

        // 内容を右下に引くと、見ている範囲は、左上へ動く
        expect(viewBox(container).slice(0, 2)).toEqual([-500, -480]);
      });

      it("ボタンを離したあとは、マウスを動かしても、動かない", () => {
        const { container } = render(<App />);
        fixScreenWidth(container);
        fireEvent.mouseDown(svgEl(container), { button: 0, clientX: 100, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 150, clientY: 130 });
        fireEvent.mouseUp(window);

        fireEvent.mouseMove(window, { clientX: 300, clientY: 300 });

        expect(viewBox(container).slice(0, 2)).toEqual([-500, -480]);
      });

      it("ノードの上や、左ボタン以外では、パンにならない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await addChildNamed(user, "a");
        fixScreenWidth(container);

        fireEvent.mouseDown(svgEl(container), { button: 2, clientX: 100, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 150, clientY: 130 });
        fireEvent.mouseUp(window);
        fireEvent.mouseDown(screen.getByText("a"), { button: 0, clientX: 100, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 150, clientY: 130 });
        fireEvent.mouseUp(window);

        expect(viewBox(container).slice(0, 2)).toEqual([-450, -450]);
      });

      it("動かさずに離す（クリック）だけでは、何も変わらない", () => {
        const { container } = render(<App />);
        fixScreenWidth(container);

        fireEvent.mouseDown(svgEl(container), { button: 0, clientX: 100, clientY: 100 });
        fireEvent.mouseUp(window);

        expect(viewBox(container)).toEqual([-450, -450, 900, 900]);
      });
    });

    describe("選択の追従", () => {
      it("拡大していて、選んだノードが見える範囲の外に出たら、そのノードが中心になるよう動く", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        for (let i = 0; i < 6; i++) await user.keyboard("{Meta>}={/Meta}");
        expect(viewBox(container)[2]).toBeCloseTo(900 / 1.25 ** 6);
        const before = viewBox(container);

        await addChildNamed(user, "a"); // 最初のメインブランチは、右へ 180px の位置

        const after = viewBox(container);
        expect(after[0] + after[2] / 2).toBeCloseTo(180);
        expect(after[1] + after[3] / 2).toBeCloseTo(0);
        expect(after[2]).toBeCloseTo(before[2]); // 拡大率は変わらない
      });

      it("見える範囲の中のノードを選んだときは、動かない", async () => {
        const user = userEvent.setup();
        const { container } = render(<App />);
        await addChildNamed(user, "a");
        const before = viewBox(container);

        await user.keyboard("{ArrowLeft}");

        expect(viewBox(container)).toEqual(before);
      });
    });

    it("ファイルを開くと、拡大率と表示位置は、元に戻る", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/map.json" });
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard("{Meta>}={/Meta}");
      expect(zoomState()).toBe("125%");

      await user.keyboard("{Meta>}o{/Meta}");
      await screen.findByText(/開きました/);

      expect(zoomState()).toBeUndefined();
      expect(viewBox(container)).toEqual([-450, -450, 900, 900]);
    });
  });

  describe("スタイルパネル: アイコン", () => {
    const CMD_K = "{Meta>}k{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";
    const panel = () => screen.getByRole("dialog", { name: "スタイル" });
    const iconGroup = () => within(panel()).getByRole("radiogroup", { name: "アイコン" });
    const iconRadio = (name: string) => within(iconGroup()).getByRole("radio", { name });
    const star = ICON_PRESETS[0];
    const idea = ICON_PRESETS[4];
    const icons = (container: HTMLElement) =>
      [...container.querySelectorAll("g[data-icon-for]")].map((e) => e.getAttribute("data-icon"));
    const iconOf = (container: HTMLElement, nodeText: string) => {
      const id = screen.getByText(nodeText).closest("g[data-node-id]")?.getAttribute("data-node-id");
      return container.querySelector(`g[data-icon-for="${id}"]`)?.getAttribute("data-icon");
    };

    /** 中心 ─ a / b を作り、b を選択した状態にする */
    async function buildTree(user: User) {
      await addChildNamed(user, "a");
      await addSiblingNamed(user, "b");
    }

    it("「なし」と、オリジナルのアイコンの選択肢が、絵つきで選べ、初期状態では「なし」が選ばれている", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard(CMD_K);

      const names = within(iconGroup())
        .getAllByRole("radio")
        .map((r) => r.getAttribute("aria-label"));

      expect(names).toEqual(["なし", ...ICON_PRESETS.map((p) => p.name)]);
      expect(iconRadio("なし")).toBeChecked();
      // 選択肢には、それぞれ、アイコンの絵が付いている（「なし」を除く）
      expect(iconGroup().querySelectorAll("svg")).toHaveLength(ICON_PRESETS.length + 1);
      expect(iconGroup().querySelectorAll("svg path").length).toBeGreaterThan(ICON_PRESETS.length);
    });

    it("アイコンを選ぶと、選択ノードにだけ表示され、「なし」で外れる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);

      await user.click(iconRadio(star.name));
      expect(iconOf(container, "b")).toBe(star.value);
      expect(iconOf(container, "a")).toBeUndefined();
      expect(iconRadio(star.name)).toBeChecked();

      await user.click(iconRadio("なし"));
      expect(icons(container)).toEqual([]);
    });

    it("中心ノードにも付けられる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard(CMD_K);

      await user.click(iconRadio(idea.name));

      expect(iconOf(container, "中心テーマ")).toBe(idea.value);
    });

    it("パネルは、選択しているノードのアイコンを表示し、別のノードを選ぶと切り替わる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      await user.click(iconRadio(star.name));

      await user.click(screen.getByText("a"));
      expect(iconRadio("なし")).toBeChecked();

      await user.click(screen.getByText("b"));
      expect(iconRadio(star.name)).toBeChecked();
    });

    it("アイコンの変更は1手の履歴で、同じアイコンを選び直しても、増えない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      await user.click(iconRadio(star.name));
      await user.click(iconRadio(star.name));
      await user.click(iconRadio(idea.name));
      await user.keyboard("{Escape}");

      await user.keyboard(CMD_Z);
      expect(iconOf(container, "b")).toBe(star.value);

      await user.keyboard(CMD_Z);
      expect(icons(container)).toEqual([]);
      expect(screen.getByText("b")).toBeInTheDocument(); // b の追加は、まだ戻っていない
    });

    it("アイコンは、保存されるファイルの内容に含まれ、開いたファイルでも表示される", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      await user.click(iconRadio(star.name));
      await user.keyboard("{Escape}");
      await user.keyboard("{Meta>}s{/Meta}");
      await screen.findByRole("status");
      const [saved] = mockedSaveFile.mock.calls[0];
      expect(Object.values(saved.nodes).find((n) => n.text === "b")?.icon).toBe(star.value);

      const base = loadedMap();
      mockedLoadFile.mockResolvedValue({
        map: setNodeIcon(base, base.rootId, idea.value),
        path: "/Users/me/other.json",
      });
      await user.keyboard("{Meta>}o{/Meta}");
      await screen.findByText(/開きました/);

      expect(iconOf(container, "読込")).toBe(idea.value);
    });

    it("コピー＆ペーストで、アイコンも引き継がれる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      await user.click(iconRadio(star.name));
      await user.keyboard("{Escape}");
      await user.keyboard("{Meta>}c{/Meta}");
      await user.keyboard("{ArrowUp}");
      await user.keyboard("{Meta>}v{/Meta}");

      await waitFor(() => expect(icons(container)).toEqual([star.value, star.value]));
    });

    it("折りたたまれて見えないノードのアイコンは、描かれない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "親");
      await addChildNamed(user, "子");
      await user.keyboard(CMD_K);
      await user.click(iconRadio(star.name));
      await user.keyboard("{Escape}");
      await user.keyboard("{ArrowLeft}");
      expect(icons(container)).toEqual([star.value]);

      await user.keyboard(" ");

      expect(icons(container)).toEqual([]);
    });

    it("アイコンをクリックすると、そのノードが選択される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_K);
      await user.click(iconRadio(star.name));
      await user.keyboard("{Escape}");
      await user.click(screen.getByText("a"));

      await user.click(container.querySelector("g[data-icon-for]")!);

      expect(selectedText(container)).toBe("b");
    });
  });

  describe("スタイルパネル: 画像の大きさ", () => {
    const PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
    const CMD_K = "{Meta>}k{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";
    const panel = () => screen.getByRole("dialog", { name: "スタイル" });
    const scaleSelect = () => within(panel()).getByRole("combobox", { name: "画像の大きさ" });
    const imageWidth = (container: HTMLElement) =>
      Number(container.querySelector("image")!.getAttribute("width"));

    /** 中心ノードに画像を付けて、スタイルパネルを開く（中心画像の幅は、標準で 160） */
    async function withCentralImage(user: User) {
      mockedPickImage.mockResolvedValue(PNG);
      const view = render(<App />);
      await user.keyboard("{Meta>}{Shift>}i{/Shift}{/Meta}");
      await waitFor(() => expect(view.container.querySelectorAll("image")).toHaveLength(1));
      await user.keyboard(CMD_K);
      return view;
    }

    it("画像のないノードでは、選べない。画像があると、選べる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard(CMD_K);
      expect(scaleSelect()).toBeDisabled();

      mockedPickImage.mockResolvedValue(PNG);
      await user.click(within(panel()).getByRole("button", { name: "画像を選ぶ…" }));

      await waitFor(() => expect(scaleSelect()).toBeEnabled());
    });

    it("選択肢は、「自動（100%）」と、50%・75%・150%・200%・300%", async () => {
      const user = userEvent.setup();
      await withCentralImage(user);

      const options = within(scaleSelect())
        .getAllByRole("option")
        .map((o) => o.textContent);

      expect(options).toEqual(["自動（100%）", "50%", "75%", "150%", "200%", "300%"]);
      expect(scaleSelect()).toHaveDisplayValue("自動（100%）");
    });

    it("倍率を選ぶと、画像の大きさが変わり、「自動」で標準に戻る", async () => {
      const user = userEvent.setup();
      const { container } = await withCentralImage(user);
      expect(imageWidth(container)).toBe(160);

      await user.selectOptions(scaleSelect(), "200%");
      expect(imageWidth(container)).toBe(320);
      expect(scaleSelect()).toHaveDisplayValue("200%");

      await user.selectOptions(scaleSelect(), "50%");
      expect(imageWidth(container)).toBe(80);

      await user.selectOptions(scaleSelect(), "自動（100%）");
      expect(imageWidth(container)).toBe(160);
    });

    it("倍率の変更は1手の履歴で、同じ倍率を選び直しても、増えない", async () => {
      const user = userEvent.setup();
      const { container } = await withCentralImage(user);
      await user.selectOptions(scaleSelect(), "200%");
      await user.selectOptions(scaleSelect(), "200%");
      await user.keyboard("{Escape}");

      await user.keyboard(CMD_Z);
      expect(imageWidth(container)).toBe(160);
      expect(container.querySelectorAll("image")).toHaveLength(1); // 画像の設定は、まだ戻っていない
    });

    it("倍率は保存されるファイルに含まれ、候補にない倍率のファイルでも、表示できる", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      const user = userEvent.setup();
      const { container } = await withCentralImage(user);
      await user.selectOptions(scaleSelect(), "150%");
      await user.keyboard("{Escape}");
      await user.keyboard("{Meta>}s{/Meta}");
      await screen.findByRole("status");
      const [saved] = mockedSaveFile.mock.calls[0];
      expect(Object.values(saved.nodes)[0].style).toEqual({ imageScale: 1.5 });

      const base = loadedMap();
      mockedLoadFile.mockResolvedValue({
        map: setNodeStyle(setNodeImage(base, base.rootId, PNG), base.rootId, { imageScale: 1.2 }),
        path: "/Users/me/other.json",
      });
      await user.keyboard("{Meta>}o{/Meta}");
      await screen.findByText(/開きました/);
      await user.keyboard(CMD_K);

      expect(imageWidth(container)).toBeCloseTo(192);
      expect(scaleSelect()).toHaveDisplayValue("120%");
    });

    it("メインブランチなどの画像の大きさも、変えられる", async () => {
      mockedPickImage.mockResolvedValue(PNG);
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard("{Meta>}{Shift>}i{/Shift}{/Meta}");
      await waitFor(() => expect(container.querySelectorAll("image")).toHaveLength(1));
      expect(imageWidth(container)).toBe(64);
      await user.keyboard(CMD_K);

      await user.selectOptions(scaleSelect(), "300%");

      expect(imageWidth(container)).toBe(192);
    });
  });

  describe("Cmd+/: ショートカット一覧", () => {
    const CMD_SLASH = "{Meta>}/{/Meta}";
    const help = () => screen.getByRole("dialog", { name: "ショートカット一覧" });

    it("Cmd+/ で、ショートカット一覧が開き、フォーカスが中に移る。もう一度で閉じる", async () => {
      const user = userEvent.setup();
      render(<App />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.keyboard(CMD_SLASH);
      expect(help()).toBeInTheDocument();
      expect(help()).toContainElement(document.activeElement as HTMLElement);

      await user.keyboard(CMD_SLASH);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("すべてのグループの題名と、すべての項目（キーと説明）が表示される", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SLASH);

      for (const group of SHORTCUT_GROUPS) {
        expect(within(help()).getByRole("heading", { name: group.title })).toBeInTheDocument();
        for (const item of group.items) {
          expect(within(help()).getByText(item.description)).toBeInTheDocument();
        }
      }
      const total = SHORTCUT_GROUPS.reduce((sum, g) => sum + g.items.length, 0);
      expect(help().querySelectorAll("kbd")).toHaveLength(total);
    });

    it("Escape や、閉じるボタンでも閉じる", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SLASH);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.keyboard(CMD_SLASH);
      await user.click(within(help()).getByRole("button", { name: "閉じる" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("ブラウザ標準の動作を止める。Cmd+Shift+/（Cmd+?）でも開く。Ctrl との組み合わせや、テキスト編集中は開かない", async () => {
      const user = userEvent.setup();
      render(<App />);
      expect(fireEvent.keyDown(window, { key: "/", metaKey: true })).toBe(false);
      await user.keyboard(CMD_SLASH); // 開いているのを閉じる
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.keyboard("{Meta>}{Shift>}?{/Shift}{/Meta}");
      expect(help()).toBeInTheDocument();
      await user.keyboard("{Escape}");

      await user.keyboard("{Control>}/{/Control}");
      await user.keyboard("{F2}");
      await user.keyboard(CMD_SLASH);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("開いている間は、ノードの操作のショートカット（Tab・Delete など）は、効かない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await addChildNamed(user, "a");
      await user.keyboard(CMD_SLASH);

      await user.keyboard("{Delete}{Backspace}{ArrowLeft}");
      await user.keyboard("{Meta>}b{/Meta}");

      expect(container.querySelectorAll("g[data-node-id]")).toHaveLength(2);
      expect(screen.getByText("a").getAttribute("font-weight")).toBe("normal");
    });

    it("スタイルパネルとは、同時には開かない（片方を開くと、もう片方は閉じる）", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard("{Meta>}k{/Meta}");
      expect(screen.getByRole("dialog", { name: "スタイル" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await user.keyboard("{Meta>}k{/Meta}");
      fireEvent.keyDown(window, { key: "/", metaKey: true });
      expect(screen.queryByRole("dialog", { name: "スタイル" })).not.toBeInTheDocument();
      expect(help()).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(help).toThrow();
      expect(screen.getByRole("dialog", { name: "スタイル" })).toBeInTheDocument();
    });
  });

  describe("自動保存と復元", () => {
    const savedMap = () => {
      const base = createMindMap("前回のテーマ");
      return addChild(base, base.rootId, "前回の子").map;
    };
    const SAVED_AT = new Date(2026, 9, 14, 8, 5);

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** 偽のタイマーを、指定したミリ秒だけ進める */
    const advance = (ms: number) =>
      act(async () => {
        vi.advanceTimersByTime(ms);
      });

    describe("起動時の復元", () => {
      it("前回の自動保存がなければ、確認せずに、そのまま起動する", async () => {
        render(<App />);

        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalledTimes(1));

        expect(mockedConfirmRestore).not.toHaveBeenCalled();
        expect(screen.getByText("中心テーマ")).toBeInTheDocument();
      });

      it("自動保存があれば、時刻とファイルを示して確認し、「復元する」を選ぶと、前回の内容に置き換わる", async () => {
        mockedReadAutosave.mockResolvedValue({
          map: savedMap(),
          filePath: "/Users/me/map.json",
          savedAt: SAVED_AT,
        });
        const { container } = render(<App />);

        expect(await screen.findByText("前回の子")).toBeInTheDocument();

        expect(mockedConfirmRestore).toHaveBeenCalledWith(SAVED_AT, "/Users/me/map.json");
        expect(screen.getByText("前回のテーマ")).toBeInTheDocument();
        expect(container.querySelectorAll("g[data-node-id]")).toHaveLength(2);
        expect(await screen.findByRole("status")).toHaveTextContent("前回の編集内容を復元しました");
        expect(document.querySelector(".doc-state")?.textContent).toBe("map.json ● 未保存");
      });

      it("復元した内容は、未保存の変更として扱われる（保存で、変更なしになる）", async () => {
        mockedReadAutosave.mockResolvedValue({ map: savedMap(), filePath: undefined, savedAt: SAVED_AT });
        mockedSaveFile.mockResolvedValue("/Users/me/restored.json");
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await screen.findByText("前回の子");
        expect(document.querySelector(".doc-state")?.textContent).toBe("無題 ● 未保存");

        await user.keyboard("{Meta>}s{/Meta}");
        await screen.findByText(/保存しました/);

        expect(document.querySelector(".doc-state")?.textContent).toBe("restored.json");
      });

      it("「破棄する」を選ぶと、自動保存を削除して、通常どおり起動する", async () => {
        mockedReadAutosave.mockResolvedValue({ map: savedMap(), filePath: undefined, savedAt: SAVED_AT });
        mockedConfirmRestore.mockResolvedValue(false);
        render(<App />);

        await waitFor(() => expect(mockedClearAutosave).toHaveBeenCalledTimes(1));

        expect(screen.getByText("中心テーマ")).toBeInTheDocument();
        expect(screen.queryByText("前回の子")).not.toBeInTheDocument();
      });

      it("自動保存を読み込めない（ブラウザなど）ときや、確認が失敗したときは、エラーにせず、そのまま起動する", async () => {
        mockedReadAutosave.mockRejectedValueOnce(new Error("自動保存を読み込めません: x"));
        const first = render(<App />);
        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByText("中心テーマ")).toBeInTheDocument();
        first.unmount();

        mockedReadAutosave.mockResolvedValue({ map: savedMap(), filePath: undefined, savedAt: SAVED_AT });
        mockedConfirmRestore.mockRejectedValueOnce(new Error("ダイアログを開けません"));
        render(<App />);
        await waitFor(() => expect(mockedConfirmRestore).toHaveBeenCalledTimes(1));

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByText("中心テーマ")).toBeInTheDocument();
        expect(mockedClearAutosave).not.toHaveBeenCalled();
      });

      it("「破棄する」を選んだあと、削除に失敗しても、エラーにせず、起動して自動保存も使える", async () => {
        mockedReadAutosave.mockResolvedValue({ map: savedMap(), filePath: undefined, savedAt: SAVED_AT });
        mockedConfirmRestore.mockResolvedValue(false);
        mockedClearAutosave.mockRejectedValue(new Error("自動保存を削除できません: x"));
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await waitFor(() => expect(mockedClearAutosave).toHaveBeenCalledTimes(1));
        await addChildNamed(user, "追加");

        await advance(2100);

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(mockedWriteAutosave).toHaveBeenCalledTimes(1);
      });

      it("自動保存を読み込んでいる途中で、画面が閉じられたら、確認を出さない", async () => {
        let finish: (value: null | { map: MindMap; filePath: undefined; savedAt: Date }) => void = () => {};
        mockedReadAutosave.mockReturnValue(new Promise((resolve) => (finish = resolve)));
        const { unmount } = render(<App />);
        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalled());
        unmount();

        await act(async () => finish({ map: savedMap(), filePath: undefined, savedAt: SAVED_AT }));

        expect(mockedConfirmRestore).not.toHaveBeenCalled();
      });

      it("確認が失敗したときは、この回は自動保存せず、残っている内容も上書きしない", async () => {
        mockedReadAutosave.mockResolvedValue({ map: savedMap(), filePath: undefined, savedAt: SAVED_AT });
        mockedConfirmRestore.mockRejectedValue(new Error("ダイアログを開けません"));
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await waitFor(() => expect(mockedConfirmRestore).toHaveBeenCalled());
        await addChildNamed(user, "追加");

        await advance(5000);

        expect(mockedWriteAutosave).not.toHaveBeenCalled();
        expect(mockedClearAutosave).not.toHaveBeenCalled();
      });

      it("復元の確認が終わる前に、自動保存の削除や上書きを、しない", async () => {
        let answer: (restore: boolean) => void = () => {};
        mockedReadAutosave.mockResolvedValue({ map: savedMap(), filePath: undefined, savedAt: SAVED_AT });
        mockedConfirmRestore.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));
        render(<App />);
        await waitFor(() => expect(mockedConfirmRestore).toHaveBeenCalled());

        await advance(5000);

        expect(mockedClearAutosave).not.toHaveBeenCalled();
        expect(mockedWriteAutosave).not.toHaveBeenCalled();
        await act(async () => answer(true));
        await screen.findByText("前回の子");
      });
    });

    describe("自動保存", () => {
      it("変更がなければ、自動保存しない（削除もしない）", async () => {
        render(<App />);
        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalled());

        await advance(10_000);

        expect(mockedWriteAutosave).not.toHaveBeenCalled();
        expect(mockedClearAutosave).not.toHaveBeenCalled();
      });

      it("変更してから、少し（2秒）待つと、現在のマップを自動保存する", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalled());
        await addChildNamed(user, "企画");

        await advance(1900);
        expect(mockedWriteAutosave).not.toHaveBeenCalled();
        await advance(200);

        expect(mockedWriteAutosave).toHaveBeenCalledTimes(1);
        const [map, filePath] = mockedWriteAutosave.mock.calls[0];
        expect(Object.values(map.nodes).map((n) => n.text)).toEqual(["中心テーマ", "企画"]);
        expect(filePath).toBeUndefined();
      });

      it("続けて変更している間は、書き込みを待ち、最後の変更から2秒後に、1回だけ書き込む", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalled());
        await addChildNamed(user, "a");
        await advance(1500);
        await addSiblingNamed(user, "b");
        await advance(1500);
        expect(mockedWriteAutosave).not.toHaveBeenCalled();

        await advance(600);

        expect(mockedWriteAutosave).toHaveBeenCalledTimes(1);
        const [map] = mockedWriteAutosave.mock.calls[0];
        expect(Object.values(map.nodes).map((n) => n.text)).toEqual(["中心テーマ", "a", "b"]);
      });

      it("編集していたファイルのパスも、一緒に自動保存する", async () => {
        mockedSaveFile.mockResolvedValue("/Users/me/map.json");
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalled());
        await user.keyboard("{Meta>}s{/Meta}");
        await screen.findByText(/保存しました/);
        await addChildNamed(user, "追加");

        await advance(2100);

        expect(mockedWriteAutosave.mock.calls[0][1]).toBe("/Users/me/map.json");
      });

      it("書き込みに失敗しても、エラーは表示せず、編集は続けられる", async () => {
        mockedWriteAutosave.mockRejectedValue(new Error("自動保存に失敗しました: x"));
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const { container } = render(<App />);
        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalled());
        await addChildNamed(user, "企画");

        await advance(2100);

        expect(mockedWriteAutosave).toHaveBeenCalled();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(container.querySelectorAll("g[data-node-id]")).toHaveLength(2);
      });
    });

    describe("自動保存の削除（変更なしになったとき）", () => {
      /** 自動保存まで済んだ状態にする */
      async function withWrittenAutosave(user: ReturnType<typeof userEvent.setup>) {
        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalled());
        await addChildNamed(user, "企画");
        await advance(2100);
        expect(mockedWriteAutosave).toHaveBeenCalledTimes(1);
      }

      it("保存すると、自動保存を削除する", async () => {
        mockedSaveFile.mockResolvedValue("/Users/me/map.json");
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await withWrittenAutosave(user);

        await user.keyboard("{Meta>}s{/Meta}");

        await waitFor(() => expect(mockedClearAutosave).toHaveBeenCalledTimes(1));
      });

      it("自動保存の前に保存した場合は、待っていた書き込みを取りやめる（削除もしない）", async () => {
        mockedSaveFile.mockResolvedValue("/Users/me/map.json");
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await waitFor(() => expect(mockedReadAutosave).toHaveBeenCalled());
        await addChildNamed(user, "企画");
        await user.keyboard("{Meta>}s{/Meta}");
        await screen.findByText(/保存しました/);

        await advance(5000);

        expect(mockedWriteAutosave).not.toHaveBeenCalled();
        expect(mockedClearAutosave).not.toHaveBeenCalled();
      });

      it("元に戻して、保存したときと同じ状態になったときも、削除する", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await withWrittenAutosave(user);

        await user.keyboard("{Meta>}z{/Meta}");

        await waitFor(() => expect(mockedClearAutosave).toHaveBeenCalledTimes(1));
      });

      it("ファイルを開いたときも、削除する", async () => {
        mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/other.json" });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await withWrittenAutosave(user);

        await user.keyboard("{Meta>}o{/Meta}");

        await waitFor(() => expect(mockedClearAutosave).toHaveBeenCalledTimes(1));
      });

      it("削除に失敗しても、エラーは表示しない", async () => {
        mockedClearAutosave.mockRejectedValue(new Error("自動保存を削除できません: x"));
        mockedSaveFile.mockResolvedValue("/Users/me/map.json");
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await withWrittenAutosave(user);

        await user.keyboard("{Meta>}s{/Meta}");
        await screen.findByText(/保存しました/);

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });

      it("ウィンドウを閉じるとき、変更を破棄して閉じることを選んだら、自動保存を削除する", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<App />);
        await withWrittenAutosave(user);
        const confirmClose = mockedRegisterCloseGuard.mock.calls[0][1];

        mockedConfirmDiscard.mockResolvedValueOnce(false);
        expect(await confirmClose()).toBe(false);
        expect(mockedClearAutosave).not.toHaveBeenCalled(); // キャンセルなら、残す

        mockedConfirmDiscard.mockResolvedValueOnce(true);
        expect(await confirmClose()).toBe(true);
        expect(mockedClearAutosave).toHaveBeenCalledTimes(1);
      });

      it("閉じるときの削除に失敗しても、閉じる操作は進める", async () => {
        mockedClearAutosave.mockRejectedValue(new Error("自動保存を削除できません: x"));
        render(<App />);
        await waitFor(() => expect(mockedRegisterCloseGuard).toHaveBeenCalled());

        expect(await mockedRegisterCloseGuard.mock.calls[0][1]()).toBe(true);
      });
    });
  });

  describe("Cmd+F: ノードの検索", () => {
    const CMD_F = "{Meta>}f{/Meta}";
    const CMD_Z = "{Meta>}z{/Meta}";
    const bar = () => screen.getByRole("search", { name: "検索" });
    const field = () => within(bar()).getByRole("searchbox", { name: "検索" }) as HTMLInputElement;
    const count = () => bar().querySelector("[data-role='search-count']")?.textContent;
    const matches = (container: HTMLElement) =>
      [...container.querySelectorAll("g[data-search-match]")].map((g) => g.textContent);
    const currentMatch = (container: HTMLElement) =>
      container.querySelector("g[data-search-current]")?.textContent;

    /** 中心 ─ Apple(apple pie) / Berry / Banana を作る（最後の Banana を選択） */
    async function buildTree(user: User) {
      await addChildNamed(user, "Apple");
      await addChildNamed(user, "apple pie");
      await user.keyboard("{ArrowLeft}");
      await addSiblingNamed(user, "Berry");
      await addSiblingNamed(user, "Banana");
    }

    it("Cmd+F で、検索バーが開き、入力欄にフォーカスが移る。Escape で閉じる", async () => {
      const user = userEvent.setup();
      render(<App />);
      expect(screen.queryByRole("search")).not.toBeInTheDocument();

      await user.keyboard(CMD_F);
      expect(field()).toHaveFocus();

      await user.keyboard("{Escape}");
      expect(screen.queryByRole("search")).not.toBeInTheDocument();
    });

    it("検索語を入力すると、一致するノードが強調され、件数が表示され、最初の一致が選択される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user); // Banana を選択中
      await user.keyboard(CMD_F);

      await user.type(field(), "apple");

      expect(count()).toBe("2 件中 1 件目");
      expect(matches(container)).toEqual(["Apple", "apple pie"]);
      expect(currentMatch(container)).toBe("Apple");
      expect(selectedText(container)).toBe("Apple");
    });

    it("入力したとき、今選んでいるノードより後ろの、最初の一致から始まる（なければ、先頭に戻る）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.click(screen.getByText("Apple")); // 選択を、先頭の方へ
      await user.keyboard(CMD_F);

      await user.type(field(), "b");

      expect(selectedText(container)).toBe("Berry"); // Apple より後ろの、最初の一致
      expect(count()).toBe("2 件中 1 件目");
    });

    it("Enter で次の一致へ、Shift+Enter で前の一致へ移動し、端では、反対側へ回り込む", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_F);
      await user.type(field(), "apple");
      expect(selectedText(container)).toBe("Apple");

      await user.keyboard("{Enter}");
      expect(selectedText(container)).toBe("apple pie");
      expect(count()).toBe("2 件中 2 件目");

      await user.keyboard("{Enter}");
      expect(selectedText(container)).toBe("Apple");

      await user.keyboard("{Shift>}{Enter}{/Shift}");
      expect(selectedText(container)).toBe("apple pie");
      expect(currentMatch(container)).toBe("apple pie");
    });

    it("「前へ」「次へ」ボタンでも移動できる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_F);
      await user.type(field(), "apple");

      await user.click(within(bar()).getByRole("button", { name: "次へ" }));
      expect(selectedText(container)).toBe("apple pie");

      await user.click(within(bar()).getByRole("button", { name: "前へ" }));
      expect(selectedText(container)).toBe("Apple");
    });

    it("大文字小文字は区別せず、部分一致する。中心ノードも検索できる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_F);

      await user.type(field(), "BERR");
      expect(selectedText(container)).toBe("Berry");

      await user.clear(field());
      await user.type(field(), "中心");
      expect(selectedText(container)).toBe("中心テーマ");
    });

    it("一致するものがなければ「該当なし」と表示し、選択は変えない。空にすると、表示が消える", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_F);

      await user.type(field(), "zzz");
      expect(count()).toBe("該当なし");
      expect(matches(container)).toEqual([]);
      expect(selectedText(container)).toBe("Banana");

      await user.keyboard("{Enter}"); // 一致がなくても、エラーにならない
      expect(selectedText(container)).toBe("Banana");

      await user.clear(field());
      expect(count()).toBe("");
    });

    it("折りたたまれた枝の中の一致は、祖先を展開して見せ、1手の履歴になる（元に戻すと、再び折りたたまれる）", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.click(screen.getByText("Apple"));
      await user.keyboard(" "); // Apple を折りたたむ
      expect(screen.queryByText("apple pie")).not.toBeInTheDocument();
      await user.keyboard(CMD_F);

      await user.type(field(), "pie");

      expect(screen.getByText("apple pie")).toBeInTheDocument();
      expect(selectedText(container)).toBe("apple pie");
      expect(count()).toBe("1 件中 1 件目");

      await user.keyboard("{Escape}");
      await user.keyboard(CMD_Z);
      expect(screen.queryByText("apple pie")).not.toBeInTheDocument();
    });

    it("Escape で閉じても、選択は、見つけたノードのまま。強調は消え、通常のキー操作に戻る", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_F);
      await user.type(field(), "berry");

      await user.keyboard("{Escape}");

      expect(selectedText(container)).toBe("Berry");
      expect(matches(container)).toEqual([]);
      await addChildNamed(user, "子");
      expect(selectedText(container)).toBe("子");
    });

    it("入力欄の中のキー（Delete・矢印・Tab など）は、ノードの操作にならない", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await buildTree(user);
      await user.keyboard(CMD_F);
      await user.type(field(), "apple");

      await user.keyboard("{Delete}{ArrowLeft}{ArrowLeft}{Backspace}x");

      expect(container.querySelectorAll("g[data-node-id]")).toHaveLength(5);
    });

    it("開いたまま、フォーカスが外れていても、Cmd+F で入力欄に戻れる（検索語は残る）", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard(CMD_F);
      await user.type(field(), "abc");
      await user.click(screen.getByRole("application"));
      expect(field()).not.toHaveFocus();

      await user.keyboard(CMD_F);

      expect(field()).toHaveFocus();
      expect(field()).toHaveValue("abc");
    });

    it("入力欄にフォーカスがあるときの Cmd+F は、検索語を全選択する（Ctrl や Shift 付きでは、何もしない）", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard(CMD_F);
      await user.type(field(), "abcdef");
      field().setSelectionRange(2, 2);

      // （user-event は、修飾キー付きでも文字を入力してしまうので、キーイベントを直接送る）
      fireEvent.keyDown(field(), { key: "f", ctrlKey: true });
      fireEvent.keyDown(field(), { key: "f", metaKey: true, shiftKey: true });
      fireEvent.keyDown(field(), { key: "f", metaKey: true, altKey: true });
      expect(field().selectionStart).toBe(2);

      expect(fireEvent.keyDown(field(), { key: "f", metaKey: true })).toBe(false);
      expect(field().selectionStart).toBe(0);
      expect(field().selectionEnd).toBe(6);
      expect(field()).toHaveValue("abcdef");
    });

    it("ブラウザ標準の動作を止める。Ctrl+F・Cmd+Shift+F・テキスト編集中は、開かない", async () => {
      const user = userEvent.setup();
      render(<App />);
      expect(fireEvent.keyDown(window, { key: "f", metaKey: true })).toBe(false);
      await user.keyboard("{Escape}");

      await user.keyboard("{Control>}f{/Control}");
      await user.keyboard("{Meta>}{Shift>}f{/Shift}{/Meta}");
      await user.keyboard("{F2}");
      await user.keyboard(CMD_F);

      expect(screen.queryByRole("search")).not.toBeInTheDocument();
    });

    it("スタイルパネル・ショートカット一覧とは、同時には開かない", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_F);
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(screen.queryByRole("search")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "スタイル" })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "f", metaKey: true });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("search")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "/", metaKey: true });
      expect(screen.queryByRole("search")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "ショートカット一覧" })).toBeInTheDocument();
    });

    it("閉じるボタンでも閉じる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard(CMD_F);

      await user.click(within(bar()).getByRole("button", { name: "閉じる" }));

      expect(screen.queryByRole("search")).not.toBeInTheDocument();
    });
  });

  describe("長いラベルの折り返し", () => {
    const LONG = "あ".repeat(25);

    /** 中心の下に、長いラベルのブランチを1つ作る */
    async function withLongBranch(user: User) {
      const view = render(<App />);
      await user.keyboard("{Tab}");
      await user.keyboard(LONG + "{Enter}");
      return view;
    }
    const textOf = (container: HTMLElement) =>
      container.querySelector('g[data-node-id][data-selected="true"] text') as SVGTextElement;

    it("短いラベルは、tspan を使わず、1行のまま", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard("{Tab}短い{Enter}");

      expect(textOf(container).querySelector("tspan")).toBeNull();
    });

    it("長いラベルは、行ごとの tspan に折り返して表示する", async () => {
      const { container } = await withLongBranch(userEvent.setup());

      const lines = [...textOf(container).querySelectorAll("tspan")].map((t) => t.textContent);
      expect(lines).toEqual(["あ".repeat(10), "あ".repeat(10), "あ".repeat(5)]);
    });

    it("クリックできる範囲は、折り返したラベル全体を覆う", async () => {
      const { container } = await withLongBranch(userEvent.setup());
      const hit = container.querySelector(
        'g[data-node-id][data-selected="true"] rect[data-role="hit-area"]',
      ) as SVGRectElement;

      expect(Number(hit.getAttribute("height"))).toBeCloseTo(3 * 20 * 1.25 + 20);
      expect(Number(hit.getAttribute("width"))).toBeCloseTo(10 * 20 + 24);
    });
  });

  describe("Shift + Enter: ラベルの手動の改行", () => {
    const area = () => screen.getByRole("textbox", { name: "ノードのテキスト" }) as HTMLTextAreaElement;
    const selectedLines = (container: HTMLElement) =>
      [...container.querySelectorAll('g[data-node-id][data-selected="true"] text tspan')].map(
        (t) => t.textContent,
      );

    it("Shift + Enter で、編集を続けたまま、改行が入る", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}企画{Shift>}{Enter}{/Shift}予算");

      expect(area().value).toBe("企画\n予算");
    });

    it("Enter で確定すると、改行を含むラベルになり、行ごとに表示される", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard("{Tab}企画{Shift>}{Enter}{/Shift}予算{Enter}");

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(selectedLines(container)).toEqual(["企画", "予算"]);
    });

    it("既存の改行入りのラベルを編集し直しても、改行は保たれる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}企画{Shift>}{Enter}{/Shift}予算{Enter}{F2}");

      expect(area().value).toBe("企画\n予算");
    });

    it("Escape で、改行を含む編集を取り消せる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard("{Tab}企画{Enter}{F2}{Shift>}{Enter}{/Shift}予算{Escape}");

      expect(selectedLines(container)).toEqual([]);
      expect(selectedText(container)).toBe("企画");
    });

    it("入力欄は、行数に合わせて高くなる", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}あ");
      const height = () => Number(area().parentElement!.getAttribute("height"));
      const one = height();

      await user.keyboard("{Shift>}{Enter}{/Shift}い{Shift>}{Enter}{/Shift}う");

      expect(height()).toBeGreaterThan(one);
    });
  });

  describe("日本語入力（IME）の変換中のキー", () => {
    const area = () => screen.getByRole("textbox", { name: "ノードのテキスト" }) as HTMLTextAreaElement;

    async function startEditing(user: User) {
      const view = render(<App />);
      await user.keyboard("{Tab}きかく");
      return view;
    }

    it("変換中の Enter は、変換の確定だけで、ノードは確定しない。次の Enter で確定する", async () => {
      const user = userEvent.setup();
      const { container } = await startEditing(user);

      fireEvent.keyDown(area(), { key: "Enter", isComposing: true });
      expect(area()).toBeInTheDocument();

      await user.keyboard("{Enter}");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(selectedText(container)).toBe("きかく");
    });

    it("変換の確定直後の Enter（keyCode 229）も、ノードは確定しない", async () => {
      const user = userEvent.setup();
      await startEditing(user);

      fireEvent.keyDown(area(), { key: "Enter", keyCode: 229 });

      expect(area()).toBeInTheDocument();
    });

    it("変換中の Escape は、変換の取り消しだけで、編集は取り消さない", async () => {
      const user = userEvent.setup();
      await startEditing(user);

      fireEvent.keyDown(area(), { key: "Escape", isComposing: true });

      expect(area()).toBeInTheDocument();
    });

    it("変換中の Shift + Enter も、ノードは確定しない（変換の確定だけ）", async () => {
      const user = userEvent.setup();
      await startEditing(user);

      fireEvent.keyDown(area(), { key: "Enter", shiftKey: true, isComposing: true });

      expect(area()).toBeInTheDocument();
    });

    it("変換中のキーは、ノード操作のショートカットに渡さない", async () => {
      const user = userEvent.setup();
      const { container } = await startEditing(user);
      const before = nodes(container).length;

      fireEvent.keyDown(area(), { key: "Tab", isComposing: true });

      expect(nodes(container).length).toBe(before);
    });
  });

  describe("保存後の状態（キー操作が、古い状態を見ない）", () => {
    it("同じファイルに上書き保存した直後は、Cmd+O で、破棄の確認を出さない", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/a.ideatree");
      mockedLoadFile.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}x{Enter}");
      fireEvent.keyDown(window, { key: "s", metaKey: true }); // 1回目: 保存先が決まる
      await waitFor(() => expect(mockedSaveFile).toHaveBeenCalledTimes(1));
      await user.keyboard("{Tab}y{Enter}");
      fireEvent.keyDown(window, { key: "s", metaKey: true }); // 2回目: 同じパスへ上書き
      await waitFor(() => expect(mockedSaveFile).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(document.querySelector(".doc-state")?.textContent).toBe("a.ideatree"));

      fireEvent.keyDown(window, { key: "o", metaKey: true });

      await waitFor(() => expect(mockedLoadFile).toHaveBeenCalledTimes(1));
      expect(mockedConfirmDiscard).not.toHaveBeenCalled();
    });

    it("上書き保存のあとで、さらに編集すると、Cmd+O で、破棄の確認を出す", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/a.ideatree");
      mockedLoadFile.mockResolvedValue(null);
      mockedConfirmDiscard.mockResolvedValue(false);
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}x{Enter}");
      fireEvent.keyDown(window, { key: "s", metaKey: true });
      await waitFor(() => expect(mockedSaveFile).toHaveBeenCalledTimes(1));
      await user.keyboard("{Tab}y{Enter}");

      fireEvent.keyDown(window, { key: "o", metaKey: true });

      await waitFor(() => expect(mockedConfirmDiscard).toHaveBeenCalledTimes(1));
      expect(mockedLoadFile).not.toHaveBeenCalled();
    });
  });

  describe("アクセシビリティ（ノードの役割・名前・選択状態）", () => {
    it("各ノードは、treeitem として、ラベルを名前に持ち、選択状態を伝える", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}企画{Enter}");

      const items = screen.getAllByRole("treeitem");
      expect(items.map((item) => item.getAttribute("aria-label"))).toEqual(["中心テーマ", "企画"]);
      expect(items.map((item) => item.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    });

    it("折りたたまれたノードは、折りたたまれていることを伝える", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}企画{Enter}{Tab}子{Enter}{ArrowLeft}{ }");

      const item = screen.getByRole("treeitem", { name: /企画/ });
      expect(item.getAttribute("aria-expanded")).toBe("false");
    });

    it("子を持つ、展開されたノードは、展開されていることを伝える。子のないノードは、何も伝えない", async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}企画{Enter}");

      expect(screen.getByRole("treeitem", { name: "中心テーマ" }).getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByRole("treeitem", { name: "企画" }).hasAttribute("aria-expanded")).toBe(false);
    });
  });

  describe("Cmd+Shift+0: 全体表示", () => {
    const viewBox = (container: HTMLElement) =>
      container.querySelector("svg.mindmap")!.getAttribute("viewBox")!.split(" ").map(Number);

    /** 右へ、子を深く 5 段つなげる（右側に、大きく偏ったマップ） */
    async function deepRight(user: User) {
      const view = render(<App />);
      await user.keyboard("{Tab}a{Enter}{Tab}b{Enter}{Tab}c{Enter}{Tab}d{Enter}{Tab}e{Enter}");
      return view;
    }

    it("マップの全体が見えるよう、表示の中心を、マップの中心に動かす", async () => {
      const user = userEvent.setup();
      const { container } = await deepRight(user);
      fireEvent.keyDown(window, { key: "0", metaKey: true }); // 100% に戻して、中心を原点にする
      const before = viewBox(container);

      fireEvent.keyDown(window, { key: ")", metaKey: true, shiftKey: true });

      const after = viewBox(container);
      expect(after[0] + after[2] / 2).toBeGreaterThan(before[0] + before[2] / 2); // 右へ動いた
    });

    it("拡大したあとでも、全体表示で、収まる大きさに戻る", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      fireEvent.keyDown(window, { key: "=", metaKey: true });
      expect(viewBox(container)[2]).toBeLessThan(900);

      fireEvent.keyDown(window, { key: ")", metaKey: true, shiftKey: true });

      expect(viewBox(container)[2]).toBeGreaterThanOrEqual(900);
      void user;
    });
  });

  describe("アウトラインの取り込み（.md・.txt）", () => {
    const docState = () => document.querySelector(".doc-state")?.textContent;

    it("取り込んだ文書は、保存先のない、未保存の文書として開く（元のファイルを、上書きしない）", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/outline.md", imported: true });
      render(<App />);

      fireEvent.keyDown(window, { key: "o", metaKey: true });

      await waitFor(() => expect(docState()).toBe("無題 ● 未保存"));
      expect(screen.getByText(/取り込みました: \/Users\/me\/outline\.md/)).toBeInTheDocument();
    });

    it("取り込んだあとの Cmd+S は、保存先を尋ねる（保存先を、取り込み元にしない）", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/outline.md", imported: true });
      mockedSaveFile.mockResolvedValue("/Users/me/new.ideatree");
      render(<App />);
      fireEvent.keyDown(window, { key: "o", metaKey: true });
      await waitFor(() => expect(docState()).toBe("無題 ● 未保存"));

      fireEvent.keyDown(window, { key: "s", metaKey: true });

      await waitFor(() => expect(mockedSaveFile).toHaveBeenCalledTimes(1));
      expect(mockedSaveFile.mock.calls[0][1]).toBeUndefined();
      await waitFor(() => expect(docState()).toBe("new.ideatree"));
    });

    it("取り込む前に、未保存の変更があれば、確認する", async () => {
      mockedLoadFile.mockResolvedValue({ map: loadedMap(), path: "/Users/me/outline.md", imported: true });
      const user = userEvent.setup();
      render(<App />);
      await user.keyboard("{Tab}あ{Enter}");

      fireEvent.keyDown(window, { key: "o", metaKey: true });

      await waitFor(() => expect(mockedConfirmDiscard).toHaveBeenCalled());
    });
  });

  describe("Cmd+,: 設定（テーマ）", () => {
    const background = (container: HTMLElement) =>
      container.querySelector("svg.mindmap > rect")!.getAttribute("fill");
    const chooseTheme = async (user: User, name: string) => {
      fireEvent.keyDown(window, { key: ",", metaKey: true });
      await user.click(screen.getByRole("radio", { name }));
    };

    beforeEach(() => {
      localStorage.clear();
    });

    it("Cmd+, で設定を開き、もう一度で閉じる。他のパネルとは、同時に開かない", () => {
      render(<App />);

      fireEvent.keyDown(window, { key: ",", metaKey: true });
      expect(screen.getByRole("dialog", { name: "設定" })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(screen.queryByRole("dialog", { name: "設定" })).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: ",", metaKey: true });
      fireEvent.keyDown(screen.getByRole("dialog", { name: "設定" }), { key: ",", metaKey: true });
      expect(screen.queryByRole("dialog", { name: "設定" })).not.toBeInTheDocument();
    });

    it("ダークを選ぶと、背景と、中心ノードの文字が、ダークの配色になる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      expect(background(container)).toBe("#FFFFFF");

      await chooseTheme(user, "ダーク");

      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(background(container)).not.toBe("#FFFFFF");
      const rootText = container.querySelector("g[data-node-id] text") as SVGTextElement;
      expect(rootText.getAttribute("fill")).not.toBe("#333333");
    });

    it("ライトに戻すと、これまでの配色になる", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await chooseTheme(user, "ダーク");

      await user.click(screen.getByRole("radio", { name: "ライト" }));

      expect(background(container)).toBe("#FFFFFF");
      const rootText = container.querySelector("g[data-node-id] text") as SVGTextElement;
      expect(rootText.getAttribute("fill")).toBe("#333333");
    });

    it("書き出す SVG は、画面のテーマによらず、白い背景のまま", async () => {
      const user = userEvent.setup();
      mockedExportFile.mockResolvedValue(null);
      render(<App />);
      await chooseTheme(user, "ダーク");

      fireEvent.keyDown(window, { key: "e", metaKey: true, shiftKey: true });

      await waitFor(() => expect(mockedExportFile).toHaveBeenCalledTimes(1));
      const exported = mockedExportFile.mock.calls[0][0];
      expect(exportSvg(layout(exported))).toContain('data-role="background"');
      expect(exportSvg(layout(exported))).toContain('fill="#FFFFFF"');
    });
  });
});
