// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    // In this npm-workspaces monorepo eslint-plugin-import cannot load the TypeScript resolver,
    // so its resolution rules report false errors. `tsc --noEmit` already verifies every import.
    rules: {
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/named': 'off',
      'import/no-duplicates': 'off',
      'import/default': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/export': 'off',
    },
  },
]);
