import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src-tauri", "coverage", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // tsconfig の lib（ES2020）に Error の cause がないため、エラーの原因は、メッセージに含めている
      "preserve-caught-error": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // 基本の2つだけを使う（最新の ref を描画中に更新する書き方は、意図して使っている）
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  { files: ["scripts/**/*.mjs", "*.config.js"], languageOptions: { globals: globals.node } },
);
