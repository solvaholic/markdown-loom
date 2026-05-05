import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/test/**/*.test.js',
  workspaceFolder: './test-fixtures/markdown-loom.code-workspace',
  mocha: {
    ui: 'tdd',
    timeout: 20000,
  },
});
