/**
 * Host owner of the `authorization` Remote namespace: browser sign-in for
 * credentials a flow obtains through a conversation (`ctx.authorization`).
 *
 * @module @deepseek-ai/dsh-api-settings-controller/src/authorization.ts
 */

import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import type {
  AuthorizationEntry, AuthorizationInteraction, AuthorizationNotice, AuthorizationPrompt, AuthorizationService,
} from '@deepseek-ai/dsh-authorization'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AuthorizationAttemptView, AuthorizationFlowView, AuthorizationNoticeView, AuthorizationPromptView,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `authorization` Remote namespace. */
    authorizationController: AuthorizationController
  }
}

/** A question held until the surface answers it. */
interface PendingPrompt {
  readonly view: AuthorizationPromptView
  readonly settle: (answer: string | null) => void
}

/** One attempt's mutable state; the view is projected from it on each read. */
interface Attempt {
  readonly id: string
  readonly key: CredentialKey
  status: AuthorizationAttemptView['status']
  notice?: AuthorizationNoticeView
  readonly prompts: PendingPrompt[]
  failure?: string
}

/**
 * Project the question a flow asked into the wire view.
 * @param id - id the answer will name.
 * @param prompt - the flow's question.
 * @returns the view carrying no signal.
 */
function promptView(id: string, prompt: AuthorizationPrompt): AuthorizationPromptView {
  if (prompt.kind === 'select') {
    return {
      id,
      kind: 'select',
      message: prompt.message,
      options: prompt.options.map(option => ({ id: option.id, label: option.label })),
    }
  }
  return {
    id,
    kind: prompt.kind,
    message: prompt.message,
    ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
  }
}

/**
 * Host service backing the generated `ctx.remote.authorization` namespace. A
 * browser surface cannot hold the flow's conversation open, so the controller
 * keeps each attempt's latest notice and pending question and the surface
 * polls them. One attempt per flow key; a new `begin` replaces the finished one.
 */
export class AuthorizationController extends TypertRemoteService {
  private readonly attempts = new Map<string, Attempt>()

  /** @param ctx - Host context where the authorization service may be mounted. */
  constructor(ctx: Context) {
    super(ctx, 'authorizationController', { namespace: 'authorization' })
    ctx.effect(() => () => {
      for (const attempt of this.attempts.values()) this.withdraw(attempt)
      this.attempts.clear()
    }, 'authorization-controller: withdraw attempts')
  }

  /**
   * List the sign-in flows installed providers offer.
   * @returns one view per registered flow; empty while no authorization service is mounted.
   */
  @Remote
  flows(): AuthorizationFlowView[] {
    const service = this.ctx.get('authorization')
    if (service === undefined) return []
    return service.list().map(entry => ({
      key: entry.key,
      label: entry.label,
      methods: entry.methods.map(method => ({ id: method.id, label: method.label })),
    }))
  }

  /**
   * Start a sign-in attempt and return before it finishes.
   * @param key - flow key from {@link flows}.
   * @param method - method id; the flow's first when omitted.
   * @returns the attempt's first state.
   * @throws RemoteError when the service is absent, the key is unknown, or an attempt already runs for it.
   */
  @Remote
  begin(key: string, method?: string): AuthorizationAttemptView {
    const service = this.service()
    const entry = this.entryFor(service, key)
    if (entry.inFlight) {
      throw new RemoteError('gateway/bad-request', `a sign-in for "${key}" is already running`, {})
    }
    const attempt: Attempt = { id: randomUUID(), key: entry.key, status: 'running', prompts: [] }
    this.attempts.set(key, attempt)
    void service.begin({
      key: entry.key,
      ...method === undefined ? {} : { method },
      interaction: this.interaction(attempt),
    }).then(
      (outcome) => { attempt.status = outcome.status },
      (error: unknown) => {
        attempt.status = 'failed'
        attempt.failure = error instanceof Error ? error.message : String(error)
      },
    )
    return this.project(attempt)
  }

  /**
   * Read one attempt's progress.
   * @param key - flow key the attempt signs in to.
   * @param id - attempt id returned by {@link begin}.
   * @returns the current state, or undefined when that attempt was replaced or never existed.
   */
  @Remote
  read(key: string, id: string): AuthorizationAttemptView | undefined {
    const attempt = this.attempts.get(key)
    return attempt?.id === id ? this.project(attempt) : undefined
  }

  /**
   * Answer the question an attempt is waiting on.
   * @param key - flow key the attempt signs in to.
   * @param id - attempt id.
   * @param promptId - id of the question being answered.
   * @param answer - typed text or chosen option id; null declines and ends the attempt as cancelled.
   * @returns true when a waiting question took the answer.
   */
  @Remote
  answer(key: string, id: string, promptId: string, answer: string | null): boolean {
    const attempt = this.attempts.get(key)
    if (attempt?.id !== id) return false
    const index = attempt.prompts.findIndex(pending => pending.view.id === promptId)
    if (index === -1) return false
    const [pending] = attempt.prompts.splice(index, 1)
    pending?.settle(answer)
    return true
  }

  /**
   * Withdraw the running attempt for a flow, if any.
   * @param key - flow key to cancel.
   */
  @Remote
  cancel(key: string): void {
    const attempt = this.attempts.get(key)
    if (attempt !== undefined) this.withdraw(attempt)
  }

  /** The surface the service talks to for one attempt. */
  private interaction(attempt: Attempt): AuthorizationInteraction {
    return {
      notify: (notice: AuthorizationNotice) => {
        attempt.notice = {
          message: notice.message,
          ...notice.url === undefined ? {} : { url: notice.url },
          ...notice.code === undefined ? {} : { code: notice.code },
        }
      },
      prompt: (prompt: AuthorizationPrompt) => new Promise<string>((resolve, reject) => {
        const pending: PendingPrompt = {
          view: promptView(randomUUID(), prompt),
          settle: (answer) => {
            if (answer === null) reject(new AuthorizationDeclinedError())
            else resolve(answer)
          },
        }
        attempt.prompts.push(pending)
        prompt.signal?.addEventListener('abort', () => {
          attempt.prompts.splice(0, attempt.prompts.length, ...attempt.prompts.filter(other => other !== pending))
          reject(new Error('the question was withdrawn by the sign-in flow'))
        }, { once: true })
      }),
    }
  }

  private withdraw(attempt: Attempt): void {
    this.ctx.get('authorization')?.cancel(attempt.key)
    for (const pending of attempt.prompts.splice(0)) pending.settle(null)
  }

  private project(attempt: Attempt): AuthorizationAttemptView {
    const prompt = attempt.prompts[0]?.view
    return {
      id: attempt.id,
      key: attempt.key,
      status: attempt.status,
      ...attempt.notice === undefined ? {} : { notice: attempt.notice },
      ...prompt === undefined || attempt.status !== 'running' ? {} : { prompt },
      ...attempt.failure === undefined ? {} : { failure: attempt.failure },
    }
  }

  private service(): AuthorizationService {
    const service = this.ctx.get('authorization')
    if (service === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'authorization service is absent: this deployment does not mount @deepseek-ai/dsh-authorization',
        {},
      )
    }
    return service
  }

  private entryFor(service: AuthorizationService, key: string): AuthorizationEntry {
    const entry = service.list().find(candidate => candidate.key === key)
    if (entry === undefined) {
      throw new RemoteError('gateway/bad-request', `no sign-in flow is registered for "${key}"`, {})
    }
    return entry
  }
}

export default AuthorizationController
