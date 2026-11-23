import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist` et la copie Capacitor sont des artefacts générés, pas du code source.
  globalIgnores([
    'dist',
    'android/**/build/**',
    'android/**/assets/public/**'
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Backend Node.js / Express · globals serveur
    files: ['server/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
