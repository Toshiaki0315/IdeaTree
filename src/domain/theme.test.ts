import { describe, expect, it } from "vitest";
import { PALETTES, parseThemeSetting, resolveTheme } from "./theme";

describe("parseThemeSetting（保存した設定の解釈）", () => {
  it.each([["auto"], ["light"], ["dark"]])("%s は、そのまま使う", (value) => {
    expect(parseThemeSetting(value)).toBe(value);
  });

  it.each([[null], [undefined], [""], ["blue"], [1], [{}]])("知らない値（%j）は、自動にする", (value) => {
    expect(parseThemeSetting(value)).toBe("auto");
  });
});

describe("resolveTheme（実際に使うテーマ）", () => {
  it("ライト・ダークの指定は、システムの設定によらず、そのまま使う", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("自動は、システムがダークなら、ダーク。そうでなければ、ライト", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
  });
});

describe("PALETTES（配色）", () => {
  it("ライトは、白い背景に、濃い文字（これまでの配色）", () => {
    expect(PALETTES.light).toEqual({ background: "#FFFFFF", centralText: "#333333" });
  });

  it("ダークは、暗い背景に、明るい文字", () => {
    expect(PALETTES.dark.background).not.toBe(PALETTES.light.background);
    expect(PALETTES.dark.centralText).not.toBe(PALETTES.light.centralText);
  });
});
