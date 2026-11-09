/**
 * Side conversation for a running Session: the `btw` Host Remote a product
 * surface asks through, and the human-facing `/btw` command. A question is
 * answered by a separate model call over a text rendering of the main
 * conversation, so the main agent keeps working undisturbed. Delivering the
 * side conversation queues one user-role context message on the main agent,
 * which reads it at its next step boundary or next turn.
 * @module @deepseek-ai/dsh-command-btw
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { renderTranscript } from './transcript.ts'
import type {
  BtwAskRequest, BtwDelivery, BtwError, BtwErrorCode, BtwResult, BtwSessionRequest, BtwThread, BtwTurn,
} from './types.ts'

export type * from './types.ts'
export { renderTranscript } from './transcript.ts'

export const name = 'command-btw'
export const inject = ['commands', 'agents', 'llm']

/** Usage text returned for a `/btw` without a question. */
export const BTW_USAGE = 'Usage: /btw <question>, /btw --send, or /btw --reset'

/** Validated tunables of the side conversation. */
export interface Config {
  /** Character budget for the main conversation text passed with each question. */
  maxTranscriptChars: number
  /** Token cap for one answer. */
  maxAnswerTokens: number
  /** Side conversations up to this many characters reach the main agent word for word; longer ones are condensed first. */
  maxVerbatimChars: number
  /** Token cap for a condensed delivery. */
  maxSummaryTokens: number
}

export const Config: z<Config> = z.object({
  maxTranscriptChars: z.number().step(1).min(1).default(60_000),
  maxAnswerTokens: z.number().step(1).min(1).default(2048),
  maxVerbatimChars: z.number().step(1).min(1).default(3000),
  maxSummaryTokens: z.number().step(1).min(1).default(600),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    btw: BtwService
  }
}

const ASK_SYSTEM = [
  'You answer a short side question from the user while the main assistant keeps working on their task.',
  'You see the conversation so far as a transcript. You cannot run tools or change files.',
  'Answer briefly from the transcript and general knowledge, and say so when the transcript does not hold the answer.',
].join(' ')

const SUMMARY_SYSTEM = [
  'You condense a side conversation between a user and an assistant for the main assistant, which was busy and did not see it.',
  'Keep every decision, preference, correction, and request the user expressed, and the facts the answers established.',
  'Write plain prose or short lines, no preamble.',
].join(' ')

/** Mutable state of one Session's side conversation. */
interface ThreadState {
  turns: BtwTurn[]
  sentTurns: number
  busy: boolean
}

/** Build a failed result. */
function fail(code: BtwErrorCode, message: string): { ok: false; error: BtwError } {
  return { ok: false, error: { code, message } }
}

/** Render turns as labelled lines. */
function renderTurns(turns: readonly BtwTurn[]): string {
  return turns.map(turn => `User: ${turn.question}\nAssistant: ${turn.answer}`).join('\n\n')
}

/** Wrap delivered context for the main agent. */
function deliveryText(form: BtwDelivery['form'], body: string): string {
  const what = form === 'verbatim' ? 'the exchange' : 'a summary of the exchange'
  return [
    'While you were working, the user held a side conversation with a separate assistant about this task.',
    `Below is ${what}. Treat what the user said there as context from them for your next steps; it is not a new request to answer.`,
    '',
    '<side_conversation>',
    body,
    '</side_conversation>',
  ].join('\n')
}

/**
 * Side conversation service: one in-memory thread per live Session.
 */
export class BtwService extends TypertRemoteService {
  static inject = ['agents', 'llm']

  private readonly threads = new WeakMap<Agent, ThreadState>()

  /**
   * @param ctx - Host context carrying the live Agents and the LLM service.
   * @param config - validated tunables.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'btw')
  }

  /**
   * Ask the side conversation one question.
   * @param request - target Session and question.
   * @returns the answered turn, or the reason none was produced.
   */
  @Remote('ask')
  ask(request: BtwAskRequest): Promise<BtwResult<BtwTurn>> {
    const agent = this.ctx.agents.get(request.sessionId)
    if (agent === undefined) return Promise.resolve(this.missing())
    return this.askAgent(agent, request.question)
  }

