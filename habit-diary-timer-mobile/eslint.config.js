const expoConfig = require("eslint-config-expo/flat");
const { defineConfig } = require("eslint/config");

module.exports = defineConfig([
  {
    ignores: ["node_modules/**", ".expo/**", ".expo-*/**", ".web-*/**", ".codex-tmp/**", "dist/**", "dist-web-electron/**"],
  },
  expoConfig,
  {
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
