import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import * as commandBtw from '../src/index.ts'
import type { Config } from '../src/index.ts'

const HANG = Symbol('hang')

const REASONED = Symbol('reasoned')

type ScriptEntry = string | Error | typeof HANG | typeof REASONED

/** Request-recording adapter that plays one scripted answer per call. */
class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: ScriptEntry[]) {
    super()
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const entry = this.script.shift()
    if (entry === undefined) throw new Error('ScriptedAdapter: script exhausted')
    if (entry instanceof Error) throw entry
    if (entry === REASONED) {
      yield { type: 'block-start', index: 0, blockType: 'reasoning' }
      yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'thinking' } }
      yield { type: 'block-start', index: 1, blockType: 'text' }
      yield { type: 'block-end', index: 1, block: { type: 'text', text: 'visible' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    if (entry === HANG) {
      await new Promise<void>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      })
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: entry } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

interface Harness {
  readonly ctx: Context
  readonly adapter: ScriptedAdapter
  readonly agent: Agent
  readonly delivered: UserMessage[]
  readonly plugin: Awaited<ReturnType<Context['plugin']>>
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(context => context.fiber.dispose()))
})

/** Mount the real loop and command registry; only the model is scripted. */
async function harness(script: ScriptEntry[], config: Partial<Config> = {}, routed = true): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new ScriptedAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  const plugin = await ctx.plugin(commandBtw, config as Config)
  const agent = await ctx.agentLoop.create(SessionId(`btw-${Math.random()}`), routed ? { provider: 'mock', model: 'mock' } : {})
  const delivered: UserMessage[] = []
  ctx.on('agent/inbox/inserted', ({ agent: subject, message }) => {
    if (subject === agent) delivered.push(message)
  })
  return { ctx, adapter, agent, delivered, plugin }
}

/** Execute one `/btw` line through the same registry path a UI adapter uses. */
async function run(test: Harness, input: string): Promise<{ kind: string; text?: string }> {
  const settled = await test.ctx.commands.execute(test.agent, `/btw ${input}`, [], new AbortController().signal)
  if (settled === undefined) throw new Error('/btw was not registered')
  return settled.result
}

function textOf(message: UserMessage | undefined): string {
  return message?.content.map(block => block.type === 'text' ? block.text : '').join('') ?? ''
}

function promptOf(request: GenerateOptions | undefined): string {
  return request?.messages.flatMap(message => message.content).map(block => block.type === 'text' ? block.text : '').join('\n') ?? ''
}

describe('@deepseek-ai/dsh-command-btw registration', () => {
  it('registers /btw with Loader-safe exports', async () => {
    const test = await harness([])
    expect(commandBtw.name).toBe('command-btw')
    expect(commandBtw.inject).toEqual(['commands', 'agents', 'llm'])
    expect('default' in commandBtw).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(commandBtw)).toBe(commandBtw)
    expect(test.ctx.commands.list(test.agent)).toContainEqual({
      definitionId: '@deepseek-ai/dsh-command-btw',
      name: 'btw',
      description: 'Ask a side question without interrupting the agent',
      input: { hint: '<question> | --send | --reset' },
    })
  })

  it('removes the command when the plugin is disposed', async () => {
    const test = await harness([])
    await test.plugin.dispose()
    expect(test.ctx.commands.list(test.agent).some(row => row.name === 'btw')).toBe(false)
  })
})

