import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import { remoteErrorOf, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import AuthorizationController from '../src/authorization.ts'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'

const KEY = credentialKey('llm-pi-ai', 'openai-codex')

/** Wait until an attempt leaves `running`. */
async function settled(controller: AuthorizationController, id: string) {
  for (let turn = 0; turn < 50; turn++) {
    const view = controller.read(KEY, id)
    if (view !== undefined && view.status !== 'running') return view
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('attempt never settled')
}

async function boot(withService = true): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(MemoryCredentials)
  if (withService) await ctx.plugin(AuthorizationService)
  await ctx.plugin(AuthorizationController)
  return ctx
}

/** Register a flow that asks one question, notifies, then commits. */
function register(ctx: Context): void {
  ctx.authorization.registerFlow({
    key: KEY,
    label: 'ChatGPT (Codex)',
    methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
    async run(session) {
      session.notify({ message: 'Continue in your browser', url: 'https://auth.example/start', code: 'AB-12' })
      const code = await session.prompt({ kind: 'text', message: 'Paste the code' })
      await session.commit({ kind: 'grant', payload: { code } })
    },
  })
}

describe('the authorization Remote namespace a sign-in surface calls', () => {
  it('publishes its own namespace and methods', async () => {
    const ctx = await boot()
    const controller = ctx.authorizationController
    expect(controller.typertRemote.namespace).toBe('authorization')
    expect(remoteMethods(controller).map(entry => entry.method)).toEqual(['flows', 'begin', 'read', 'answer', 'cancel'])
  })

  it('lists no flows while the service is absent and refuses to begin', async () => {
    const ctx = await boot(false)
    expect(ctx.authorizationController.flows()).toEqual([])
    expect(remoteErrorOf(captured(() => ctx.authorizationController.begin(KEY)))?.code).toBe('gateway/internal')
  })

  it('ignores a cancel for a flow that never ran', async () => {
    const ctx = await boot()
    expect(() => { ctx.authorizationController.cancel('llm-pi-ai/none') }).not.toThrow()
  })

  it('refuses a key no flow claims', async () => {
    const ctx = await boot()
    expect(remoteErrorOf(captured(() => ctx.authorizationController.begin('x/y')))?.code).toBe('gateway/bad-request')
  })

  it('lists the flow, relays the notice and the question, and reports authorized once answered', async () => {
    const ctx = await boot()
    register(ctx)
    const controller = ctx.authorizationController
    expect(controller.flows()).toEqual([{
      key: KEY, label: 'ChatGPT (Codex)', methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
    }])
    const started = controller.begin(KEY)
    await new Promise(resolve => setTimeout(resolve, 5))
    const waiting = controller.read(KEY, started.id)
    expect(waiting).toMatchObject({
      status: 'running',
      notice: { message: 'Continue in your browser', url: 'https://auth.example/start', code: 'AB-12' },
      prompt: { kind: 'text', message: 'Paste the code' },
    })
    expect(controller.answer(KEY, started.id, waiting?.prompt?.id ?? '', 'typed')).toBe(true)
    expect((await settled(controller, started.id)).status).toBe('authorized')
  })

  it('refuses a second attempt while one runs and reports cancelled after cancel', async () => {
    const ctx = await boot()
    register(ctx)
    const controller = ctx.authorizationController
    const started = controller.begin(KEY)
    expect(remoteErrorOf(captured(() => controller.begin(KEY)))?.code).toBe('gateway/bad-request')
    controller.cancel(KEY)
    expect((await settled(controller, started.id)).status).toBe('cancelled')
  })

  it('reports a declined question as cancelled and ignores stale answers', async () => {
    const ctx = await boot()
    register(ctx)
    const controller = ctx.authorizationController
    const started = controller.begin(KEY)
    await new Promise(resolve => setTimeout(resolve, 5))
    const prompt = controller.read(KEY, started.id)?.prompt
    expect(controller.answer(KEY, 'other', prompt?.id ?? '', 'x')).toBe(false)
    expect(controller.answer(KEY, started.id, 'missing', 'x')).toBe(false)
    expect(controller.answer(KEY, started.id, prompt?.id ?? '', null)).toBe(true)
    expect((await settled(controller, started.id)).status).toBe('cancelled')
    expect(controller.read(KEY, 'other')).toBeUndefined()
  })

  it('reports a flow that resolves without committing as failed', async () => {
    const ctx = await boot()
    ctx.authorization.registerFlow({
      key: KEY, label: 'x', methods: [{ id: 'oauth', label: 'x' }], run: () => Promise.resolve(),
    })
    const controller = ctx.authorizationController
    const started = controller.begin(KEY)
    const view = await settled(controller, started.id)
    expect(view.status).toBe('failed')
    expect(view.failure).toContain('commit')
  })
})

describe('what each kind of question and failure looks like to the surface', () => {
  it('projects secret and select questions and a notice with only a message', async () => {
    const ctx = await boot()
    const questions: string[] = []
    ctx.authorization.registerFlow({
      key: KEY,
      label: 'x',
      methods: [{ id: 'oauth', label: 'x' }],
      async run(session) {
        session.notify({ message: 'Plain notice' })
        questions.push(await session.prompt({ kind: 'secret', message: 'Token', placeholder: 'sk-…' }))
        questions.push(await session.prompt({
          kind: 'select', message: 'Account', options: [{ id: 'a', label: 'Personal', description: 'ignored' }],
        }))
        await session.commit({ kind: 'grant', payload: {} })
      },
    })
    const controller = ctx.authorizationController
    const started = controller.begin(KEY, 'oauth')
    await new Promise(resolve => setTimeout(resolve, 5))
    const secret = controller.read(KEY, started.id)
    expect(secret?.notice).toEqual({ message: 'Plain notice' })
    expect(secret?.prompt).toEqual({ id: secret?.prompt?.id, kind: 'secret', message: 'Token', placeholder: 'sk-…' })
    controller.answer(KEY, started.id, secret?.prompt?.id ?? '', 'sk-1')
    await new Promise(resolve => setTimeout(resolve, 5))
    const select = controller.read(KEY, started.id)
    expect(select?.prompt).toEqual({
      id: select?.prompt?.id, kind: 'select', message: 'Account', options: [{ id: 'a', label: 'Personal' }],
    })
    controller.answer(KEY, started.id, select?.prompt?.id ?? '', 'a')
    expect((await settled(controller, started.id)).status).toBe('authorized')
    expect(questions).toEqual(['sk-1', 'a'])
    expect(controller.read(KEY, started.id)?.prompt).toBeUndefined()
  })

  it('drops a question the flow withdraws and reports a non-Error rejection as failed', async () => {
    const ctx = await boot()
    ctx.authorization.registerFlow({
      key: KEY,
      label: 'x',
      methods: [{ id: 'oauth', label: 'x' }],
      async run(session) {
        const withdraw = new AbortController()
        const losing = session.prompt({ kind: 'text', message: 'Race', signal: withdraw.signal })
        withdraw.abort()
        await losing.catch(() => undefined)
        throw 'plain string failure'
      },
    })
    const controller = ctx.authorizationController
    const started = controller.begin(KEY)
    const view = await settled(controller, started.id)
    expect(view).toMatchObject({ status: 'failed', failure: 'plain string failure' })
    expect(view.prompt).toBeUndefined()
  })

  it('withdraws a running attempt when the controller is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(MemoryCredentials)
    await ctx.plugin(AuthorizationService)
    const fiber = ctx.plugin(AuthorizationController)
    await fiber
    let aborted = false
    ctx.authorization.registerFlow({
      key: KEY,
      label: 'x',
      methods: [{ id: 'oauth', label: 'x' }],
      run: session => new Promise<void>((_resolve, reject) => {
        session.signal.addEventListener('abort', () => { aborted = true; reject(new Error('gone')) })
      }),
    })
    ctx.authorizationController.begin(KEY)
    await fiber.dispose()
    expect(aborted).toBe(true)
  })
})

/** The error a synchronous call throws. */
function captured(call: () => unknown): unknown {
  try {
    call()
  } catch (error: unknown) {
    return error
  }
  throw new Error('call did not throw')
}
