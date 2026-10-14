import { openUrl } from "@tauri-apps/plugin-opener";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openLink } from "./openLink";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const mockedOpenUrl = vi.mocked(openUrl);

describe("openLink（リンクを、既定のブラウザで開く）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("http・https の URL を、開く", async () => {
    mockedOpenUrl.mockResolvedValue(undefined);

    await openLink("https://example.com/path");

    expect(mockedOpenUrl).toHaveBeenCalledWith("https://example.com/path");
  });

  it.each([["javascript:alert(1)"], ["file:///etc/passwd"], ["example.com"], [""]])(
    "http・https 以外（%s）は、開かずに、エラーにする",
    async (url) => {
      await expect(openLink(url)).rejects.toThrow("リンクは、http か https の URL にしてください");
      expect(mockedOpenUrl).not.toHaveBeenCalled();
    },
  );

  it("開けなかったら、理由を含む日本語のエラーにする", async () => {
    mockedOpenUrl.mockRejectedValue(new Error("not allowed"));
    await expect(openLink("https://example.com/")).rejects.toThrow("リンクを開けません: not allowed");

    mockedOpenUrl.mockRejectedValue("plain failure");
    await expect(openLink("https://example.com/")).rejects.toThrow("リンクを開けません: plain failure");
  });
});
