// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The engine must stay deterministic and side-effect free: these are the
      // guard rails the whole project depends on, so they are errors, not warnings.
      'no-restricted-globals': [
        'error',
        { name: 'eval', message: 'Forbidden: user input is never executed. See docs/adr/0002.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng from @fw/contracts.' },
        {
          object: 'Date',
          property: 'now',
          message: 'Time must be injected, never read ambiently.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'Forbidden: user input is never compiled. See docs/adr/0002.',
        },
        {
          selector: "CallExpression[callee.name='Function']",
          message: 'Forbidden: user input is never compiled. See docs/adr/0002.',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Test files may assert on values the type checker already knows are safe.
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  prettier,
);
