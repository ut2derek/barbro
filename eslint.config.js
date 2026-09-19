// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // `.expo/` i `dist/` generuje Expo przy każdym uruchomieniu — nie nasz kod.
    ignores: ["dist/*", ".expo/*"],
  },
  {
    // Funkcje brzegowe działają w Deno, nie w Node. Importy `jsr:` i `npm:`
    // rozwiązuje Deno w czasie uruchomienia, więc ESLint nigdy ich nie znajdzie
    // w `node_modules` i zgłaszałby błąd przy każdym uruchomieniu.
    files: ["supabase/functions/**/*.ts"],
    rules: {
      "import/no-unresolved": "off",
    },
  },
]);
