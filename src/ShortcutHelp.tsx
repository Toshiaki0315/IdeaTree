import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { SHORTCUT_GROUPS } from "./domain/shortcuts";

interface Props {
  onClose: () => void;
}

/** ショートカット一覧（`Cmd + /`）。操作の一覧を、グループごとに表示する */
export default function ShortcutHelp({ onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // 開いたら、フォーカスを中に移す（キー入力を、ノード操作に渡さないため）
  useEffect(() => {
    ref.current?.focus();
  }, []);

  /** 中のキー入力は、ノード操作のショートカットに渡さない。Escape と Cmd+/ で閉じる */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const closeKey =
      event.key === "Escape" ||
      (event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "/" || event.key === "?"));
    if (closeKey) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className="shortcut-help"
      role="dialog"
      aria-label="ショートカット一覧"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="shortcut-help-header">
        <h2>ショートカット一覧</h2>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          <ul>
            {group.items.map((item) => (
              <li key={item.keys}>
                <kbd>{item.keys}</kbd>
                <span>{item.description}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