  /**
   * Queue the side conversation's unsent turns on the main agent as context.
   * @param request - target Session.
   * @returns how the context was written and how many turns it carried.
   */
  @Remote('send')
  send(request: BtwSessionRequest): Promise<BtwResult<BtwDelivery>> {
    const agent = this.ctx.agents.get(request.sessionId)
    if (agent === undefined) return Promise.resolve(this.missing())
    return this.sendAgent(agent)
  }

  /**
   * Discard the side conversation. Turns already delivered stay in the main conversation.
   * @param request - target Session.
   * @returns the now-empty thread.
   */
  @Remote('reset')
  reset(request: BtwSessionRequest): Promise<BtwResult<BtwThread>> {
    const agent = this.ctx.agents.get(request.sessionId)
    if (agent === undefined) return Promise.resolve(this.missing())
    return Promise.resolve(this.resetAgent(agent))
  }

  /**
   * Read the side conversation.
   * @param request - target Session.
   * @returns the turns asked so far and how many were delivered.
   */
  @Remote('get')
  get(request: BtwSessionRequest): Promise<BtwResult<BtwThread>> {
    const agent = this.ctx.agents.get(request.sessionId)
    if (agent === undefined) return Promise.resolve(this.missing())
    return Promise.resolve({ ok: true, value: this.view(this.stateFor(agent)) })
  }

  /**
   * Run one `/btw` command line against the receiving agent.
   * @param invocation - receiving agent, raw input, and UI cancellation.
   * @returns the answer, a delivery acknowledgement, or a usage or failure error.
   */
  async runCommand(invocation: CommandInvocation): Promise<CommandResult> {
    const input = invocation.rawInput.trim()
    if (input.length === 0) return { kind: 'error', text: BTW_USAGE }
    if (input === '--send') {
      const sent = await this.sendAgent(invocation.agent, invocation.signal)
      if (!sent.ok) return { kind: 'error', text: sent.error.message }
      return { kind: 'success', text: `Sent ${String(sent.value.turns)} side exchange(s) to the main conversation (${sent.value.form}).` }
    }
    if (input === '--reset') {
      this.resetAgent(invocation.agent)
      return { kind: 'success', text: 'Side conversation cleared.' }
    }
    const asked = await this.askAgent(invocation.agent, input, invocation.signal)
    if (!asked.ok) return { kind: 'error', text: asked.error.message }
    return { kind: 'success', text: asked.value.answer }
  }

  private missing(): { ok: false; error: BtwError } {
    return fail('session-not-found', 'No live session carries that id.')
  }

  private stateFor(agent: Agent): ThreadState {
    let state = this.threads.get(agent)
    if (state === undefined) {
      state = { turns: [], sentTurns: 0, busy: false }
      this.threads.set(agent, state)
    }
    return state
  }

  private view(state: ThreadState): BtwThread {
    return { turns: [...state.turns], sentTurns: state.sentTurns }
  }

  private resetAgent(agent: Agent): BtwResult<BtwThread> {
    const state = this.stateFor(agent)
    if (state.busy) return fail('busy', 'The side conversation is still answering.')
    state.turns = []
    state.sentTurns = 0
    return { ok: true, value: this.view(state) }
  }

  private async askAgent(agent: Agent, question: string, signal?: AbortSignal): Promise<BtwResult<BtwTurn>> {
    const text = question.trim()
    if (text.length === 0) return fail('empty-question', 'The question is empty.')
    const state = this.stateFor(agent)
    if (state.busy) return fail('busy', 'The side conversation is still answering.')
    const route = routeOf(agent)
    if (route === undefined) return fail('no-route', 'This session has no model selected yet.')
    state.busy = true
    try {
      const transcript = renderTranscript(agent.session.deriveMessages(), this.config.maxTranscriptChars)
      const prompt = [
        transcript.length === 0 ? '<conversation>\n[no conversation yet]\n</conversation>' : `<conversation>\n${transcript}\n</conversation>`,
        ...state.turns.length === 0 ? [] : [`<side_conversation>\n${renderTurns(state.turns)}\n</side_conversation>`],
        `Question: ${text}`,
      ].join('\n\n')
      const answer = await this.complete(agent, route, ASK_SYSTEM, prompt, this.config.maxAnswerTokens, signal)
      if (answer === undefined) return fail('model-failed', 'The model returned no answer.')
      const turn: BtwTurn = { question: text, answer }
      state.turns.push(turn)
      return { ok: true, value: turn }
    } catch (error: unknown) {
      return fail('model-failed', error instanceof Error ? error.message : String(error))
    } finally {
      state.busy = false
    }
  }

