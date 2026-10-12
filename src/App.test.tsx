import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { BRANCH_COLORS } from "./domain/branchColor";
import { addChild } from "./domain/addChild";
import { createMindMap } from "./domain/mindmap";
import { loadFile } from "./files/loadFile";
import { saveFile } from "./files/saveFile";
import { svgExportFile } from "./files/svgExportFile";

vi.mock("./files/saveFile", () => ({ saveFile: vi.fn() }));
vi.mock("./files/loadFile", () => ({ loadFile: vi.fn() }));
vi.mock("./files/svgExportFile", () => ({ svgExportFile: vi.fn() }));

const mockedSaveFile = vi.mocked(saveFile);
const mockedLoadFile = vi.mocked(loadFile);
const mockedSvgExportFile = vi.mocked(svgExportFile);

/** 読み込み用のマップ（中心「読込」の下に「子A」「子B」） */
function loadedMap() {
  const base = createMindMap("読込");
  const a = addChild(base, base.rootId, "子A");
  return addChild(a.map, base.rootId, "子B").map;
}

beforeEach(() => {
  vi.resetAllMocks();
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

    it("入力欄からフォーカスが外れた状態でも、編集中はノード操作のショートカットは無効", async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await user.keyboard("{Tab}");

      await user.click(document.body);
      await user.keyboard("{Tab}");

      expect(nodes(container)).toHaveLength(2);
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

    it("ノードの削除を元に戻す（サブツリーごと復活し、直前に記録した時点の選択に戻る）", async () => {
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
      // 履歴は「記録した時点の状態」に戻る。矢印キーの移動は記録されないので、a1 の追加直後の選択
      expect(selectedText(container)).toBe("a1");
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
});
