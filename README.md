# IdeaTree

現在のバージョン: **0.6.5**（変更点は [CHANGELOG.md](CHANGELOG.md)）

TypeScript と Rust (Tauri) で開発する、macOS 向けのマインドマップツールです。トニー・ブザンのマインドマップの法則に忠実な描画と、キーボードだけで完結する操作性を目指します。

## リポジトリ
https://github.com/Toshiaki0315/IdeaTree.git

## 特徴
- **トニー・ブザンの法則**: 中心から放射状に広がる有機的な曲線のブランチ、1 ブランチ 1 ワード、メインブランチごとのカラフルな配色、中心ノードを再現します。
- **キーボードファースト**: ノードの追加・編集・移動・削除・折りたたみ・コピー & ペースト・元に戻す/やり直す・スタイル変更まで、マウスなしで操作できます（クリックにも対応）。
- **ノードのスタイル**: 太字・斜体・色・フォント・文字サイズ・アイコン・画像を、ノードごとに設定できます。
- **保存と書き出し**: JSON でプロジェクトを保存して再編集でき、SVG のベクター画像、PNG の画像、PDF として書き出せます。編集中の内容は、自動で一時保存され、アプリが落ちても、次の起動で復元できます。
- **高い品質**: TDD（テスト駆動開発）を徹底し、フロントエンドのテストカバレッジは 100% を維持しています（最低要件は 95%）。

## 使い方
起動すると、中心に「中心テーマ」が表示されます。キーボードで操作します。

| キー | 動作 |
| --- | --- |
| `Tab` | 子ノードを追加 |
| `Enter` | 兄弟ノードを追加（入力中は確定） |
| `Shift + Enter` | 入力中に、ラベルの改行 |
| `F2` / ダブルクリック | テキストを編集 |
| `Escape` | 入力を取り消す |
| `→` `←` `↓` `↑` | 最初の子 / 親 / 次の兄弟 / 前の兄弟へ移動 |
| `Delete` / `Backspace` | ノードを削除（サブツリーごと） |
| `Option + ↑` `↓` / `→` `←` | 兄弟の順序の入れ替え / インデント / アウトデント |
| ドラッグ | ノードを別のノードの上に落として、その子につなぎ替え。`Shift` を押しながら兄弟の上に落とすと、その位置に入れ替え（`Escape` で取り消し） |
| `Space` | 折りたたむ / 展開する |
| `Cmd + C` / `V` / `X` | コピー / ペースト / カット（サブツリーごと。システムのクリップボード経由で、他のウィンドウとも、やり取りできる。テキストを貼ると、1 行 1 ノードになる） |
| `Cmd + Z` / `Cmd + Shift + Z` | 元に戻す / やり直す |
| `Cmd + B` / `Cmd + I` | 太字 / 斜体 |
| `Cmd + K` | スタイルパネル（色・フォント・文字サイズ・アイコン・画像）を開閉 |
| `Cmd + Shift + I` | 画像を選んで、選択ノードに設定（中心ノードなら、セントラルイメージ） |
| `Cmd + S` | 保存（保存先が決まっていれば上書き） |
| `Cmd + Shift + S` | 名前を付けて保存 |
| `Cmd + O` | ファイルを開く |
| `Cmd + Shift + O` | 最近使ったファイルから開く |
| `Cmd + Shift + E` | 書き出し（SVG・PNG・PDF。拡張子で形式を選ぶ） |
| `Cmd + =` / `Cmd + -` / `Cmd + 0` | 拡大 / 縮小 / 元に戻す（ホイール・ドラッグでパン） |
| `Cmd + Shift + 0` | 全体表示（マップ全体が収まるよう、表示を合わせる） |
| `Cmd + F` | ノードを検索（`Enter` で次の一致へ） |
| `Cmd + /` | ショートカット一覧を開く / 閉じる |

詳しい仕様は [docs/spec.md](docs/spec.md) を参照してください。

## 技術スタック
- フロントエンド: TypeScript, React, Vite（描画は SVG）
- バックエンド: Rust, Tauri 2（ファイルの読み書き、ダイアログ）
- テスト: Vitest / React Testing Library（フロントエンド）、Cargo test（バックエンド）

## 開発
### 必要なもの
- Node.js と npm
- Rust（`cargo`）と、Tauri の前提環境（macOS では Xcode Command Line Tools）

### コマンド
`make help` で一覧が出ます。

```bash
make setup      # 初回セットアップ（npm install）
make dev        # アプリを起動（Tauri dev。初回は Rust のビルドで数分かかる）
make test       # フロントエンドのテスト
make test-cov   # カバレッジ付きでテスト（閾値 95%）
make test-rust  # バックエンド（Rust）のテスト
make test-rust-cov  # Rust のテスト（カバレッジ付き。要 cargo install cargo-llvm-cov）
make format     # ソースを整形する（Prettier）
make check      # コミット前チェック（型 + lint + 整形 + テスト + Rust の整形・clippy・テスト）
make version V=0.6.4  # バージョンを、すべての場所で書き換える（CHANGELOG は手で更新）
make app        # アプリ（.app）を組む → src-tauri/target/release/bundle/macos/IdeaTree.app
make dmg        # インストール用の DMG を作る → src-tauri/target/release/bundle/dmg/
make icon       # アプリのアイコンを描き直して、全サイズを作る（scripts/make_icon.swift）
```

- `npm run dev` で、フロントエンドだけをブラウザで確認することもできます（ファイルの保存・読み込みなど、Tauri の機能は使えません）。
- 署名・公証はまだです。配布した `.app` は、初回に右クリック →「開く」で Gatekeeper を通します。

### ディレクトリ構成
- `src/domain/` — マインドマップのデータ操作（追加・削除・移動・レイアウト・保存形式・SVG 生成など）。画面や Tauri に依存しない純粋な関数。
- `src/files/` — ファイルの保存・読み込み・書き出し（Tauri のダイアログとコマンドを呼ぶ薄い層）。
- `src/App.tsx`、`src/StylePanel.tsx` — 画面とキーボード操作。
- `src-tauri/src/file_io.rs` — ファイルの読み書き（Rust）。
- `scripts/set-version.mjs` — バージョンを、各ファイルでそろえて書き換えるスクリプト（`make version V=x.y.z`）。
- `scripts/make_icon.swift` — アプリのアイコンの元絵を描くスクリプト（macOS の CoreGraphics のみ。絵を変えるときは、これを直して `make icon`）。

### 開発ルール
- AI エージェント向けの開発ルール（TDD、日本語のコミットメッセージなど）は [claude.md](claude.md) を参照してください。
- ドキュメントは、すべて日本語で記述します。

## ライセンス

[MIT License](LICENSE)
