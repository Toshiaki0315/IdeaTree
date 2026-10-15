import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { BRANCH_COLORS } from "./domain/branchColor";
import { linkError, normalizeLink } from "./domain/nodeNote";

/** 関連線の色の選択肢の名前（BRANCH_COLORS と同じ順） */
const COLOR_NAMES = ["赤", "オレンジ", "黄", "緑", "青", "紫", "ピンク", "茶"];

/** パネルに出す、選択ノードにつながる関連線の1行 */
export interface RelationRow {
  id: string;
  /** to: このノードから、相手へ（→）。from: 相手から、このノードへ（←） */
  direction: "to" | "from";
  /** 相手のノードの名前 */
  otherText: string;
  label: string;
  /** 線の色（#RRGGBB）。なければ、既定のグレー */
  color: string | undefined;
}

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
  /** このノードにつながる関連線（なければ、関連線の欄は、出さない） */
  relations?: RelationRow[];
  /** 関連線のラベルか色を、確定した（色は undefined なら、既定に戻す。ラベルは、空なら、外す） */
  onRelationChange?: (id: string, patch: { label?: string; color?: string | undefined }) => void;
  onRelationRemove?: (id: string) => void;
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
  relations = [],
  onRelationChange,
  onRelationRemove,
  onClose,
}: Props) {
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  const [linkDraft, setLinkDraft] = useState(link ?? "");
  /** 関連線のラベルの、入力中の内容（関連線の id ごと。まだ確定していないもの） */
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
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

  /** 関連線のラベルを確定する（変えていなければ、何もしない） */
  const commitRelationLabel = (row: RelationRow) => {
    const draft = labelDrafts[row.id];
    if (draft === undefined || draft === row.label) return;
    // 空にしたときは、ラベルを外す
    onRelationChange?.(row.id, { label: draft === "" ? undefined : draft });
    setLabelDrafts((drafts) => {
      const rest = { ...drafts };
      delete rest[row.id];
      return rest;
    });
  };

  const close = () => {
    commitNote();
    commitLink();
    relations.forEach(commitRelationLabel);
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
      {relations.map((row) => {
        const name = `${row.direction === "to" ? "→" : "←"} ${row.otherText}`;
        return (
          <fieldset key={row.id} className="note-panel-relation" role="group" aria-label={`関連線: ${name}`}>
            <legend>関連線: {name}</legend>
            <input
              type="text"
              aria-label={`ラベル（${name}）`}
              value={labelDrafts[row.id] ?? row.label}
              onChange={(event) => setLabelDrafts({ ...labelDrafts, [row.id]: event.target.value })}
              onBlur={() => commitRelationLabel(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRelationLabel(row);
                }
              }}
            />
            <select
              aria-label={`色（${name}）`}
              value={row.color ?? ""}
              onChange={(event) => onRelationChange?.(row.id, { color: event.target.value || undefined })}
            >
              <option value="">既定（グレー）</option>
              {BRANCH_COLORS.map((color, i) => (
                <option key={color} value={color}>
                  {COLOR_NAMES[i]}
                </option>
              ))}
              {row.color !== undefined && !BRANCH_COLORS.includes(row.color) && (
                <option value={row.color}>{row.color}</option>
              )}
            </select>
            <button
              type="button"
              onClick={() => onRelationRemove?.(row.id)}
              aria-label={`関連線を削除（${name}）`}
            >
              削除
            </button>
          </fieldset>
        );
      })}
      <button type="button" disabled={link === undefined} onClick={() => onOpenLink(link as string)}>
        リンクを開く
      </button>
    </div>
  );
}
