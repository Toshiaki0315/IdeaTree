import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { linkError, normalizeLink } from "./domain/nodeNote";

interface Props {
  /** メモとリンクを付ける、ノードの名前 */
  nodeText: string;
  note: string | undefined;
  link: string | undefined;
  /** メモを確定した（空なら、メモを外す） */
  onNoteChange: (note: string) => void;
  /** リンクを確定した（undefined なら、リンクを外す） */
  onLinkChange: (link: string | undefined) => void;
  onOpenLink: (link: string) => void;
  onClose: () => void;
}

/** 選択したノードの、メモとリンクのパネル（`Cmd + L`）。入力は、フォーカスを外すか、閉じるときに確定する */
export default function NotePanel({
  nodeText,
  note,
  link,
  onNoteChange,
  onLinkChange,
  onOpenLink,
  onClose,
}: Props) {
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  const [linkDraft, setLinkDraft] = useState(link ?? "");
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const error = linkError(linkDraft);

  useEffect(() => {
    memoRef.current?.focus();
  }, []);

  const commitNote = () => {
    if (noteDraft !== (note ?? "")) onNoteChange(noteDraft);
  };

  /** リンクを確定する。無効なときは、何もしない（理由を表示したまま） */
  const commitLink = () => {
    if (error !== null) return;
    const normalized = normalizeLink(linkDraft);
    setLinkDraft(normalized ?? "");
    if (normalized !== link) onLinkChange(normalized);
  };

  const close = () => {
    commitNote();
    commitLink();
    onClose();
  };

  /** 中のキー入力は、ノード操作のショートカットに渡さない。Escape と Cmd+L で閉じる */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const closeKey =
      event.key === "Escape" ||
      (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "l");
    if (closeKey) {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="note-panel" role="dialog" aria-label="メモとリンク" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="note-panel-header">
        <h2>メモとリンク</h2>
        <button type="button" onClick={close}>
          閉じる
        </button>
      </div>
      <p className="note-panel-target">{nodeText}</p>
      <label className="note-panel-field">
        メモ
        <textarea
          ref={memoRef}
          aria-label="メモ"
          rows={6}
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={commitNote}
        />
      </label>
      <label className="note-panel-field">
        リンク（URL）
        <input
          type="text"
          aria-label="リンク（URL）"
          aria-invalid={error !== null}
          placeholder="https://example.com/"
          value={linkDraft}
          onChange={(event) => setLinkDraft(event.target.value)}
          onBlur={commitLink}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitLink();
            }
          }}
        />
      </label>
      {error !== null && (
        <p className="note-panel-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" disabled={link === undefined} onClick={() => onOpenLink(link as string)}>
        リンクを開く
      </button>
    </div>
  );
}
