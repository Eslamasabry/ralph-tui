/**
 * ABOUTME: ESLint configuration for ralph-tui
 * Uses ESLint 9 flat config format with TypeScript support.
 */

import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

const opentuiText = {
  rules: {
    'no-invalid-text-children': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow invalid OpenTUI <text> children',
        },
        schema: [],
        messages: {
          invalidChild:
            'OpenTUI <text> children must be strings or <span>; avoid {{reason}}.',
        },
      },
      create(context) {
        const allowedJsxChildren = new Set(['span', 'StyledText']);

        const unwrapExpression = (expression) => {
          let current = expression;
          while (current) {
            if (current.type === 'TSAsExpression' ||
              current.type === 'TSTypeAssertion' ||
              current.type === 'TSNonNullExpression' ||
              current.type === 'TSInstantiationExpression' ||
              current.type === 'ChainExpression') {
              current = current.expression;
              continue;
            }
            break;
          }
          return current;
        };

        const getJsxName = (nameNode) => {
          if (!nameNode) return null;
          if (nameNode.type === 'JSXIdentifier') return nameNode.name;
          return null;
        };

        const isTextElement = (node) =>
          node?.openingElement && getJsxName(node.openingElement.name) === 'text';

        const isAllowedJsxElement = (node) => {
          if (!node?.openingElement) return false;
          const name = getJsxName(node.openingElement.name);
          return Boolean(name && allowedJsxChildren.has(name));
        };

        const isMapCall = (expression) => {
          if (!expression || expression.type !== 'CallExpression') return false;
          const callee = expression.callee;
          return callee?.type === 'MemberExpression' &&
            callee.property?.type === 'Identifier' &&
            callee.property.name === 'map';
        };

        const isNonStringLiteral = (expression) => {
          if (!expression || expression.type !== 'Literal') return false;
          if (typeof expression.value === 'string') return false;
          return expression.value === null ||
            typeof expression.value === 'number' ||
            typeof expression.value === 'boolean' ||
            typeof expression.value === 'bigint';
        };

        const getInvalidExpressionReason = (expression) => {
          const unwrapped = unwrapExpression(expression);
          if (!unwrapped) return null;
          if (unwrapped.type === 'LogicalExpression') {
            return 'logical &&/|| expressions';
          }
          if (unwrapped.type === 'ArrayExpression') {
            return 'array expressions';
          }
          if (unwrapped.type === 'ObjectExpression') {
            return 'object expressions';
          }
          if (unwrapped.type === 'JSXFragment') {
            return 'fragments';
          }
          if (unwrapped.type === 'JSXElement') {
            if (isTextElement(unwrapped)) {
              return 'nested <text> elements';
            }
            if (!isAllowedJsxElement(unwrapped)) {
              return 'non-<span> JSX elements';
            }
          }
          if (isMapCall(unwrapped)) {
            return 'map() results';
          }
          if (isNonStringLiteral(unwrapped)) {
            return 'non-string literals';
          }
          if (unwrapped.type === 'ConditionalExpression') {
            const consequentReason = getInvalidExpressionReason(unwrapped.consequent);
            if (consequentReason) {
              return `conditional branches with ${consequentReason}`;
            }
            const alternateReason = getInvalidExpressionReason(unwrapped.alternate);
            if (alternateReason) {
              return `conditional branches with ${alternateReason}`;
            }
          }
          return null;
        };

        const reportInvalidChild = (node, reason) => {
          context.report({
            node,
            messageId: 'invalidChild',
            data: { reason },
          });
        };

        const checkChild = (child) => {
          if (child.type === 'JSXText') return;
          if (child.type === 'JSXFragment') {
            reportInvalidChild(child, 'fragments');
            return;
          }
          if (child.type === 'JSXElement') {
            if (isTextElement(child)) {
              reportInvalidChild(child, 'nested <text> elements');
              return;
            }
            if (!isAllowedJsxElement(child)) {
              reportInvalidChild(child, 'non-<span> JSX elements');
            }
            return;
          }
          if (child.type === 'JSXExpressionContainer') {
            const reason = getInvalidExpressionReason(child.expression);
            if (reason) {
              reportInvalidChild(child, reason);
            }
            return;
          }
          if (child.type === 'JSXSpreadChild') {
            reportInvalidChild(child, 'spread children');
          }
        };

        return {
          JSXElement(node) {
            if (!isTextElement(node)) return;
            node.children.forEach(checkChild);
          },
        };
      },
    },
  },
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'opentui-text': opentuiText,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'opentui-text/no-invalid-text-children': 'warn',
      'no-console': 'off',
    },
  },
];
