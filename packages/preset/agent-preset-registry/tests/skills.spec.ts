/** Skill visibility declared by an agent preset. */
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { agentOn, contribution, declare, harness } from './harness.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function setup(withSkills = true) {
  const ctx = await harness()
  contexts.push(ctx)
  if (withSkills) {
    await ctx.plugin(SkillRegistry)
    ctx.skills.register({ name: 'fetch', description: 'Fetch pages', source: 'runtime', content: 'Fetch body.' })
    ctx.skills.register({ name: 'deploy', description: 'Deploy builds', source: 'runtime', content: 'Deploy body.' })
  }
  return ctx
}

describe('agent preset skill visibility', () => {
  it('shows an agent of a preset with a skill list only the listed skills', async () => {
    const ctx = await setup()
    await declare(ctx, contribution('standard'))
    await declare(ctx, { ...contribution('standard'), id: 'reviewer', skills: ['fetch'] })
    const reviewer = await agentOn(ctx, 'reviewer-agent', 'reviewer')
    const plain = await agentOn(ctx, 'plain-agent')
    const names = async (scope: object) => (await ctx.skills.list({ scope })).map(skill => skill.name).sort()

    expect(await names(scopeOf(reviewer.ctx) as object)).toEqual(['fetch'])
    expect(await names(scopeOf(plain.ctx) as object)).toEqual(['deploy', 'fetch'])
    expect((await ctx.skills.list()).map(skill => skill.name).sort()).toEqual(['deploy', 'fetch'])
    expect((await ctx.skills.get('deploy', { scope: scopeOf(reviewer.ctx) as object }))).toBeUndefined()
    expect((await ctx.skills.get('fetch', { scope: scopeOf(reviewer.ctx) as object }))?.content).toBe('Fetch body.')
  })

  it('hides every skill from an agent of a preset with an empty list', async () => {
    const ctx = await setup()
    await declare(ctx, { ...contribution('standard'), id: 'silent', skills: [] })
    const silent = await agentOn(ctx, 'silent-agent', 'silent')
    expect(await ctx.skills.list({ scope: scopeOf(silent.ctx) as object })).toEqual([])
  })

  it('reports a preset with a skill list as broken when no skills service is installed', async () => {
    const ctx = await setup(false)
    await declare(ctx, { ...contribution('standard'), id: 'reviewer', skills: ['fetch'] })
    const row = (await ctx.agentPresets.list()).find(entry => entry.id === 'reviewer')
    expect(row?.broken).toContain('skills service is not available')
  })
})
