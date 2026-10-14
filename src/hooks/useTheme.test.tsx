import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY, useTheme } from "./useTheme";

type Listener = (event: { matches: boolean }) => void;

/** matchMedia の代わり（システムの配色を、テストから切り替えられる） */
function stubSystemTheme(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<Listener>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return dark;
    },
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }));
  return {
    set(next: boolean) {
      dark = next;
      listeners.forEach((listener) => listener({ matches: next }));
    },
    listenerCount: () => listeners.size,
  };
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("保存した設定がなければ、自動で、システムがライトなら、ライト", () => {
    stubSystemTheme(false);

    const { result } = renderHook(() => useTheme());

    expect(result.current.setting).toBe("auto");
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("自動のとき、システムがダークなら、ダークになり、システムの切り替えに追従する", () => {
    const system = stubSystemTheme(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");

    act(() => system.set(false));

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("設定を変えると、すぐに反映し、保存する", () => {
    stubSystemTheme(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setSetting("dark"));

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("保存した設定を、次に使うとき読み込む。壊れた値は、自動にする", () => {
    stubSystemTheme(false);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(renderHook(() => useTheme()).result.current.theme).toBe("dark");

    localStorage.setItem(THEME_STORAGE_KEY, "???");
    expect(renderHook(() => useTheme()).result.current.setting).toBe("auto");
  });

  it("画面を閉じたら、システムの切り替えの監視をやめる", () => {
    const system = stubSystemTheme(false);
    const { unmount } = renderHook(() => useTheme());
    expect(system.listenerCount()).toBe(1);

    unmount();

    expect(system.listenerCount()).toBe(0);
  });

  it("matchMedia がない環境では、ライトとして動く", () => {
    vi.stubGlobal("matchMedia", undefined);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
  });

  it("保存できない・読めない環境（localStorage が例外を投げる）でも、動く", () => {
    stubSystemTheme(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setSetting("dark"));

    expect(result.current.theme).toBe("dark");
    vi.restoreAllMocks();
  });
});
