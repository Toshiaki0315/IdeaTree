/** バイト列を、base64 の文字列にする（大きなバイト列でも、スタックを使い切らないよう、小分けにして変換する） */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
