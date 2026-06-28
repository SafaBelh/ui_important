import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  { ignores: ["dist", ".output", ".vinxi", "node_modules"] },
  js.configs.recommended,

  // The application is JavaScript (JSX) — this block is what actually lints the app.
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Register JSX identifiers as variable references so no-undef catches an
      // undefined <Component>/<Icon> and no-unused-vars stops false-flagging them.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      // Warn (don't fail) on unused vars; ignore intentionally-unused (_x) and UPPER_CASE consts.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^[A-Z_]" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },

  // Keep ESLint out of formatting; Prettier owns that via `npm run format`.
  eslintConfigPrettier,
];
