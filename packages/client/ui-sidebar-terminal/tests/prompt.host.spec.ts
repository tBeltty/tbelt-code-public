/** Host-half coverage for the guidance paired with the conversation's Run action. */
import { readFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { apply, inject } from '../src/index.ts'

let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

it('registers user-run command guidance only while mounted', async () => {
  ctx = new Context()
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  const mounted = ctx.plugin({ apply, inject })
  await mounted.await()

  const section = (await ctx.systemPrompt.assemble()).sections.find(entry => entry.name === 'ui:user-run-commands')
  expect(section?.text).toBe('When a command needs the user\'s own permissions, such as one your sandbox or approval policy blocked, one that needs sudo or the user\'s credentials, or one that must change files outside the workspace, write it in a ```bash fenced block and ask the user to run it. The user can run each bash, sh, zsh, or shell block from the conversation: it runs in their default shell in a terminal beside the conversation, where they can answer prompts such as a password, and its exit status and final output arrive as the user\'s next message. Put one complete command or script in each block. Run commands yourself whenever your tools allow it.')
  for (const scenario of ['fresh-round-trip', 'ptc-round']) {
    const sidecar = await readFile(new URL(`../../../../snapshots/web/${scenario}/system-prompt.expected.md`, import.meta.url), 'utf8')
    expect(sidecar, scenario).toContain(section!.text)
  }

  await mounted.dispose()
  expect((await ctx.systemPrompt.assemble()).sections.some(entry => entry.name === 'ui:user-run-commands')).toBe(false)
})
