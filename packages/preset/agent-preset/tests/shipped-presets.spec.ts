/**
 * Shipped Web preset patches: delegation tools use only configuration that `dsh-tool-subagent`
 * accepts, and every preset they select is declared by a patch or a role agent file.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { parseAgentFile } from '../src/markdown.ts'

const patchDir = fileURLToPath(new URL('../../../bundle/web-app/presets/', import.meta.url))
const rolesDir = fileURLToPath(new URL('../presets/roles/', import.meta.url))
const SUBAGENT_MODULE = '@deepseek-ai/dsh-tool-subagent'

interface Row {
  name?: string
  config?: unknown
}

/** Every plugin row (object with a `name`) anywhere in a parsed patch. */
function rows(node: unknown, found: Row[] = []): Row[] {
  if (Array.isArray(node)) {
    for (const item of node) rows(item, found)
  } else if (node !== null && typeof node === 'object') {
    if ('name' in node && typeof node.name === 'string') found.push(node as Row)
    for (const value of Object.values(node)) rows(value, found)
  }
  return found
}

const patches = readdirSync(patchDir).filter(file => file.endsWith('.patch.yml')).map(file => ({
  file,
  // `!!js` expressions are irrelevant to row structure; drop the tag so the document parses.
  rows: rows(load(readFileSync(patchDir + file, 'utf8').replaceAll('!!js ', ''))),
}))
const subagentRows = patches.flatMap(({ file, rows: all }) => all
  .filter(row => row.name === SUBAGENT_MODULE)
  .map(row => ({ file, config: (row.config ?? {}) as Record<string, unknown> })))
const roleIds = readdirSync(rolesDir).filter(file => file.endsWith('.md')).map(file => file.slice(0, -'.md'.length))

describe('shipped Web preset patches', () => {
  it('configure delegation tools without the removed persona and toolFilter fields', () => {
    expect(subagentRows.length).toBeGreaterThan(0)
    for (const { file, config } of subagentRows) {
      expect(config, file).not.toHaveProperty('persona')
      expect(config, file).not.toHaveProperty('toolFilter')
    }
  })

  it('select only presets declared by a patch or a role agent file', () => {
    const declared = new Set<string>(roleIds)
    for (const { rows: all } of patches) {
      for (const row of all) {
        const id = (row.config as { id?: unknown } | undefined)?.id
        if (row.name === '@deepseek-ai/dsh-agent-preset' && typeof id === 'string') declared.add(id)
      }
    }
    for (const { file, config } of subagentRows) {
      const selected = [config.agentPreset, ...(Array.isArray(config.allowedAgentPresets) ? config.allowedAgentPresets as string[] : [])]
      for (const id of selected.filter(value => value !== undefined)) expect(declared, `${file}: ${JSON.stringify(id)}`).toContain(id)
    }
  })
})

describe('shipped role agent files', () => {
  it('parse and extend the standard preset', () => {
    expect(roleIds.sort()).toEqual(['coder', 'inspector', 'tester'])
    for (const id of roleIds) {
      const file = parseAgentFile(id, readFileSync(`${rolesDir}${id}.md`, 'utf8'))
      expect(file.extends).toBe('standard')
      expect(file.prompt).not.toBe('')
    }
  })

  it('keep the Inspector read-only', () => {
    const file = parseAgentFile('inspector', readFileSync(`${rolesDir}inspector.md`, 'utf8'))
    expect(file.rules.map(rule => [rule.match.tool, rule.outcome])).toEqual([
      ['write', 'deny'], ['edit', 'deny'], ['bash', 'deny'], ['pwsh', 'deny'],
    ])
  })
})
