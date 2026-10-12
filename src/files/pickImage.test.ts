import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickImage } from "./pickImage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const mockedOpen = vi.mocked(open);
const mockedInvoke = vi.mocked(invoke);

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

describe("pickImage（ノードに設定する画像の選択）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("画像のフィルタを指定し、単一ファイルを選ぶダイアログを開く", async () => {
    mockedOpen.mockResolvedValue(null);

    await pickImage();

    expect(mockedOpen).toHaveBeenCalledWith({
      title: "画像を選ぶ",
      multiple: false,
      directory: false,
      filters: [{ name: "画像", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
  });

  it("選ばれた画像を読み込み、データURLを返す", async () => {
    mockedOpen.mockResolvedValue("/Users/me/photo.png");
    mockedInvoke.mockResolvedValue(PNG);

    const result = await pickImage();

    expect(mockedInvoke).toHaveBeenCalledWith("load_image", { path: "/Users/me/photo.png" });
    expect(result).toBe(PNG);
  });

  it("ダイアログをキャンセルしたら、何も読み込まず null を返す", async () => {
    mockedOpen.mockResolvedValue(null);

    expect(await pickImage()).toBeNull();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("読み込みに失敗したら、理由を含む日本語のエラーにする（文字列でも Error でも）", async () => {
    mockedOpen.mockResolvedValue("/Users/me/photo.png");

    mockedInvoke.mockRejectedValueOnce("画像が大きすぎます（上限 2 MB）");
    await expect(pickImage()).rejects.toThrow("画像を読み込めません: 画像が大きすぎます（上限 2 MB）");

    mockedInvoke.mockRejectedValueOnce(new Error("busy"));
    await expect(pickImage()).rejects.toThrow("画像を読み込めません: busy");
  });
});
