import js from '@eslint/js';
import { globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(globalIgnores(['dist/**', 'node_modules/**']), js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['**/*.{ts,tsx}'],
  plugins: { 'react-hooks': reactHooks },
  rules: { ...reactHooks.configs.recommended.rules, '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
});
