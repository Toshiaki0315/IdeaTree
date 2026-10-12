import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { NodeStyle } from "./domain/mindmap";
import { COLOR_PRESETS, FONT_PRESETS, FONT_SIZE_PRESETS } from "./domain/stylePresets";

interface Props {
  /** 選択中のノードのテキスト */
  nodeText: string;
  /** 選択中のノードの現在のスタイル */
  style: NodeStyle;
  /** 項目を変更する（undefined は「自動」に戻す） */
  onChange: (patch: Partial<NodeStyle>) => void;
  onClose: () => void;
}

/** 選択肢に現在の値がなければ（ファイルから読み込んだ値など）、末尾に加える */
function withCurrent<T>(options: { name: string; value: T }[], current: T | undefined, name: string) {
  const known = current === undefined || options.some((option) => option.value === current);
  return known ? options : [...options, { name, value: current as T }];
}

export default function StylePanel({ nodeText, style, onChange, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // 開いたら、現在選ばれている色にフォーカスを移す
  useEffect(() => {
    panelRef.current?.querySelector<HTMLInputElement>("input[type=radio]:checked")?.focus();
  }, []);

  /** パネルの中のキー入力は、ノード操作のショートカットに渡さない */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const closeKey =
      event.key === "Escape" ||
      (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === "k");
    if (closeKey) {
      event.preventDefault();
      onClose();
    }
  };

  const colors = withCurrent(COLOR_PRESETS, style.color, style.color ?? "");
  const fonts = withCurrent(FONT_PRESETS, style.fontFamily, style.fontFamily ?? "");
  const sizes = withCurrent(
    FONT_SIZE_PRESETS.map((size) => ({ name: String(size), value: size })),
    style.fontSize,
    String(style.fontSize),
  );

  return (
    <div
      ref={panelRef}
      className="style-panel"
      role="dialog"
      aria-label="スタイル"
      onKeyDown={onKeyDown}
    >
      <p className="style-panel-target">選択中: {nodeText}</p>

      <fieldset className="style-panel-colors" role="radiogroup" aria-label="色">
        {[{ name: "自動", value: undefined as string | undefined }, ...colors].map((color) => (
          <label key={color.name} className="style-panel-color">
            <input
              type="radio"
              name="style-color"
              aria-label={color.name}
              checked={style.color === color.value}
              onChange={() => onChange({ color: color.value })}
            />
            <span
              className="style-panel-swatch"
              style={{ background: color.value ?? "transparent" }}
              title={color.name}
            />
          </label>
        ))}
      </fieldset>

      <label className="style-panel-field">
        フォント
        <select
          aria-label="フォント"
          value={style.fontFamily ?? ""}
          onChange={(event) => onChange({ fontFamily: event.target.value || undefined })}
        >
          <option value="">自動</option>
          {fonts.map((font) => (
            <option key={font.value} value={font.value}>
              {font.name}
            </option>
          ))}
        </select>
      </label>

      <label className="style-panel-field">
        文字サイズ
        <select
          aria-label="文字サイズ"
          value={style.fontSize === undefined ? "" : String(style.fontSize)}
          onChange={(event) =>
            onChange({ fontSize: event.target.value ? Number(event.target.value) : undefined })
          }
        >
          <option value="">自動</option>
          {sizes.map((size) => (
            <option key={size.value} value={size.value}>
              {size.name}
            </option>
          ))}
        </select>
      </label>

      <button type="button" onClick={onClose}>
        閉じる
      </button>
    </div>
  );
}