describe('/btw questions', () => {
  it('answers from a separate tool-less call and leaves the main conversation alone', async () => {
    const test = await harness(['It sorts the list.'])
    const before = test.agent.session.deriveMessages().length
    const result = await run(test, '  what does sort do?  ')
    expect(result).toEqual({ kind: 'success', text: 'It sorts the list.' })
    expect(test.adapter.requests).toHaveLength(1)
    const [request] = test.adapter.requests
    expect(request?.tools).toBeUndefined()
    expect(request?.provider).toBe('mock')
    expect(promptOf(request)).toContain('Question: what does sort do?')
    expect(test.agent.session.deriveMessages()).toHaveLength(before)
    expect(test.delivered).toEqual([])
  })

  it('shows the main conversation to the side call', async () => {
    const test = await harness(['ok'])
    test.agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'rename foo to bar' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    await run(test, 'status?')
    expect(promptOf(test.adapter.requests[0])).toContain('User: rename foo to bar')
  })

  it('carries earlier side turns into later questions', async () => {
    const test = await harness(['first answer', 'second answer'])
    await run(test, 'first?')
    await run(test, 'second?')
    const prompt = promptOf(test.adapter.requests[1])
    expect(prompt).toContain('User: first?\nAssistant: first answer')
    expect(prompt).toContain('Question: second?')
  })

  it('rejects an empty command with the usage text', async () => {
    const test = await harness([])
    expect(await run(test, '')).toEqual({ kind: 'error', text: commandBtw.BTW_USAGE })
  })

  it('reports a session without a model route', async () => {
    const test = await harness([], {}, false)
    const result = await run(test, 'hello?')
    expect(result).toEqual({ kind: 'error', text: 'This session has no model selected yet.' })
  })

  it('reports a failing model call and keeps the thread usable', async () => {
    const test = await harness([new Error('provider down'), 'recovered'])
    expect(await run(test, 'one?')).toEqual({ kind: 'error', text: 'provider down' })
    expect(await run(test, 'two?')).toEqual({ kind: 'success', text: 'recovered' })
    const thread = await test.ctx.btw.get({ sessionId: test.agent.session.id })
    expect(thread).toEqual({ ok: true, value: { turns: [{ question: 'two?', answer: 'recovered' }], sentTurns: 0 } })
  })

  it('refuses a second question while one is answering', async () => {
    const test = await harness([HANG])
    const sessionId = test.agent.session.id
    const pending = test.ctx.btw.ask({ sessionId, question: 'slow?' })
    await Promise.resolve()
    const second = await test.ctx.btw.ask({ sessionId, question: 'again?' })
    expect(second).toMatchObject({ ok: false, error: { code: 'busy' } })
    expect(await test.ctx.btw.reset({ sessionId })).toMatchObject({ ok: false, error: { code: 'busy' } })
    expect(await test.ctx.btw.send({ sessionId })).toMatchObject({ ok: false, error: { code: 'busy' } })
    void pending
  })
})

describe('/btw --send', () => {
  it('queues the exchange word for word without waking the agent', async () => {
    const test = await harness(['use the cache'])
    await run(test, 'should I cache?')
    const result = await run(test, '--send')
    expect(result).toEqual({ kind: 'success', text: 'Sent 1 side exchange(s) to the main conversation (verbatim).' })
    expect(test.adapter.requests).toHaveLength(1)
    expect(test.delivered).toHaveLength(1)
    const text = textOf(test.delivered[0])
    expect(text).toContain('User: should I cache?\nAssistant: use the cache')
    expect(text).toContain('<side_conversation>')
    expect(test.agent.status).toBe('idle')
  })

  it('sends only turns that have not been delivered', async () => {
    const test = await harness(['a1', 'a2'])
    await run(test, 'q1')
    await run(test, '--send')
    expect(await run(test, '--send')).toEqual({ kind: 'error', text: 'There is nothing new to send.' })
    await run(test, 'q2')
    await run(test, '--send')
    expect(textOf(test.delivered[1])).toContain('User: q2')
    expect(textOf(test.delivered[1])).not.toContain('User: q1')
  })

  it('condenses a long exchange before delivery', async () => {
    const test = await harness(['x'.repeat(200), 'The user wants caching.'], { maxVerbatimChars: 50 })
    await run(test, 'long question')
    const result = await run(test, '--send')
    expect(result.text).toContain('(summary)')
    expect(promptOf(test.adapter.requests[1])).toContain('long question')
    expect(textOf(test.delivered[0])).toContain('The user wants caching.')
    expect(textOf(test.delivered[0])).toContain('a summary of the exchange')
  })

  it('keeps the thread unsent when the condensing call fails', async () => {
    const test = await harness(['y'.repeat(200), new Error('summary failed')], { maxVerbatimChars: 50 })
    await run(test, 'long question')
    expect(await run(test, '--send')).toEqual({ kind: 'error', text: 'summary failed' })
    expect(test.delivered).toEqual([])
    const thread = await test.ctx.btw.get({ sessionId: test.agent.session.id })
    expect(thread).toMatchObject({ ok: true, value: { sentTurns: 0 } })
  })

  it('refuses to condense when the session has no route', async () => {
    const test = await harness([], { maxVerbatimChars: 1 }, false)
    const state = test.ctx.btw['stateFor'](test.agent)
    state.turns.push({ question: 'q', answer: 'a'.repeat(10) })
    expect(await run(test, '--send')).toEqual({ kind: 'error', text: 'This session has no model selected yet.' })
  })
})

