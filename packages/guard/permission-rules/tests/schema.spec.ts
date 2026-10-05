/**
 * Schema validation coverage: a valid rule table round-trips through the
 * settings/composition schema and {@link validateRuleTable}; an invalid one
 * (bad glob, unknown outcome, a duplicate-priority conflict) is rejected at
 * validation time rather than accepted and left to misbehave at match time.
 */

import { describe, expect, it } from 'vitest'
import {
  Config,
  type PermissionRule,
  resolveRuleOrder,
  validateGlobPattern,
  validateRuleTable,
} from '@deepseek-ai/dsh-permission-rules'

const validRules: PermissionRule[] = [
  { priority: 0, match: { tool: 'tool-bash', commandPattern: 'rm -rf *' }, outcome: 'deny' },
  { priority: 10, match: { tool: 'mcp_*' }, outcome: 'ask', description: 'unreviewed MCP tools' },
  { priority: 20, match: { tool: 'tool-read' }, outcome: 'allow' },
]

/**
 * `Config` validates data arriving from an untyped boundary (parsed YAML/JSON),
 * so its malformed-input tests simulate that boundary explicitly rather than
 * relying on a TypeScript literal, which the static `Config` input type would
 * reject at compile time before the runtime check under test ever ran.
 */
function fromUntyped(value: unknown): ReturnType<typeof Config> {
  return Config(value as Parameters<typeof Config>[0])
}

describe('Config schema: valid table round-trips', () => {
  it('accepts and returns a well-formed rule table unchanged', () => {
    const resolved = Config({ rules: validRules })
    expect(resolved.rules.get()).toEqual(validRules)
  })

  it('defaults to an empty rule table when omitted', () => {
    const resolved = Config({})
    expect(resolved.rules.get()).toEqual([])
  })

  it('does not throw validateRuleTable on the same table', () => {
    expect(() => { validateRuleTable(validRules) }).not.toThrow()
  })
})

describe('Config schema: structural rejection (unknown outcome value)', () => {
  it('rejects a rule whose outcome is not deny/ask/allow', () => {
    expect(() => fromUntyped({
      rules: [{ priority: 0, match: { tool: 'tool-bash' }, outcome: 'maybe' }],
    })).toThrow()
  })

  it('rejects a rule missing its required match.tool', () => {
    expect(() => fromUntyped({
      rules: [{ priority: 0, match: {}, outcome: 'deny' }],
    })).toThrow()
  })

  it('rejects a rule missing its required priority', () => {
    expect(() => fromUntyped({
      rules: [{ match: { tool: 'tool-bash' }, outcome: 'deny' }],
    })).toThrow()
  })
})

describe('validateRuleTable: duplicate priority is a rejected conflict, not silent array-order precedence', () => {
  it('rejects two rules declaring the same priority', () => {
    const conflicting: PermissionRule[] = [
      { priority: 5, match: { tool: 'tool-bash' }, outcome: 'deny' },
      { priority: 5, match: { tool: 'tool-write' }, outcome: 'ask' },
    ]
    expect(() => { validateRuleTable(conflicting) }).toThrow(/both declare priority 5/)
  })

  it('accepts the same two rules once priorities are made distinct', () => {
    const resolved: PermissionRule[] = [
      { priority: 5, match: { tool: 'tool-bash' }, outcome: 'deny' },
      { priority: 6, match: { tool: 'tool-write' }, outcome: 'ask' },
    ]
    expect(() => { validateRuleTable(resolved) }).not.toThrow()
  })

  it('rejects a non-integer priority', () => {
    const rules: PermissionRule[] = [{ priority: 1.5, match: { tool: 'tool-bash' }, outcome: 'deny' }]
    expect(() => { validateRuleTable(rules) }).toThrow(/must be an integer/)
  })
})

describe('validateRuleTable: bad glob is rejected at validation time', () => {
  it('rejects an unbalanced character class in match.tool', () => {
    const rules: PermissionRule[] = [{ priority: 0, match: { tool: 'tool-[bash' }, outcome: 'deny' }]
    expect(() => { validateRuleTable(rules) }).toThrow(/match\.tool/)
  })

  it('rejects an unbalanced brace group in match.commandPattern', () => {
    const rules: PermissionRule[] = [
      { priority: 0, match: { tool: 'tool-bash', commandPattern: 'rm -rf {a,b' }, outcome: 'deny' },
    ]
    expect(() => { validateRuleTable(rules) }).toThrow(/match\.commandPattern/)
  })

  it('rejects an empty match.tool', () => {
    const rules: PermissionRule[] = [{ priority: 0, match: { tool: '' }, outcome: 'deny' }]
    expect(() => { validateRuleTable(rules) }).toThrow(/match\.tool/)
  })

  it('accepts a balanced character class and brace group', () => {
    const rules: PermissionRule[] = [
      { priority: 0, match: { tool: 'tool-[bw]ash', commandPattern: 'rm -rf {a,b}*' }, outcome: 'deny' },
    ]
    expect(() => { validateRuleTable(rules) }).not.toThrow()
  })
})

describe('validateGlobPattern', () => {
  it('flags a closing bracket with no opener', () => {
    expect(validateGlobPattern('tool-bash]')).toMatch(/no matching opener/)
  })

  it('flags an opener never closed', () => {
    expect(validateGlobPattern('tool-{bash')).toMatch(/never closed/)
  })

  it('accepts an escaped bracket character', () => {
    expect(validateGlobPattern(String.raw`tool-\[bash`)).toBeUndefined()
  })

  it('accepts a plain exact tool name', () => {
    expect(validateGlobPattern('tool-bash')).toBeUndefined()
  })
})

describe('resolveRuleOrder', () => {
  it('sorts ascending by priority regardless of input order', () => {
    const shuffled: PermissionRule[] = [validRules[2]!, validRules[0]!, validRules[1]!]
    expect(resolveRuleOrder(shuffled)).toEqual([validRules[0], validRules[1], validRules[2]])
  })

  it('does not mutate the input array', () => {
    const input = [...validRules]
    resolveRuleOrder(input)
    expect(input).toEqual(validRules)
  })
})
