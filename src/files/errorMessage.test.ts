import { describe, expect, it } from "vitest";
import { errorMessage } from "./errorMessage";

describe("errorMessage", () => {
  it("Error なら、そのメッセージを返す", () => {
    expect(errorMessage(new Error("失敗しました"))).toBe("失敗しました");
  });

  it("Error でなければ（Tauri のコマンドの失敗は、文字列で届く）、文字列にして返す", () => {
    expect(errorMessage("ファイルが見つかりません")).toBe("ファイルが見つかりません");
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
  });
});
