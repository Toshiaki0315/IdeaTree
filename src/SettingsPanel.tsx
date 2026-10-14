import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { ThemeSetting } from "./domain/theme";

interface Props {
  theme: ThemeSetting;
  onThemeChange: (theme: ThemeSetting) => void;
  onClose: () => void;
}

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: "auto", label: "自動（システムに合わせる）" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

/** 設定（`Cmd + ,`）。今は、テーマ（ライト・ダーク）を選べる */
export default function SettingsPanel({ theme, onThemeChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // 開いたら、フォーカスを中に移す（キー入力を、ノード操作に渡さないため）
  useEffect(() => {
    ref.current?.focus();
  }, []);

  /** 中のキー入力は、ノード操作のショートカットに渡さない。Escape と Cmd+, で閉じる */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const closeKey =
      event.key === "Escape" || (event.metaKey && !event.ctrlKey && !event.altKey && event.key === ",");
    if (closeKey) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className="settings-panel"
      role="dialog"
      aria-label="設定"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="settings-panel-header">
        <h2>設定</h2>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </div>
      <div role="radiogroup" aria-label="テーマ" className="settings-panel-group">
        <h3>テーマ</h3>
        {THEME_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => onThemeChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
