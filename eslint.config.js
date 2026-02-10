import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
    linterOptions: {
      // Ban inline eslint-disable comments project-wide
      reportUnusedDisableDirectives: 'error',
      noInlineConfig: true,
    },
  },
  // Test-specific rules
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Disallow try/catch in tests — use expect().toThrow() patterns instead
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TryStatement',
          message:
            'Do not use try/catch in tests. Use expect().toThrow() or similar assertion patterns.',
        },
      ],
    },
  },
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', '*.config.*'],
  },
);
