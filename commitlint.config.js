// Enforce Conventional Commits (feat/fix/chore/docs/refactor/test/…) so
// release-please can derive the unified version bump + changelog. Enforced
// locally by the husky commit-msg hook (.husky/commit-msg) and in CI
// (.github/workflows/commitlint.yml). CommonJS: the workspace root is not
// `type: module`.
/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional']
}
