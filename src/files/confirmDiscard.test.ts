import { ask } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDiscard } from "./confirmDiscard";

vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn() }));

const mockedAsk = vi.mocked(ask);

describe("confirmDiscard（未保存の変更を破棄してよいかの確認）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("警告の確認ダイアログを、日本語のメッセージとボタンで開く", async () => {
    mockedAsk.mockResolvedValue(true);

    await confirmDiscard();

    expect(mockedAsk).toHaveBeenCalledWith("保存していない変更があります。破棄して続けますか？", {
      title: "IdeaTree",
      kind: "warning",
      okLabel: "破棄して続ける",
      cancelLabel: "キャンセル",
    });
  });

  it("「破棄して続ける」を選んだら true を返す", async () => {
    mockedAsk.mockResolvedValue(true);

    expect(await confirmDiscard()).toBe(true);
  });

  it("「キャンセル」を選んだら false を返す", async () => {
    mockedAsk.mockResolvedValue(false);

    expect(await confirmDiscard()).toBe(false);
  });
});
