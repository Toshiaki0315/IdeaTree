import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NotePanel from "./NotePanel";

function setup(props: { note?: string; link?: string } = {}) {
  const handlers = {
    onNoteChange: vi.fn(),
    onLinkChange: vi.fn(),
    onOpenLink: vi.fn(),
    onClose: vi.fn(),
  };
  render(<NotePanel nodeText="企画" note={props.note} link={props.link} {...handlers} />);
  return handlers;
}

const memo = () => screen.getByRole("textbox", { name: "メモ" }) as HTMLTextAreaElement;
const link = () => screen.getByRole("textbox", { name: "リンク（URL）" }) as HTMLInputElement;

describe("NotePanel（メモとリンク）", () => {
  it("ノードの名前と、今のメモ・リンクを表示し、開いたら、メモの入力欄にフォーカスする", () => {
    setup({ note: "補足", link: "https://example.com/" });

    expect(screen.getByRole("dialog", { name: "メモとリンク" })).toBeInTheDocument();
    expect(screen.getByText("企画")).toBeInTheDocument();
    expect(memo().value).toBe("補足");
    expect(link().value).toBe("https://example.com/");
    expect(memo()).toHaveFocus();
  });

  describe("メモ", () => {
    it("入力して、フォーカスを外すと、メモを確定する（複数行も可）", async () => {
      const { onNoteChange } = setup();
      const user = userEvent.setup();

      await user.type(memo(), "一行目{Enter}二行目");
      expect(onNoteChange).not.toHaveBeenCalled();
      await user.click(link());

      expect(onNoteChange).toHaveBeenCalledTimes(1);
      expect(onNoteChange).toHaveBeenCalledWith("一行目\n二行目");
    });

    it("変えていなければ、確定しない", async () => {
      const { onNoteChange } = setup({ note: "そのまま" });
      const user = userEvent.setup();

      await user.click(link());

      expect(onNoteChange).not.toHaveBeenCalled();
    });

    it("全部消すと、空のメモを、確定する（メモを外す）", async () => {
      const { onNoteChange } = setup({ note: "消す" });
      const user = userEvent.setup();

      await user.clear(memo());
      await user.click(link());

      expect(onNoteChange).toHaveBeenCalledWith("");
    });
  });

  describe("リンク", () => {
    it("Enter で、リンクを確定する。スキームがなければ、https:// を補い、入力欄も正規化した値にする", async () => {
      const { onLinkChange } = setup();
      const user = userEvent.setup();

      await user.type(link(), "example.com/a{Enter}");

      expect(onLinkChange).toHaveBeenCalledWith("https://example.com/a");
      expect(link().value).toBe("https://example.com/a");
    });

    it("フォーカスを外したときも、確定する", async () => {
      const { onLinkChange } = setup();
      const user = userEvent.setup();

      await user.type(link(), "http://example.com/");
      await user.click(memo());

      expect(onLinkChange).toHaveBeenCalledWith("http://example.com/");
    });

    it("空にして確定すると、リンクを外す", async () => {
      const { onLinkChange } = setup({ link: "https://example.com/" });
      const user = userEvent.setup();

      await user.clear(link());
      await user.keyboard("{Enter}");

      expect(onLinkChange).toHaveBeenCalledWith(undefined);
    });

    it("http・https 以外は、理由を表示し、確定しない。直すと、表示が消える", async () => {
      const { onLinkChange } = setup();
      const user = userEvent.setup();

      await user.type(link(), "javascript:alert(1){Enter}");

      expect(screen.getByRole("alert")).toHaveTextContent("リンクは、http か https の URL にしてください");
      expect(link()).toHaveAttribute("aria-invalid", "true");
      expect(onLinkChange).not.toHaveBeenCalled();

      await user.clear(link());
      await user.type(link(), "example.com");

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(link()).not.toHaveAttribute("aria-invalid", "true");
    });

    it("変えていなければ、確定しない", async () => {
      const { onLinkChange } = setup({ link: "https://example.com/" });
      const user = userEvent.setup();

      await user.click(link());
      await user.click(memo());

      expect(onLinkChange).not.toHaveBeenCalled();
    });

    it("「リンクを開く」は、リンクがあるときだけ使え、押すと、そのリンクを開く", async () => {
      const { onOpenLink } = setup({ link: "https://example.com/" });

      await userEvent.setup().click(screen.getByRole("button", { name: "リンクを開く" }));

      expect(onOpenLink).toHaveBeenCalledWith("https://example.com/");
    });

    it("リンクがなければ、「リンクを開く」は使えない", () => {
      setup();

      expect(screen.getByRole("button", { name: "リンクを開く" })).toBeDisabled();
    });
  });

  describe("閉じる", () => {
    it("Escape と「閉じる」で閉じる。入力中の内容は、閉じる前に確定する", async () => {
      const { onNoteChange, onLinkChange, onClose } = setup();
      const user = userEvent.setup();

      await user.type(memo(), "書きかけ");
      await user.keyboard("{Escape}");

      expect(onNoteChange).toHaveBeenCalledWith("書きかけ");
      expect(onClose).toHaveBeenCalledTimes(1);

      await user.type(link(), "example.com");
      await user.click(screen.getByRole("button", { name: "閉じる" }));

      expect(onLinkChange).toHaveBeenCalledWith("https://example.com/");
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("入力中のリンクが無効なら、確定せずに、閉じる", async () => {
      const { onLinkChange, onClose } = setup();
      const user = userEvent.setup();

      await user.type(link(), "javascript:x");
      await user.keyboard("{Escape}");

      expect(onLinkChange).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Cmd+L でも閉じる", () => {
      const { onClose } = setup();

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "l", metaKey: true });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("キー入力を、ノード操作のショートカットに渡さない", () => {
    setup();
    const outer = vi.fn();
    window.addEventListener("keydown", outer);

    fireEvent.keyDown(memo(), { key: "Tab" });

    window.removeEventListener("keydown", outer);
    expect(outer).not.toHaveBeenCalled();
  });
});