describe('/btw --reset and the Remote', () => {
  it('clears the thread so the next question starts fresh', async () => {
    const test = await harness(['a1', 'a2'])
    await run(test, 'q1')
    expect(await run(test, '--reset')).toEqual({ kind: 'success', text: 'Side conversation cleared.' })
    await run(test, 'q2')
    expect(promptOf(test.adapter.requests[1])).not.toContain('<side_conversation>')
  })

  it('answers Remote calls for a live Session and rejects an unknown one', async () => {
    const test = await harness(['remote answer'])
    const sessionId = test.agent.session.id
    expect(await test.ctx.btw.ask({ sessionId, question: 'hi?' })).toEqual({ ok: true, value: { question: 'hi?', answer: 'remote answer' } })
    expect(await test.ctx.btw.ask({ sessionId, question: '   ' })).toMatchObject({ ok: false, error: { code: 'empty-question' } })
    expect(await test.ctx.btw.send({ sessionId })).toMatchObject({ ok: true, value: { form: 'verbatim', turns: 1 } })
    expect(await test.ctx.btw.reset({ sessionId })).toEqual({ ok: true, value: { turns: [], sentTurns: 0 } })
    const missing = SessionId('btw-missing')
    for (const outcome of [
      await test.ctx.btw.ask({ sessionId: missing, question: 'x' }),
      await test.ctx.btw.send({ sessionId: missing }),
      await test.ctx.btw.reset({ sessionId: missing }),
      await test.ctx.btw.get({ sessionId: missing }),
    ]) {
      expect(outcome).toMatchObject({ ok: false, error: { code: 'session-not-found' } })
    }
  })

  it('reports an empty summary', async () => {
    const test = await harness(['  '], { maxVerbatimChars: 1 })
    test.ctx.btw['stateFor'](test.agent).turns.push({ question: 'q', answer: 'a'.repeat(10) })
    expect(await run(test, '--send')).toEqual({ kind: 'error', text: 'The model returned no summary.' })
  })

  it('answers with the text blocks only', async () => {
    const test = await harness([REASONED])
    expect(await run(test, 'think?')).toEqual({ kind: 'success', text: 'visible' })
  })

  it('reports a provider failure that is not an Error', async () => {
    const test = await harness([], { maxVerbatimChars: 1 })
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- providers can throw non-Error values
    test.ctx.btw['complete'] = () => Promise.reject('plain failure')
    expect(await run(test, 'one?')).toEqual({ kind: 'error', text: 'plain failure' })
    const state = test.ctx.btw['stateFor'](test.agent)
    state.turns.push({ question: 'q', answer: 'a'.repeat(10) })
    expect(await run(test, '--send')).toEqual({ kind: 'error', text: 'plain failure' })
  })

  it('uses the route of the latest request when the agent has no model selected', async () => {
    const test = await harness(['from header'], {}, false)
    test.agent.session.append('request/header', {
      header: { config: { provider: 'mock', model: 'mock' } },
      reason: 'initial',
    })
    expect(await run(test, 'where?')).toEqual({ kind: 'success', text: 'from header' })
  })

  it('reports an empty model answer', async () => {
    const test = await harness(['   '])
    expect(await run(test, 'blank?')).toEqual({ kind: 'error', text: 'The model returned no answer.' })
  })
})
