import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { recentFileFolder, recentFileName } from "./domain/recentFiles";
import type { RecentFile } from "./domain/recentFiles";

interface Props {
  files: RecentFile[];
  onSelect: (path: string) => void;
  onClose: () => void;
}

/** 最近使ったファイルの一覧（`Cmd + Shift + O`）。↑↓で選び、Enter で開く */
export default function RecentFilesPanel({ files, onSelect, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  /** パネルの中のキー入力は、ノード操作のショートカットに渡さない */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((i) => Math.min(files.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter" && files.length > 0) {
      event.preventDefault();
      onSelect(files[index].path);
    }
  };

  return (
    <div
      ref={rootRef}
      className="recent-panel"
      role="dialog"
      aria-label="最近使ったファイル"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <h2>最近使ったファイル</h2>
      {files.length === 0 ? (
        <p>最近使ったファイルはありません</p>
      ) : (
        <ul role="listbox" aria-label="ファイル">
          {files.map((file, i) => (
            <li key={file.path} role="option" aria-selected={i === index} onClick={() => onSelect(file.path)}>
              <span className="recent-name">{recentFileName(file.path)}</span>
              <span className="recent-folder">{recentFileFolder(file.path)}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onClose}>
        閉じる
      </button>
    </div>
  );
}
