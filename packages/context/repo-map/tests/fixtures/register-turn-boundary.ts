/**
 * Test-only fixture: registers `dsh-agent-loop`'s exported `turnBoundary`
 * projection definition directly, without mounting the full `AgentLoop`
 * service — its `static inject = ['agents', 'sessions', 'llm', 'tools',
 * 'systemPrompt', 'sessionProjections']` pulls in an LLM adapter and full
 * tool/system-prompt wiring this test does not otherwise need. `repo-map`'s
 * `stepIsOpen` gate reads the same `turnBoundary` projection key a real
 * `AgentLoop` would register; this fixture supplies it standalone so the
 * test can drive `turn/start`/`step/start`/`step/end` events directly.
 */

import type { Context } from '@deepseek-ai/cordis'
import { turnBoundaryProjectionDefinition } from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-session-projection'

export const name = 'register-turn-boundary'
export const inject = ['sessionProjections']

export function apply(ctx: Context): void {
  ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
}
