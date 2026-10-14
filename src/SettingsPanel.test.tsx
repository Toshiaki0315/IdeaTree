import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SettingsPanel from "./SettingsPanel";
import type { ThemeSetting } from "./domain/theme";

function setup(theme: ThemeSetting = "auto") {
  const onThemeChange = vi.fn();
  const onClose = vi.fn();
  render(<SettingsPanel theme={theme} onThemeChange={onThemeChange} onClose={onClose} />);
  return { onThemeChange, onClose };
}

describe("SettingsPanel（設定）", () => {
  it("テーマを、自動・ライト・ダークから選べて、今の設定が選ばれている", () => {
    setup("dark");

    const group = screen.getByRole("radiogroup", { name: "テーマ" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "自動（システムに合わせる）" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "ライト" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "ダーク" })).toBeChecked();
  });

  it("選ぶと、そのテーマの設定を、通知する", async () => {
    const { onThemeChange } = setup("auto");

    await userEvent.setup().click(screen.getByRole("radio", { name: "ライト" }));

    expect(onThemeChange).toHaveBeenCalledWith("light");
  });

  it("Escape と「閉じる」で閉じる", async () => {
    const { onClose } = setup();
    const user = userEvent.setup();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("キー入力を、ノード操作のショートカットに渡さない", () => {
    setup();
    const outer = vi.fn();
    window.addEventListener("keydown", outer);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowDown" });

    window.removeEventListener("keydown", outer);
    expect(outer).not.toHaveBeenCalled();
  });

  it("Cmd+, でも閉じる", () => {
    const { onClose } = setup();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: ",", metaKey: true });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
