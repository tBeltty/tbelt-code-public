/** Reports agent activity and attention moments from the Host to the Electron shell. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-user-approval'

/** Message the Host sends over IPC; the shell keeps the computer awake and raises notifications from it. */
export type DesktopAgentSignal =
  | { readonly type: 'agent-activity'; readonly running: number }
  | { readonly type: 'agent-attention'; readonly kind: 'turn-end' | 'approval' }

/**
 * Observe agent status and approval requests on the owning Host context.
 * @param ctx - Booted Desktop profile context; disposal removes the listeners.
 * @param send - Delivers one signal to the shell.
 * @returns nothing; `agent-activity` carries the count of running agents (subagents included) whenever it changes,
 *   and `agent-attention` marks a root agent returning to idle (`turn-end`) or an approval waiting for an answer.
 *   The approval listener only observes and always delegates to `next()`.
 */
export function installDesktopAgentAttention(ctx: Context, send: (signal: DesktopAgentSignal) => void): void {
  const running = new Set<string>()
  ctx.on('agent/status', ({ agent, status }) => {
    const before = running.size
    if (status === 'running') running.add(agent.id)
    else running.delete(agent.id)
    if (running.size !== before) send({ type: 'agent-activity', running: running.size })
    if (status === 'idle' && agent.session.header.origin !== 'subagent') send({ type: 'agent-attention', kind: 'turn-end' })
  })
  ctx.on('agent/disposed', ({ agent }) => {
    if (running.delete(agent.id)) send({ type: 'agent-activity', running: running.size })
  })
  ctx.on('approval/request', (request, next) => {
    if (request.agent.session.header.origin !== 'subagent') send({ type: 'agent-attention', kind: 'approval' })
    return next()
  })
}
