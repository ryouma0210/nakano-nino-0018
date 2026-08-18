const eslint = require("@eslint/js");

module.exports = [
  {
    ignores: ["dist/**", "dist-web/**", "release/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        window: "readonly",
      },
    },
  },
];
