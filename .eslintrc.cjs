module.exports = {
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    quotes: ['error', 'single'],
    semi: ['error', 'never'],
    'comma-dangle': ['error', 'never'],
    'no-unused-vars': 'warn',
    'no-console': 'off',
    'no-undef': 'error' // ✔️ Essa garante erro quando variável não existe
  }
}