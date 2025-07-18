import baseConfig from '@mikan/eslint-config/base.js'

export default [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
]
