/**
 * Pure matching of `commandPattern` against compound shell lines and of
 * `match.agent` against the caller's preset id.
 */

import { describe, expect, it } from 'vitest'
import { commandSegments, evaluateCall, matchRule } from '@deepseek-ai/dsh-permission-rules'
import type { PermissionRule } from '@deepseek-ai/dsh-permission-rules'

const push = (outcome: PermissionRule['outcome']): PermissionRule => ({ priority: 0, match: { tool: 'bash', commandPattern: 'git push*' }, outcome })

describe('commandSegments', () => {
  it('splits chains, pipes, and lists into one text per command', () => {
    expect(commandSegments('git status && git push origin main | cat; ls -la')).toEqual(['git status', 'git push origin main', 'cat', 'ls -la'])
  })

  it('returns undefined for invalid shell syntax and for an empty line', () => {
    expect(commandSegments('echo "unterminated')).toBeUndefined()
    expect(commandSegments('')).toBeUndefined()
  })
})

describe('commandPattern over compound command lines', () => {
  it('a deny or ask rule fires when any one command of the line matches', () => {
    for (const outcome of ['deny', 'ask'] as const) {
      expect(matchRule([push(outcome)], 'bash', 'git status && git push origin main')).toBeDefined()
      expect(matchRule([push(outcome)], 'bash', 'git status && git log')).toBeUndefined()
    }
  })

  it('a deny rule still fires on a line that does not parse when the whole text matches', () => {
    expect(matchRule([push('deny')], 'bash', 'git push "origin')).toBeDefined()
  })

  it('an allow rule fires only when every command of the line matches', () => {
    const allow: PermissionRule = { priority: 0, match: { tool: 'bash', commandPattern: 'git status*' }, outcome: 'allow' }
    expect(matchRule([allow], 'bash', 'git status')).toBeDefined()
    expect(matchRule([allow], 'bash', 'git status --short')).toBeDefined()
    expect(matchRule([allow], 'bash', 'git status && rm -rf build')).toBeUndefined()
    expect(matchRule([allow], 'bash', 'git status "unterminated')).toBeUndefined()
  })

  it('an unmatched allow no longer overrides the destructive-command classifier on a chained line', () => {
    const allow: PermissionRule = { priority: 0, match: { tool: 'bash', commandPattern: 'ls*' }, outcome: 'allow' }
    expect(evaluateCall([allow], 'bash', { command: 'ls && rm -rf /' }).outcome).toBe('ask')
  })
})

describe('match.agent', () => {
  const reviewer: PermissionRule = { priority: 0, match: { tool: 'bash', agent: 'review*', commandPattern: 'git push*' }, outcome: 'deny' }

  it('matches only a caller whose preset id matches the pattern', () => {
    expect(matchRule([reviewer], 'bash', 'git push', 'reviewer')).toBeDefined()
    expect(matchRule([reviewer], 'bash', 'git push', 'coder')).toBeUndefined()
  })

  it('never matches a caller with no preset', () => {
    expect(matchRule([reviewer], 'bash', 'git push')).toBeUndefined()
  })

  it('a rule without match.agent applies to every caller', () => {
    expect(matchRule([push('ask')], 'bash', 'git push', 'coder')).toBeDefined()
  })
})
