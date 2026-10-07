import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type { PermissionRule } from '@deepseek-ai/dsh-permission-rules'
import { afterEach, describe, expect, it } from 'vitest'
import AgentPreset from '../src/index.ts'
import { harness } from '../../agent-preset-registry/tests/harness.ts'
import AgentPresetMarkdown, { composeAgent, parseAgentFile } from '../src/markdown.ts'

describe('parseAgentFile', () => {
  it('reads front matter and the prompt body', () => {
    const file = parseAgentFile('reviewer', '---\nname: Reviewer\ndescription: Reads diffs\norder: 4\nextends: standard\n---\n\nReview only.\n')
    expect(file).toEqual({ id: 'reviewer', name: 'Reviewer', description: 'Reads diffs', order: 4, extends: 'standard', prompt: 'Review only.', rules: [] })
  })

  it('accepts a file without front matter, with CRLF, and with an empty block', () => {
    expect(parseAgentFile('a', 'Just a prompt').prompt).toBe('Just a prompt')
    expect(parseAgentFile('a', '---\r\nname: A\r\n---\r\nBody\r\n')).toMatchObject({ name: 'A', prompt: 'Body' })
    expect(parseAgentFile('a', '---\n---\nBody')).toMatchObject({ prompt: 'Body' })
    expect(parseAgentFile('a', '---\n\n\n---').prompt).toBe('')
  })

  it('turns permission entries into rules scoped to the agent, later entries winning', () => {
    const file = parseAgentFile('reviewer', [
      '---',
      'permission:',
      '  edit: deny',
      '  bash:',
      '    "*": allow',
      '    "git push*": ask',
      '---',
    ].join('\n'))
    const expected: PermissionRule[] = [
      { priority: 3, match: { tool: 'edit', agent: 'reviewer' }, outcome: 'deny' },
      { priority: 2, match: { tool: 'bash', agent: 'reviewer' }, outcome: 'allow' },
      { priority: 1, match: { tool: 'bash', agent: 'reviewer', commandPattern: 'git push*' }, outcome: 'ask' },
    ]
    expect(file.rules).toEqual(expected)
  })

  it.each([
    ['Bad_Id', '', 'not a valid agent id'],
    ['a', '---\nmodel: x\n---', 'unknown front matter key "model"'],
    ['a', '---\n- x\n---', 'front matter must be a YAML map'],
    ['a', '---\nname: 3\n---', 'name must be a non-empty string'],
    ['a', '---\ndescription: " "\n---', 'description must be a non-empty string'],
    ['a', '---\norder: first\n---', 'order must be a number'],
    ['a', '---\npermission: deny\n---', 'permission must be a map'],
    ['a', '---\npermission:\n  edit: maybe\n---', 'permission.edit must be one of'],
    ['a', '---\npermission:\n  bash:\n    "rm *": 3\n---', 'permission.bash.rm * must be one of'],
    ['a', '---\npermission:\n  bash:\n    "rm [": deny\n---', 'not a valid pattern'],
  ])('rejects %s with %s', (id, text, message) => {
    expect(() => parseAgentFile(id, text)).toThrow(message)
  })
})

describe('composeAgent', () => {
  const base: PresetDefinition = { id: 'standard', name: 'Standard', plugins: [{ name: 'tool' }] }
  const file = (prompt: string) => parseAgentFile('reviewer', prompt === '' ? '---\nname: Reviewer\norder: 1\ndescription: D\n---' : `---\nname: Reviewer\norder: 1\ndescription: D\n---\n${prompt}`)

  it('keeps the base plugins when the file has no prompt', () => {
    expect(composeAgent(file(''), base)).toEqual({ id: 'reviewer', name: 'Reviewer', description: 'D', order: 1, plugins: [{ name: 'tool' }] })
  })

  it('adds a persona row when the base has none', () => {
    expect(composeAgent(file('Be brief.'), base).plugins).toEqual([
      { name: 'tool' },
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Be brief.' } },
    ])
  })

  it('replaces only the prefix of the base persona row', () => {
    const withPersona: PresetDefinition = { id: 'minimal', plugins: [{ id: 'p', name: '@deepseek-ai/dsh-persona', config: { prefix: 'old', complete: true } }, { name: 'tool' }] }
    expect(composeAgent(parseAgentFile('x', 'New.'), withPersona)).toEqual({
      id: 'x',
      plugins: [{ id: 'p', name: '@deepseek-ai/dsh-persona', config: { prefix: 'New.', complete: true } }, { name: 'tool' }],
    })
    const bare: PresetDefinition = { id: 'minimal', plugins: [{ name: '@deepseek-ai/dsh-persona' }] }
    expect(composeAgent(parseAgentFile('x', 'New.'), bare).plugins).toEqual([{ name: '@deepseek-ai/dsh-persona', config: { prefix: 'New.' } }])
  })
})

