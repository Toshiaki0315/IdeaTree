export interface PdfOptions {
  /** ページいっぱいに載せる、JPEG のデータ（圧縮のまま埋め込む） */
  jpeg: Uint8Array;
  /** 画像の大きさ（px） */
  imageWidth: number;
  imageHeight: number;
  /** ページの大きさ（pt。1pt = 1/72 インチ） */
  pageWidth: number;
  pageHeight: number;
}

/** 小数第2位までの、PDF の数値の表記 */
function num(value: number): string {
  return String(Number(value.toFixed(2)));
}

const isPositive = (value: number) => Number.isFinite(value) && value > 0;

/** バイト列を、1バイト=1文字の文字列にする */
function toLatin1(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return text;
}

/**
 * JPEG 画像を、1ページいっぱいに載せた、PDF を作る。
 * 画像は、JPEG の圧縮（DCT）のまま埋め込む。外部のライブラリは使わず、必要な部分だけを書き出す。
 */
export function buildPdf(options: PdfOptions): Uint8Array {
  const { jpeg, imageWidth, imageHeight, pageWidth, pageHeight } = options;
  if (jpeg.length === 0) {
    throw new Error("JPEG のデータが空です");
  }
  if (![imageWidth, imageHeight, pageWidth, pageHeight].every(isPositive)) {
    throw new Error("画像やページの大きさが不正です");
  }

  const width = num(pageWidth);
  const height = num(pageHeight);
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${toLatin1(jpeg)}\nendstream`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let text = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) text += `${String(offset).padStart(10, "0")} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}
