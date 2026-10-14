import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  /** 一致したノードの数 */
  matchCount: number;
  /** 今の一致（0 から数える） */
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  /** 変わるたびに、入力欄にフォーカスを戻す（開いたまま、Cmd+F を押したとき） */
  focusToken: number;
}

/** ノードの検索バー（`Cmd + F`）。検索語を入力すると、一致するノードを強調し、一致の間を移動できる */
export default function SearchBar({
  query,
  onQueryChange,
  matchCount,
  currentIndex,
  onNext,
  onPrevious,
  onClose,
  focusToken,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  /** バーの中のキー入力は、ノード操作のショートカットに渡さない */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    } else if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === "f") {
      event.preventDefault();
      inputRef.current?.select();
    }
  };

  const status =
    query.trim() === "" ? "" : matchCount === 0 ? "該当なし" : `${matchCount} 件中 ${currentIndex + 1} 件目`;

  return (
    <div className="search-bar" role="search" aria-label="検索" onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        type="search"
        aria-label="検索"
        placeholder="ノードを検索"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <span className="search-bar-count" data-role="search-count">
        {status}
      </span>
      <button type="button" onClick={onPrevious} aria-label="前へ">
        ↑
      </button>
      <button type="button" onClick={onNext} aria-label="次へ">
        ↓
      </button>
      <button type="button" onClick={onClose}>
        閉じる
      </button>
    </div>
  );
}
