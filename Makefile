# IdeaTree の開発コマンド入口（OboeGaki と同じ流儀）。`make help` で一覧が出る。

.PHONY: version help setup dev test test-cov test-rust test-rust-cov check app dmg icon

help:             ## コマンドの一覧
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | sed -E 's/:[^#]*## /\t/' | sort

setup:            ## 初回セットアップ（依存パッケージのインストール）
	npm install

dev:              ## アプリを起動（Tauri dev）。初回は Rust のビルドで数分かかる
	npm run tauri dev

test:             ## フロントエンドのテスト
	npx vitest run

test-cov:         ## フロントエンドのテスト（カバレッジ付き。閾値 95%）
	npx vitest run --coverage

test-rust:        ## Rust 側のテスト
	cd src-tauri && cargo test

test-rust-cov:    ## Rust 側のテスト（カバレッジ付き。要 cargo install cargo-llvm-cov）
	cd src-tauri && cargo llvm-cov --summary-only --ignore-filename-regex '(lib|main)\.rs'

check:            ## コミット前チェック（型 + テスト + Rust の整形・clippy・テスト）
	npx tsc --noEmit
	npx vitest run --coverage
	cd src-tauri && cargo fmt --check
	cd src-tauri && cargo clippy --all-targets -- -D warnings
	cd src-tauri && cargo test

# DMG まで要らないときは app を使う。tauri build は既定で .app と DMG の両方を組むので、
# `--bundles app` で .app だけにする。フロントの組み直し（beforeBuildCommand）はどちらでも走る。
APP := src-tauri/target/release/bundle/macos/IdeaTree.app

app:              ## アプリ（.app）を組む。DMG は作らない
	npm run tauri build -- --bundles app
	@echo "アプリ: $(APP)"
	@echo "開く:   open $(APP)"
	@echo "※ 署名・公証はまだ。初回は右クリック →「開く」で Gatekeeper を通す"

dmg:              ## インストール用の DMG を作る（.app も一緒に組まれる）
	npm run tauri build
	@echo "DMG: src-tauri/target/release/bundle/dmg/"
	@echo "※ 署名・公証はまだ（Apple Developer アカウント取得後）"

version:          ## バージョンをすべての場所で書き換える（例: make version V=0.6.4）
	@test -n "$(V)" || (echo "使い方: make version V=0.6.4" && exit 1)
	node scripts/set-version.mjs $(V)

icon:             ## アプリのアイコンを描き直して全サイズを作る（scripts/make_icon.swift）
	swift scripts/make_icon.swift src-tauri/icons/icon-source.png
	npx tauri icon src-tauri/icons/icon-source.png -o src-tauri/icons
	@# macOS 専用のアプリなので、モバイル用のアイコンは要らない
	rm -rf src-tauri/icons/android src-tauri/icons/ios