  private async sendAgent(agent: Agent, signal?: AbortSignal): Promise<BtwResult<BtwDelivery>> {
    const state = this.stateFor(agent)
    if (state.busy) return fail('busy', 'The side conversation is still answering.')
    const pending = state.turns.slice(state.sentTurns)
    if (pending.length === 0) return fail('nothing-to-send', 'There is nothing new to send.')
    state.busy = true
    try {
      const verbatim = renderTurns(pending)
      let form: BtwDelivery['form'] = 'verbatim'
      let body = verbatim
      if (verbatim.length > this.config.maxVerbatimChars) {
        const route = routeOf(agent)
        if (route === undefined) return fail('no-route', 'This session has no model selected yet.')
        const summary = await this.complete(agent, route, SUMMARY_SYSTEM, verbatim, this.config.maxSummaryTokens, signal)
        if (summary === undefined) return fail('model-failed', 'The model returned no summary.')
        form = 'summary'
        body = summary
      }
      agent.inject(createUserMessage({
        content: [{ type: 'text', text: deliveryText(form, body) }],
        source: { kind: 'user' },
      }))
      state.sentTurns = state.turns.length
      return { ok: true, value: { form, turns: pending.length } }
    } catch (error: unknown) {
      return fail('model-failed', error instanceof Error ? error.message : String(error))
    } finally {
      state.busy = false
    }
  }

  /**
   * One tool-less model call.
   * @returns the trimmed answer text, or `undefined` when the model produced none.
   * @throws when the provider reports an error or the call is cancelled.
   */
  private async complete(
    agent: Agent,
    route: { provider: string; model: string },
    system: string,
    prompt: string,
    maxTokens: number,
    signal: AbortSignal | undefined,
  ): Promise<string | undefined> {
    const messages: RequestMessage[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    const options: GenerateOptions = {
      provider: route.provider,
      model: route.model,
      system,
      messages,
      maxTokens,
      sessionId: agent.session.id,
      ...signal === undefined ? {} : { signal },
    }
    const assembler = new BlockAssembler()
    for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
    const { finish } = assembler
    if (finish.kind === 'error' || finish.kind === 'aborted') throw new Error(finish.failure.message)
    const text = assembler.blocks()
      .map(block => block.type === 'text' ? block.text : '')
      .join('')
      .trim()
    return text.length === 0 ? undefined : text
  }
}

/** Provider and model the Session's latest request used, else the agent's own selection. */
function routeOf(agent: Agent): { provider: string; model: string } | undefined {
  const latest = agent.session.requestHeader()?.config
  if (latest !== undefined) return { provider: latest.provider, model: latest.model }
  const { provider, model } = agent.options
  if (provider !== undefined && provider.length > 0 && model !== undefined && model.length > 0) return { provider, model }
  return undefined
}

/**
 * Mount the `btw` Remote and register the global `/btw` command.
 * @param ctx - Host context.
 * @param config - validated tunables.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(BtwService, config)
  ctx.inject(['btw'], (scope) => {
    scope.effect(() => scope.commands.register({
      definitionId: CommandDefinitionId('@deepseek-ai/dsh-command-btw'),
      name: 'btw',
      description: 'Ask a side question without interrupting the agent',
      input: { hint: '<question> | --send | --reset' },
      handler: invocation => scope.btw.runCommand(invocation),
    }), 'command-btw: /btw command')
  })
}
