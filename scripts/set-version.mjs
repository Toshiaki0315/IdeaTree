// バージョンを、すべての場所でそろえて書き換える。
//
//     make version V=0.6.4   （= node scripts/set-version.mjs 0.6.4）
//
// 書き換える場所: package.json / package-lock.json / src-tauri/Cargo.toml / src-tauri/Cargo.lock（idea-tree）/
// src-tauri/tauri.conf.json / README.md。CHANGELOG.md は、変更内容を書く必要があるので、手で更新する。

import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("使い方: node scripts/set-version.mjs 0.6.4");
  process.exit(1);
}

/** ファイルの内容を、関数で書き換える。書き換えられなかったら、エラーにする */
function edit(path, replace) {
  const before = readFileSync(path, "utf8");
  const after = replace(before);
  if (after === before && !before.includes(version)) {
    console.error(`バージョンを書き換えられませんでした: ${path}`);
    process.exit(1);
  }
  writeFileSync(path, after);
  console.log(`更新: ${path}`);
}

const json = (text) => {
  const data = JSON.parse(text);
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  return JSON.stringify(data, null, 2) + "\n";
};

edit("package.json", json);
edit("package-lock.json", json);
// 手で整えた書式（配列の改行など）を崩さないよう、tauri.conf.json は、文字列の置き換えにする
edit("src-tauri/tauri.conf.json", (text) => text.replace(/^( {2}"version": )".*"/m, `$1"${version}"`));
edit("src-tauri/Cargo.toml", (text) => text.replace(/^version = ".*"$/m, `version = "${version}"`));
edit("src-tauri/Cargo.lock", (text) =>
  text.replace(/(name = "idea-tree"\nversion = )".*"/, `$1"${version}"`),
);
edit("README.md", (text) => text.replace(/現在のバージョン: \*\*[\d.]+\*\*/, `現在のバージョン: **${version}**`));