describe('AgentPresetMarkdown plugin', () => {
  let root: string | undefined
  let ctx: Context | undefined
  afterEach(async () => {
    await ctx?.fiber.dispose()
    ctx = undefined
    if (root !== undefined) await rm(root, { recursive: true, force: true })
    root = undefined
  })

  async function boot(files: Record<string, string>, config: { dirs?: string[]; extends?: string } = { extends: 'standard' }) {
    root = await mkdtemp(join(tmpdir(), 'dsh-agent-markdown-'))
    await mkdir(join(root, 'agents'))
    await writeFile(join(root, 'agents', 'ignored.txt'), 'not markdown')
    await mkdir(join(root, 'agents', 'nested.md'))
    for (const [name, text] of Object.entries(files)) await writeFile(join(root, 'agents', name), text)
    const registered = new Map<string, PresetDefinition>([['standard', { id: 'standard', plugins: [{ name: 'tool' }] }]])
    const disposed: string[] = []
    const contributed: (readonly PermissionRule[])[] = []
    const warnings: string[] = []
    ctx = new Context()
    ctx.provide('agentPresets', {
      definitionOf: (id: string) => registered.get(id),
      register: async (definition: PresetDefinition) => {
        if (registered.has(definition.id)) throw new Error(`Duplicate agent preset: ${definition.id}`)
        registered.set(definition.id, definition)
        return async () => { disposed.push(definition.id) }
      },
    })
    ctx.provide('permissionRules', {
      get: () => [],
      contribute: (rules: readonly PermissionRule[]) => {
        contributed.push(rules)
        return () => { disposed.push(`rules:${rules[0]?.match.agent}`) }
      },
    })
    ctx.logger.warn = (message: unknown) => { warnings.push(String(message)) }
    await ctx.plugin(AgentPresetMarkdown, { dirs: [join(root, 'agents')], ...config })
    return { registered, disposed, contributed, warnings }
  }

  it('registers one preset per file and contributes its rules, and releases both on dispose', async () => {
    const seen = await boot({
      'reviewer.md': '---\ndescription: Reads\npermission:\n  edit: deny\n---\nReview.',
      'plain.md': 'Plain.',
    })
    expect([...seen.registered.keys()]).toEqual(['standard', 'plain', 'reviewer'])
    expect(seen.registered.get('reviewer')?.plugins).toHaveLength(2)
    expect(seen.contributed).toHaveLength(1)
    expect(seen.warnings).toEqual([])
    await ctx?.fiber.dispose()
    expect(seen.disposed.sort()).toEqual(['plain', 'reviewer', 'rules:reviewer'])
  })

  it('skips a file that fails, naming it, and keeps the others', async () => {
    const seen = await boot({
      'good.md': 'Good.',
      'bad.md': '---\nmodel: x\n---',
      'Bad_Name.md': 'x',
      'orphan.md': '---\nextends: missing\n---',
      'standard.md': 'clashes with the base id',
    })
    expect([...seen.registered.keys()]).toEqual(['standard', 'good'])
    expect(seen.warnings).toHaveLength(4)
    expect(seen.warnings.join('\n')).toMatch(/bad\.md skipped: unknown front matter key "model"/)
    expect(seen.warnings.join('\n')).toMatch(/base preset "missing" is not declared/)
    expect(seen.warnings.join('\n')).toMatch(/Duplicate agent preset: standard/)
  })

  it('skips a file when neither it nor the config names a base', async () => {
    const seen = await boot({ 'a.md': 'A' }, {})
    expect(seen.warnings.join('\n')).toMatch(/names no base preset/)
  })

  it('treats a missing directory as empty and rejects relative ones', async () => {
    const seen = await boot({}, { dirs: [join(tmpdir(), 'dsh-agent-markdown-missing-dir')], extends: 'standard' })
    expect(seen.registered.size).toBe(1)
    const relative = new AgentPresetMarkdown(new Context(), { dirs: ['relative'] })
    await expect(relative[Service.init]().next()).rejects.toThrow('must be an absolute path')
    const file = new AgentPresetMarkdown(new Context(), { dirs: [join(root as string, 'agents', 'ignored.txt')] })
    await expect(file[Service.init]().next()).rejects.toThrow('ENOTDIR')
  })
})

describe('AgentPresetMarkdown in a Loader composition', () => {
  it('finds the base preset declared by the row before it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-agent-markdown-loader-'))
    const ctx = await harness()
    try {
      await writeFile(join(root, 'reviewer.md'), '---\ndescription: Reads\n---\nReview.')
      const contributed: (readonly PermissionRule[])[] = []
      ctx.provide('permissionRules', { get: () => [], contribute: (rules: readonly PermissionRule[]) => { contributed.push(rules); return () => {} } })
      ctx.loader.builtins.preset = AgentPreset
      ctx.loader.builtins.markdown = AgentPresetMarkdown
      await ctx.loader.root.update([
        { id: 'preset-standard', name: 'cordis:preset', config: { id: 'standard', plugins: [] } },
        { id: 'agents', name: 'cordis:markdown', config: { extends: 'standard', dirs: [root] } },
      ])
      await ctx.loader.await()
      expect((await ctx.agentPresets.list()).map(row => row.id)).toEqual(['reviewer', 'standard'])
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
