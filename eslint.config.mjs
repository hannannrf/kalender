import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Boundary rules (AGENTS.md section 4). A module may import another module only through its index.
// The per-module allow-lists are added in the slice that creates each module.
const noDeepModuleImports = {
  // From modules/<a>/x.ts, '../<b>/anything' other than '../<b>/index' reaches inside module <b>.
  regex: String.raw`^\.\./(?!\.\.)[^/]+/(?!index$).+`,
  message: 'Import another module only through its index.ts (AGENTS.md section 3).',
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'fixtures/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/**/*.ts', 'api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['server/src/modules/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noDeepModuleImports] }] },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
);
