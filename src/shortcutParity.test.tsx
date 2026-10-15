import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { SHORTCUT_GROUPS } from "./domain/shortcuts";
import { readAutosave } from "./files/autosave";
import { readClipboardText } from "./files/clipboard";
import { registerCloseGuard } from "./files/closeGuard";
import { confirmDiscard } from "./files/confirmDiscard";
import { exportFile } from "./files/exportFile";
import { loadFile } from "./files/loadFile";
import { onOpenFileRequest, takePendingOpenFiles } from "./files/openRequests";
import { pickImage } from "./files/pickImage";
import { readRecentFiles } from "./files/recent";
import { saveFile } from "./files/saveFile";

// このテストは、「ショートカット一覧（shortcuts.ts）に載っているキー」と、「実際に処理されるキー」が、
// 食い違っていないことを確かめる。キー処理を足したのに一覧に書き忘れる（または、その逆）と、失敗する。
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
vi.mock("./files/openLink", () => ({ openLink: vi.fn() }));
vi.mock("./files/recent", () => ({ readRecentFiles: vi.fn(), writeRecentFiles: vi.fn() }));
vi.mock("./files/openRequests", () => ({ takePendingOpenFiles: vi.fn(), onOpenFileRequest: vi.fn() }));

type Mods = { meta: boolean; shift: boolean; alt: boolean; ctrl: boolean };

/** キーの組み合わせの、比較用の文字列（例: "meta+shift+s"。英字は小文字） */
function combo(mods: Mods, key: string): string {
  const parts = [mods.ctrl && "ctrl", mods.meta && "meta", mods.alt && "alt", mods.shift && "shift"].filter(
    Boolean,
  );
  return [...parts, key.length === 1 ? key.toLowerCase() : key].join("+");
}

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
const KEY_NAMES: Record<string, string> = {
  "←": "ArrowLeft",
  "→": "ArrowRight",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  Space: " ",
};

/** 一覧の「キー」の欄（例: "Cmd + C / V / X"）を、キーの組み合わせにする。マウス操作（クリック・ドラッグ）は、含めない */
function parseShortcutKeys(keys: string): string[] {
  const combos: string[] = [];
  let inherited = "";
  for (const part of keys.split(" / ")) {
    const tokens = part.split(" + ");
    const keyToken = tokens[tokens.length - 1].trim();
    const mods: Mods = { meta: false, shift: false, alt: false, ctrl: false };
    for (const token of tokens.slice(0, -1)) {
      if (token === "Cmd") mods.meta = true;
      else if (token === "Shift") mods.shift = true;
      else if (token === "Option") mods.alt = true;
    }
    // 「Cmd + C / V / X」の V・X や、「Option + ↑ / ↓」の ↓ は、前の組み合わせの修飾キーを引き継ぐ
    const modifiers = tokens.length > 1 ? mods : parseInherited(inherited);
    if (tokens.length > 1)
      inherited = Object.entries(mods)
        .filter(([, on]) => on)
        .map(([name]) => name)
        .join(",");

    if (keyToken === "矢印キー") {
      combos.push(...ARROWS.map((arrow) => combo(modifiers, arrow)));
    } else if (/^[←→↑↓]( [←→↑↓])+$/.test(keyToken)) {
      combos.push(...keyToken.split(" ").map((arrow) => combo(modifiers, KEY_NAMES[arrow])));
    } else if (
      /[^\u0020-\u007E]/.test(keyToken.replace(/[←→↑↓]/g, "")) ||
      ["クリック", "ドラッグ"].includes(keyToken)
    ) {
      continue; // マウス操作
    } else {
      combos.push(combo(modifiers, KEY_NAMES[keyToken] ?? keyToken));
    }
  }
  return combos;
}

function parseInherited(names: string): Mods {
  const set = new Set(names.split(","));
  return { meta: set.has("meta"), shift: set.has("shift"), alt: set.has("alt"), ctrl: set.has("ctrl") };
}

/** 調べるキー（キーボードの、ほぼすべて） */
const CANDIDATE_KEYS = [
  ..."abcdefghijklmnopqrstuvwxyz0123456789",
  ..."`-=[]\\;',./",
  ...'~!@#$%^&*()_+{}|:"<>?',
  "Tab",
  "Enter",
  "Escape",
  " ",
  "Backspace",
  "Delete",
  "F2",
  ...ARROWS,
];
const MODIFIER_SETS: Mods[] = [
  { meta: false, shift: false, alt: false, ctrl: false },
  { meta: false, shift: true, alt: false, ctrl: false },
  { meta: true, shift: false, alt: false, ctrl: false },
  { meta: true, shift: true, alt: false, ctrl: false },
  { meta: false, shift: false, alt: true, ctrl: false },
  { meta: true, shift: false, alt: true, ctrl: false },
  { meta: false, shift: true, alt: true, ctrl: false },
  { meta: false, shift: false, alt: false, ctrl: true },
];

