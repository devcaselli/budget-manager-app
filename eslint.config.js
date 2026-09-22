// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
  {
    // Fix (post-consolidated-review Major 5, inherited lint debt): specs across the
    // codebase already use a leading-underscore convention for fake/mock params kept
    // only to match a real service's call signature (e.g. `create = vi.fn((_input:
    // CreateBulletRequest) => ...)`), but no-unused-vars never had an argsIgnorePattern
    // wired to honor it, so every one of those params was flagged. The convention is
    // real and used consistently — recognizing it here (spec files only) is a config
    // fix, not a scope change to app code's stricter defaults.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]);
