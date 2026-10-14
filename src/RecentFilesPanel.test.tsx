import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RecentFilesPanel from "./RecentFilesPanel";
import type { RecentFile } from "./domain/recentFiles";

const files: RecentFile[] = [
  { path: "/Users/me/アイデア.ideatree", openedAt: "2026-10-14T10:00:00.000Z" },
  { path: "/Users/me/work/計画.json", openedAt: "2026-10-13T10:00:00.000Z" },
  { path: "/map.ideatree", openedAt: "2026-10-12T10:00:00.000Z" },
];

function setup(list: RecentFile[] = files) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<RecentFilesPanel files={list} onSelect={onSelect} onClose={onClose} />);
  return { onSelect, onClose };
}

const options = () => screen.getAllByRole("option");

describe("RecentFilesPanel", () => {
  it("最近使ったファイルを、ファイル名とフォルダ付きで、新しい順に並べる", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "最近使ったファイル" })).toBeInTheDocument();
    expect(options().map((o) => o.textContent)).toEqual([
      "アイデア.ideatree/Users/me",
      "計画.json/Users/me/work",
      "map.ideatree/",
    ]);
  });

  it("最初の項目が選ばれていて、↓↑で動かせる（端で止まる）", async () => {
    setup();
    const user = userEvent.setup();
    const selected = () => options().findIndex((o) => o.getAttribute("aria-selected") === "true");
    expect(selected()).toBe(0);
    await user.keyboard("{ArrowDown}");
    expect(selected()).toBe(1);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(selected()).toBe(2);
    await user.keyboard("{ArrowUp}");
    expect(selected()).toBe(1);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(selected()).toBe(0);
  });

  it("Enter で、選んでいるファイルを開く", async () => {
    const { onSelect } = setup();
    const user = userEvent.setup();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("/Users/me/work/計画.json");
  });

  it("クリックで、そのファイルを開く", async () => {
    const { onSelect } = setup();
    await userEvent.setup().click(options()[2]);
    expect(onSelect).toHaveBeenCalledWith("/map.ideatree");
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

  it("一覧が空なら、案内を表示し、Enter では何も開かない", async () => {
    const { onSelect } = setup([]);
    expect(screen.getByText("最近使ったファイルはありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await userEvent.setup().keyboard("{ArrowDown}{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
