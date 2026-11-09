#!/usr/bin/env node
/**
 * Fail with a plain-language message before pnpm's own bundled tooling
 * crashes on an unsupported Node version. pnpm >=10 requires Node 22+ to
 * run at all (it imports node:sqlite internally); on Node <22 `pnpm
 * install` fails with an opaque internal stack trace instead of naming
 * the actual cause. Run this with the system `node` directly, before
 * invoking pnpm, since pnpm itself cannot get far enough to report the
 * problem on an unsupported runtime.
 */
const REQUIRED = 'Node.js ^22.19.0 or >=24.0.0'
const [major, minor] = process.versions.node.split('.').map(Number)
const satisfies = major >= 24 || (major === 22 && minor >= 19)

if (!satisfies) {
  console.error(`
tBelt Code requires ${REQUIRED}. Detected: v${process.versions.node}.

Install a supported version, then re-run this command:
  nvm:      nvm install 22 && nvm use 22
  fnm:      fnm install 22 && fnm use 22
  Homebrew: brew install node@22 && export PATH="$(brew --prefix node@22)/bin:$PATH"
`)
  process.exit(1)
}
