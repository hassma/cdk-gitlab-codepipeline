// eslint.config.mjs
import eslintCdkPlugin from 'eslint-cdk-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import tsEslint from 'typescript-eslint';

export default [
	...tsEslint.configs.base,
	eslintConfigPrettier,
	{
		files: ['src/**/*.ts', 'bin/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				project: './tsconfig.json',
			},
		},
		plugins: {
			cdk: eslintCdkPlugin,
		},
		rules: {
			...eslintCdkPlugin.configs.recommended.rules,
			'no-unused-vars': 'off',
		},
	},
];
