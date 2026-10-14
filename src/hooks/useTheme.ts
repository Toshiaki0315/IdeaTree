import { useEffect, useState } from "react";
import { parseThemeSetting, resolveTheme } from "../domain/theme";
import type { Theme, ThemeSetting } from "../domain/theme";

/** テーマの設定を保存する、localStorage のキー */
export const THEME_STORAGE_KEY = "ideatree.theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** localStorage を読む（使えない環境では、なかったことにする） */
function readSetting(): ThemeSetting {
  try {
    return parseThemeSetting(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

/** システムの配色がダークか（matchMedia がない環境では、ライト） */
function systemIsDark(): boolean {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
}

/**
 * テーマ（ライト・ダーク）。設定は、自動・ライト・ダークで、localStorage に保存する。
 * 自動のときは、システムの配色の切り替えに追従する。実際のテーマは、`<html data-theme>` にも書く（CSS 用）。
 */
export function useTheme(): {
  setting: ThemeSetting;
  theme: Theme;
  setSetting: (setting: ThemeSetting) => void;
} {
  const [setting, setSettingState] = useState<ThemeSetting>(readSetting);
  const [systemDark, setSystemDark] = useState(systemIsDark);
  const theme = resolveTheme(setting, systemDark);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(DARK_QUERY);
    const onChange = (event: { matches: boolean }) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setSetting = (next: ThemeSetting) => {
    setSettingState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 保存できなくても、この回は、設定が効く
    }
  };

  return { setting, theme, setSetting };
}
