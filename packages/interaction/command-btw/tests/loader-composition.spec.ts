import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import * as commandBtw from '../src/index.ts'

/** The external model: answers every call with one fixed text. */
class FixedAdapter extends LlmAdapter {
  override async * stream(): AsyncIterable<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'It sorts the list.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('command-btw real Loader composition', () => {
  it('discovers /btw, answers aside and queues the exchange for the agent', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-btw-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-commands'",
      "- name: '@deepseek-ai/dsh-command-btw'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await mountAgentLoopTestDependencies(context)
    await context.plugin(AgentLoop, { agents: [] })
    context.llm.registerAdapter(['mock'], new FixedAdapter())
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-commands', CommandRuntime],
      ['@deepseek-ai/dsh-command-btw', commandBtw],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    const agent = await context.agentLoop.create(SessionId('loader-command-btw'), { provider: 'mock', model: 'mock' })
    const delivered: UserMessage[] = []
    context.on('agent/inbox/inserted', ({ agent: subject, message }) => {
      if (subject === agent) delivered.push(message)
    })
    expect(context.commands.list(agent).map(row => row.name)).toContain('btw')

    const asked = await context.commands.execute(agent, '/btw what does sort do?', [], new AbortController().signal)
    expect(asked?.result).toEqual({ kind: 'success', text: 'It sorts the list.' })
    expect(delivered).toEqual([])

    const sent = await context.commands.execute(agent, '/btw --send', [], new AbortController().signal)
    expect(sent?.result.kind).toBe('success')
    const text = delivered.flatMap(message => message.content).map(block => block.type === 'text' ? block.text : '').join('')
    expect(text).toContain('what does sort do?')
    expect(text).toContain('It sorts the list.')
  })
})
