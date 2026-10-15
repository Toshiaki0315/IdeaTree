import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NotePanel from "./NotePanel";
import type { RelationRow } from "./NotePanel";

function setup(props: { note?: string; link?: string; relations?: RelationRow[] } = {}) {
  const handlers = {
    onNoteChange: vi.fn(),
    onLinkChange: vi.fn(),
    onOpenLink: vi.fn(),
    onRelationChange: vi.fn(),
    onRelationRemove: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <NotePanel
      nodeText="企画"
      note={props.note}
      link={props.link}
      relations={props.relations}
      {...handlers}
    />,
  );
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

describe("NotePanel: 関連線", () => {
  const rows: RelationRow[] = [
    { id: "r1", direction: "to", otherText: "予算", label: "依存", color: "#1A7FD1" },
    { id: "r2", direction: "from", otherText: "調査", label: "", color: undefined },
  ];
  const labelField = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;

  it("関連線がなければ、関連線の欄は、出さない", () => {
    setup();

    expect(screen.queryByRole("group", { name: /関連線/ })).not.toBeInTheDocument();
  });

  it("このノードにつながる関連線を、向き（→ / ←）と相手の名前で、一覧にする", () => {
    setup({ relations: rows });

    expect(screen.getByRole("group", { name: "関連線: → 予算" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "関連線: ← 調査" })).toBeInTheDocument();
    expect(labelField("ラベル（→ 予算）").value).toBe("依存");
    expect(labelField("ラベル（← 調査）").value).toBe("");
  });

  it("ラベルは、Enter かフォーカスを外したときに、確定する（変えていなければ、確定しない）", async () => {
    const { onRelationChange } = setup({ relations: rows });
    const user = userEvent.setup();

    await user.click(labelField("ラベル（← 調査）"));
    await user.keyboard("{Tab}");
    expect(onRelationChange).not.toHaveBeenCalled();

    await user.type(labelField("ラベル（← 調査）"), "参照{Enter}");
    expect(onRelationChange).toHaveBeenCalledWith("r2", { label: "参照" });

    await user.clear(labelField("ラベル（→ 予算）"));
    await user.click(memo());
    expect(onRelationChange).toHaveBeenCalledWith("r1", { label: undefined });
  });

  it("色を選ぶと、すぐに、その色を通知する。「既定」で、色を外す", async () => {
    const { onRelationChange } = setup({ relations: rows });
    const user = userEvent.setup();

    expect(screen.getByRole("combobox", { name: "色（→ 予算）" })).toHaveValue("#1A7FD1");
    expect(screen.getByRole("combobox", { name: "色（← 調査）" })).toHaveValue("");

    await user.selectOptions(screen.getByRole("combobox", { name: "色（← 調査）" }), "#E63946");
    expect(onRelationChange).toHaveBeenCalledWith("r2", { color: "#E63946" });

    await user.selectOptions(screen.getByRole("combobox", { name: "色（→ 予算）" }), "");
    expect(onRelationChange).toHaveBeenCalledWith("r1", { color: undefined });
  });

  it("「関連線を削除」で、その関連線を、削除する", async () => {
    const { onRelationRemove } = setup({ relations: rows });

    await userEvent.setup().click(screen.getByRole("button", { name: "関連線を削除（← 調査）" }));

    expect(onRelationRemove).toHaveBeenCalledWith("r2");
  });

  it("閉じるとき、入力中のラベルを、確定する", async () => {
    const { onRelationChange, onClose } = setup({ relations: rows });
    const user = userEvent.setup();

    await user.type(labelField("ラベル（← 調査）"), "書きかけ");
    await user.keyboard("{Escape}");

    expect(onRelationChange).toHaveBeenCalledWith("r2", { label: "書きかけ" });
    expect(onClose).toHaveBeenCalled();
  });
});
