import { ask } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmRestore } from "./confirmRestore";

vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn() }));

const mockedAsk = vi.mocked(ask);
const savedAt = new Date(2026, 9, 14, 8, 5); // 2026年10月14日 8:05（ローカルの時刻）

describe("confirmRestore（前回の編集内容を、復元するかの確認）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("保存時刻を示して、「復元する」「破棄する」を選ばせる", async () => {
    mockedAsk.mockResolvedValue(true);

    await confirmRestore(savedAt, undefined);

    expect(mockedAsk).toHaveBeenCalledWith(
      "保存されていない、前回の編集内容が残っています（2026/10/14 08:05）。復元しますか？",
      { title: "IdeaTree", kind: "info", okLabel: "復元する", cancelLabel: "破棄する" },
    );
  });

  it("編集していたファイルがあれば、そのファイル名も示す（パスの最後の部分）", async () => {
    mockedAsk.mockResolvedValue(true);

    await confirmRestore(savedAt, "/Users/me/Documents/ideas.json");

    expect(mockedAsk.mock.calls[0][0]).toBe(
      "保存されていない、前回の編集内容が残っています（2026/10/14 08:05、ideas.json）。復元しますか？",
    );
  });

  it("「復元する」を選んだら true、「破棄する」を選んだら false を返す", async () => {
    mockedAsk.mockResolvedValueOnce(true);
    expect(await confirmRestore(savedAt, undefined)).toBe(true);

    mockedAsk.mockResolvedValueOnce(false);
    expect(await confirmRestore(savedAt, undefined)).toBe(false);
  });
});
