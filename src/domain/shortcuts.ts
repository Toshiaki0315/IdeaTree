export interface ShortcutItem {
  /** キーや操作（表示用） */
  keys: string;
  description: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

/** ショートカット一覧（`Cmd + /` で表示する）。README と docs/spec.md の操作の一覧と、同じ内容にする */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "ノードの追加・編集",
    items: [
      { keys: "Tab", description: "子ノードを追加" },
      { keys: "Enter", description: "兄弟ノードを追加（入力中は確定）" },
      { keys: "Shift + Enter", description: "入力中に、ラベルの改行（Enter で確定）" },
      { keys: "F2", description: "テキストを編集（ダブルクリックでも可）" },
      { keys: "Escape", description: "入力・ドラッグ・複数選択を取り消す" },
      { keys: "Delete / Backspace", description: "ノードを削除（子孫ごと）" },
    ],
  },
  {
    title: "選択・移動",
    items: [
      { keys: "← → ↑ ↓", description: "親 / 最初の子 / 前の兄弟 / 次の兄弟へ移動" },
      {
        keys: "Shift + ← → ↑ ↓",
        description: "選択を広げる（複数選択）。手動配置の移動・自動配置に戻す操作は、選択したすべてに効く",
      },
      { keys: "クリック", description: "ノードを選択" },
      { keys: "Shift + クリック", description: "複数選択に、加える / 外す" },
      { keys: "Option + ↑ / ↓", description: "兄弟の順序を入れ替える" },
      { keys: "Option + → / ←", description: "インデント / アウトデント" },
      { keys: "Cmd + Option + 矢印キー", description: "選択ノードと子孫を、20 ずつ動かす（手動配置）" },
      {
        keys: "Cmd + Shift + R",
        description: "手動配置を、自動配置に戻す（選択ノードと子孫。中心ノードなら、すべて）",
      },
      { keys: "ドラッグ", description: "別のノードの上に落として、その子につなぎ替え（Escape で取り消し）" },
      { keys: "Shift + ドラッグ", description: "兄弟の上に落として、その位置に入れ替え" },
      { keys: "Space", description: "子孫を折りたたむ / 展開する" },
    ],
  },
  {
    title: "編集操作",
    items: [
      { keys: "Cmd + Z", description: "元に戻す" },
      { keys: "Cmd + Shift + Z", description: "やり直す" },
      {
        keys: "Cmd + C / V / X",
        description: "コピー / ペースト / カット（テキストを貼ると、1 行 1 ノード）",
      },
      { keys: "Cmd + B / I", description: "太字 / 斜体" },
      {
        keys: "Cmd + R",
        description: "関連線: 結ぶ先を矢印キーで選び、Enter で確定（もう一度で解除）、Escape で取り消し",
      },
      {
        keys: "Cmd + L",
        description: "メモとリンクのパネルを開く / 閉じる（ノードに、補足の文章と URL を付ける）",
      },
      { keys: "Cmd + Shift + L", description: "選択ノードのリンクを、ブラウザで開く" },
      { keys: "Cmd + K", description: "スタイルパネル（色・フォント・文字サイズ・アイコン・画像）" },
      { keys: "Cmd + Shift + I", description: "画像を選んで設定（中心ノードなら、セントラルイメージ）" },
    ],
  },
  {
    title: "ファイル",
    items: [
      { keys: "Cmd + S", description: "保存（保存先が決まっていれば上書き）" },
      { keys: "Cmd + Shift + S", description: "名前を付けて保存" },
      { keys: "Cmd + O", description: "ファイルを開く（.md・.txt のアウトラインは、取り込み）" },
      { keys: "Cmd + Shift + O", description: "最近使ったファイルから開く（↑↓で選び、Enter で開く）" },
      {
        keys: "Cmd + Shift + E",
        description: "SVG・PNG・PDF・アウトラインとして書き出し（拡張子で形式を選ぶ）",
      },
    ],
  },
  {
    title: "表示",
    items: [
      { keys: "Cmd + = / Cmd + - / Cmd + 0", description: "拡大 / 縮小 / 元に戻す" },
      { keys: "Cmd + Shift + 0", description: "全体表示（マップ全体が収まるよう、表示を合わせる）" },
      { keys: "ホイール・何もない場所のドラッグ", description: "表示位置を動かす（パン）" },
      {
        keys: "Cmd + F",
        description: "ノードを検索（Enter / Shift + Enter で次 / 前の一致、Escape で閉じる）",
      },
      { keys: "Cmd + ,", description: "設定（テーマ: 自動・ライト・ダーク）" },
      { keys: "Cmd + /", description: "ショートカット一覧を開く / 閉じる" },
    ],
  },
];
