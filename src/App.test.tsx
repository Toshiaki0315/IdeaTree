import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { BRANCH_COLORS } from "./domain/branchColor";
import { addChild } from "./domain/addChild";
import { parseClipboardText, subtreeToText } from "./domain/clipboardText";
import { copyNode } from "./domain/copyNode";
import { createMindMap } from "./domain/mindmap";
import { setNodeStyle } from "./domain/nodeStyle";
import { readClipboardText, writeClipboardText } from "./files/clipboard";
import { registerCloseGuard } from "./files/closeGuard";
import { confirmDiscard } from "./files/confirmDiscard";
import { loadFile } from "./files/loadFile";
import { saveFile } from "./files/saveFile";
import { svgExportFile } from "./files/svgExportFile";

vi.mock("./files/saveFile", () => ({ saveFile: vi.fn() }));
vi.mock("./files/loadFile", () => ({ loadFile: vi.fn() }));
vi.mock("./files/confirmDiscard", () => ({ confirmDiscard: vi.fn() }));
vi.mock("./files/closeGuard", () => ({ registerCloseGuard: vi.fn() }));
vi.mock("./files/clipboard", () => ({ readClipboardText: vi.fn(), writeClipboardText: vi.fn() }));
vi.mock("./files/svgExportFile", () => ({ svgExportFile: vi.fn() }));

const mockedSaveFile = vi.mocked(saveFile);
const mockedLoadFile = vi.mocked(loadFile);
const mockedConfirmDiscard = vi.mocked(confirmDiscard);
const mockedRegisterCloseGuard = vi.mocked(registerCloseGuard);
const unlistenCloseGuard = vi.fn();
const mockedReadClipboard = vi.mocked(readClipboardText);
const mockedWriteClipboard = vi.mocked(writeClipboardText);
const mockedSvgExportFile = vi.mocked(svgExportFile);

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

      expect(await screen.findByRole("status")).toHaveTextContent(
        "保存しました: /Users/me/map.json",
      );
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

      expect(await screen.findByRole("status")).toHaveTextContent(
        "開きました: /Users/me/map.json",
      );
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

  describe("Cmd+Shift+E: SVGエクスポート", () => {
    const CMD_SHIFT_E = "{Meta>}{Shift>}e{/Shift}{/Meta}";

    it("現在のマインドマップを svgExportFile に渡して書き出す", async () => {
      mockedSvgExportFile.mockResolvedValue("/Users/me/map.svg");
      const user = userEvent.setup();
      render(<App />);
      await addChildNamed(user, "企画");

      await user.keyboard(CMD_SHIFT_E);

      expect(mockedSvgExportFile).toHaveBeenCalledTimes(1);
      const [map] = mockedSvgExportFile.mock.calls[0];
      expect(Object.values(map.nodes).map((n) => n.text)).toEqual(["中心テーマ", "企画"]);
    });

    it("ブラウザ標準の動作を止める", async () => {
      mockedSvgExportFile.mockResolvedValue(null);
      render(<App />);

      const notPrevented = fireEvent.keyDown(window, { key: "E", metaKey: true, shiftKey: true });

      expect(notPrevented).toBe(false);
    });

    it("書き出しに成功したら、パスをステータスに表示する", async () => {
      mockedSvgExportFile.mockResolvedValue("/Users/me/map.svg");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_E);

      expect(await screen.findByRole("status")).toHaveTextContent(
        "書き出しました: /Users/me/map.svg",
      );
    });

    it("書き出しても、Cmd+S の保存先は変わらない", async () => {
      mockedSaveFile.mockResolvedValue("/Users/me/map.json");
      mockedSvgExportFile.mockResolvedValue("/Users/me/map.svg");
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
      mockedSvgExportFile.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_E);
      await waitFor(() => expect(mockedSvgExportFile).toHaveBeenCalledTimes(1));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("書き出しに失敗したら、エラーメッセージをアラートに表示する", async () => {
      mockedSvgExportFile.mockRejectedValue(new Error("書き出しに失敗しました: disk full"));
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_E);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "書き出しに失敗しました: disk full",
      );
    });

    it("Error 以外の値で失敗した場合も、その内容を表示する", async () => {
      mockedSvgExportFile.mockRejectedValue("boom");
      const user = userEvent.setup();
      render(<App />);

      await user.keyboard(CMD_SHIFT_E);

      expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    });

    it("書き出しに成功すると、前回のエラーメッセージは消える", async () => {
      mockedSvgExportFile
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

      expect(mockedSvgExportFile).not.toHaveBeenCalled();
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
      container
        .querySelector('g[data-node-id][data-selected="true"]')
        ?.getAttribute("data-node-id");
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
        const names = within(group).getAllByRole("radio").map((r) => r.getAttribute("aria-label"));

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
      mockedSvgExportFile.mockResolvedValue("/Users/me/map.svg");
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
      expect(mockedRegisterCloseGuard.mock.calls[0][1]).toBe(confirmDiscard);
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
    const order = (container: HTMLElement) =>
      [...nodes(container)].map((g) => g.textContent);

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
});
