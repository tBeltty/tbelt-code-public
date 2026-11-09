/**
 * Light-CI entry for the locale parity check: exits 1 when a dictionary
 * misses a key that another shipped locale declares.
 */

import { checkLocaleParity } from './locale-parity.ts'

const { files, comparedPairs, problems } = checkLocaleParity()
if (files < 500 || comparedPairs < 75) {
  console.error(`verify-locale-parity: sweep narrowed (${files} files, ${comparedPairs} dictionaries)`)
  process.exit(1)
}
if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`verify-locale-parity: ${problems.length} dictionary problem(s)`)
  process.exit(1)
}
console.log(`verify-locale-parity: ${comparedPairs} translated dictionaries match English`)
