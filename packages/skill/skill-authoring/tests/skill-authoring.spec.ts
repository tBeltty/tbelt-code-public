import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import * as SkillAuthoring from '@deepseek-ai/dsh-skill-authoring'

describe('dsh-skill-authoring', () => {
  it('registers and disposes the bundled guide', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillAuthoring)
    const resourcePath = fileURLToPath(new URL('../assets/', import.meta.url))

    expect(await ctx.skills.list()).toEqual([{
      name: 'tbelt-skill-authoring',
      description: 'How to create, edit, install, and troubleshoot Agent Skills in tBelt Code. Use when the user asks to add, write, edit, move, remove, or install a skill, asks where skills live or why a skill does not show up, or wants to share a skill between projects.',
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'dsh-skill-authoring',
      source: 'bundled',
      resourceBase: { kind: 'directory', path: resourcePath },
    }])
    const loaded = await ctx.skills.get('tbelt-skill-authoring')
    expect(loaded?.content).toContain('# Creating and editing skills in tBelt Code')
    expect(loaded?.content).not.toMatch(/deepseek|claude|anthropic/i)

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })

  it('is replaced by a user skill of the same name', async () => {
    const home = await mkdtemp(join(tmpdir(), 'skill-authoring-'))
    await mkdir(join(home, 'skills', 'tbelt-skill-authoring'), { recursive: true })
    await writeFile(
      join(home, 'skills', 'tbelt-skill-authoring', 'SKILL.md'),
      '---\nname: tbelt-skill-authoring\ndescription: Mine.\n---\nCustom guide.\n',
    )
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(SkillFilesystem, { dshHome: home, agentsHome: join(home, 'agents'), watch: false })
    await ctx.plugin(SkillAuthoring)

    const loaded = await ctx.skills.get('tbelt-skill-authoring')
    expect(loaded?.source).toBe('user-dsh')
    expect(loaded?.content).toBe('Custom guide.')
  })
})
