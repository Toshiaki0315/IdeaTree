/** 画像にするときの標準の倍率（高精細にするため、画面の 2 倍） */
export const RASTER_SCALE = 2;
/** 画像の長辺の上限（px）。キャンバスの大きさの限界を超えないようにする */
export const MAX_RASTER_SIDE = 8192;

/** 画像にするときの倍率。長辺が上限を超えるときは、上限に収まるよう、下げる */
export function rasterScale(width: number, height: number): number {
  return Math.min(RASTER_SCALE, MAX_RASTER_SIDE / Math.max(width, height));
}

/**
 * SVG（文字列）を、PNG または JPEG の画像（バイト列）にする。白い背景に描く。
 * 画像は、キャンバスを使って作る（WebView の描画をそのまま使うので、フォントも画面と同じ）。
 */
export async function rasterizeSvg(
  svg: string,
  width: number,
  height: number,
  format: "png" | "jpeg",
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const scale = rasterScale(width, height);
  const pixelWidth = Math.round(width * scale);
  const pixelHeight = Math.round(height * scale);

  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("SVG を画像に変換できません"));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("画像を作れません（キャンバスを使えません）");
  }
  // JPEG は透明を持てないので、PNG も含めて、白い背景を敷く
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, pixelWidth, pixelHeight);
  context.drawImage(image, 0, 0, pixelWidth, pixelHeight);

  const mime = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "jpeg" ? 0.92 : undefined;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) {
    throw new Error("画像のデータを作れません");
  }
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: pixelWidth, height: pixelHeight };
}