/** 一覧に載せなくてよい、別の書き方（同じ操作の、キーボード配列による別名など） */
const ALIASES: Record<string, string> = {
  "meta++": "Cmd + = の別名（US 配列では、Shift を押して +）",
  "meta+shift++": "Cmd + = の別名",
  "meta+shift+=": "Cmd + = の別名（Shift を押したまま）",
  "meta+?": "Cmd + / の別名（Cmd + ?）",
  "meta+shift+/": "Cmd + / の別名（Shift を押したまま）",
  "meta+shift+?": "Cmd + / の別名",
  "meta+shift+)": "Cmd + Shift + 0 の別名（配列によって、key が ) になる）",
  "meta+)": "Cmd + Shift + 0 の別名（Shift の有無が、報告されない場合）",
  "meta+shift+-": "Cmd + - の別名（Shift を押したまま。配列によって、- に Shift が要る）",
  "shift+Tab": "Tab と同じ（Shift の有無を区別しない）",
  "shift+ ": "Space と同じ（Shift の有無を区別しない）",
  "shift+Backspace": "Backspace と同じ（Shift の有無を区別しない）",
  "shift+Delete": "Delete と同じ（Shift の有無を区別しない）",
  "shift+F2": "F2 と同じ（Shift の有無を区別しない）",
  "shift+ArrowLeft": "← と同じ（Shift の有無を区別しない）",
  "shift+ArrowRight": "→ と同じ（Shift の有無を区別しない）",
  "shift+ArrowUp": "↑ と同じ（Shift の有無を区別しない）",
  "shift+ArrowDown": "↓ と同じ（Shift の有無を区別しない）",
};

/** 一覧にあっても、window のキー処理（preventDefault）では、検出できないもの */
const NOT_DETECTABLE: Record<string, string> = {
  Escape: "入力欄が受け取る（入力中の取り消し）。window では、preventDefault しない",
};

describe("ショートカット一覧と、キー処理の、食い違い防止", () => {
  beforeEach(() => {
    vi.mocked(readAutosave).mockResolvedValue(null);
    vi.mocked(registerCloseGuard).mockResolvedValue(vi.fn());
    vi.mocked(confirmDiscard).mockResolvedValue(true);
    vi.mocked(readClipboardText).mockResolvedValue("");
    vi.mocked(exportFile).mockResolvedValue(null);
    vi.mocked(loadFile).mockResolvedValue(null);
    vi.mocked(pickImage).mockResolvedValue(null);
    vi.mocked(saveFile).mockResolvedValue(null);
    vi.mocked(readRecentFiles).mockResolvedValue([]);
    vi.mocked(takePendingOpenFiles).mockResolvedValue([]);
    vi.mocked(onOpenFileRequest).mockResolvedValue(vi.fn());
  });
  afterEach(() => cleanup());

  /** window に、キーを送り、アプリが処理した（preventDefault した）キーの組み合わせを、すべて集める */
  let cached: Set<string> | null = null;
  function handledCombos(): Set<string> {
    if (cached) return cached;
    const handled = new Set<string>();
    for (const key of CANDIDATE_KEYS) {
      for (const mods of MODIFIER_SETS) {
        const { unmount } = render(<App />);
        const event = new KeyboardEvent("keydown", {
          key,
          metaKey: mods.meta,
          shiftKey: mods.shift,
          altKey: mods.alt,
          ctrlKey: mods.ctrl,
          bubbles: true,
          cancelable: true,
        });
        act(() => {
          window.dispatchEvent(event);
        });
        if (event.defaultPrevented) handled.add(combo(mods, key));
        unmount();
      }
    }
    cached = handled;
    return handled;
  }

  it("処理されるキーは、すべて一覧に載っている（別名を除く）", { timeout: 120000 }, () => {
    const documented = new Set(
      SHORTCUT_GROUPS.flatMap((group) => group.items.flatMap((item) => parseShortcutKeys(item.keys))),
    );

    const undocumented = [...handledCombos()].filter((c) => !documented.has(c) && !(c in ALIASES));

    expect(
      undocumented,
      "一覧に載っていない、処理されるキー（shortcuts.ts に足すか、ALIASES に理由を書く）",
    ).toEqual([]);
  });

  it("一覧に載っているキーは、すべて処理される", { timeout: 120000 }, () => {
    const documented = SHORTCUT_GROUPS.flatMap((group) =>
      group.items.flatMap((item) => parseShortcutKeys(item.keys)),
    );
    const handled = handledCombos();

    const unhandled = documented.filter((c) => !handled.has(c) && !(c in NOT_DETECTABLE));

    expect(unhandled, "一覧に載っているのに、処理されないキー").toEqual([]);
  });

  it("別名（ALIASES）は、実際に処理される。一覧に載った別名は、別名から外す", { timeout: 120000 }, () => {
    const documented = new Set(
      SHORTCUT_GROUPS.flatMap((group) => group.items.flatMap((item) => parseShortcutKeys(item.keys))),
    );
    const handled = handledCombos();

    const stale = Object.keys(ALIASES).filter((c) => !handled.has(c) || documented.has(c));

    expect(stale, "処理されない、または、一覧に載っている（別名でない）もの").toEqual([]);
  });
});
