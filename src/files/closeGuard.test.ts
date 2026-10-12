import { getCurrentWindow } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCloseGuard } from "./closeGuard";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

type CloseEvent = { preventDefault: () => void };
type CloseHandler = (event: CloseEvent) => Promise<void> | void;

const mockedGetCurrentWindow = vi.mocked(getCurrentWindow);

/** onCloseRequested に渡されたハンドラを取り出せる、ウィンドウの代役 */
function fakeWindow() {
  const unlisten = vi.fn();
  let handler: CloseHandler | undefined;
  const onCloseRequested = vi.fn((h: CloseHandler) => {
    handler = h;
    return Promise.resolve(unlisten);
  });
  mockedGetCurrentWindow.mockReturnValue({ onCloseRequested } as unknown as ReturnType<
    typeof getCurrentWindow
  >);
  /** ウィンドウを閉じる操作を行い、閉じるのが止められたかを返す */
  const requestClose = async () => {
    const event = { preventDefault: vi.fn() };
    await handler!(event);
    return event.preventDefault.mock.calls.length > 0;
  };
  return { onCloseRequested, unlisten, requestClose };
}

describe("registerCloseGuard（ウィンドウを閉じるときの、未保存の変更の確認）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ウィンドウを閉じる操作を監視し、解除する関数を返す", async () => {
    const win = fakeWindow();

    const unregister = await registerCloseGuard(
      () => false,
      async () => true,
    );

    expect(win.onCloseRequested).toHaveBeenCalledTimes(1);
    expect(win.unlisten).not.toHaveBeenCalled();
    unregister();
    expect(win.unlisten).toHaveBeenCalledTimes(1);
  });

  it("未保存の変更がなければ、確認せずに、そのまま閉じる", async () => {
    const win = fakeWindow();
    const confirm = vi.fn(async () => true);
    await registerCloseGuard(() => false, confirm);

    expect(await win.requestClose()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("未保存の変更があるときは確認し、「破棄して続ける」なら閉じる", async () => {
    const win = fakeWindow();
    const confirm = vi.fn(async () => true);
    await registerCloseGuard(() => true, confirm);

    expect(await win.requestClose()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("未保存の変更があるときに「キャンセル」を選ぶと、閉じるのを止める", async () => {
    const win = fakeWindow();
    await registerCloseGuard(
      () => true,
      async () => false,
    );

    expect(await win.requestClose()).toBe(true);
  });

  it("確認のダイアログが失敗したときも、変更を失わないよう、閉じるのを止める", async () => {
    const win = fakeWindow();
    await registerCloseGuard(
      () => true,
      async () => {
        throw new Error("ダイアログを開けません");
      },
    );

    expect(await win.requestClose()).toBe(true);
  });

  it("未保存かどうかは、登録時ではなく、閉じる操作の時点で判定する", async () => {
    const win = fakeWindow();
    let dirty = false;
    const confirm = vi.fn(async () => false);
    await registerCloseGuard(() => dirty, confirm);

    expect(await win.requestClose()).toBe(false);
    dirty = true;
    expect(await win.requestClose()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("Tauri の外（ブラウザ）で getCurrentWindow が例外を投げても、例外ではなく、Promise の失敗として返す", async () => {
    mockedGetCurrentWindow.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'metadata')");
    });

    let promise: Promise<() => void> | undefined;
    expect(() => {
      promise = registerCloseGuard(
        () => false,
        async () => true,
      );
    }).not.toThrow();
    await expect(promise).rejects.toThrow("metadata");
  });
});
