/**
 * ui-plan browser half on a real SlotRegistry: the plugin occupies the
 * conversation-declared `conversation.input.plan` single seat with the active
 * plan status chip; the injected face executes /plan off and folds admission
 * outcomes into null (admitted) or a user-visible failure line; teardown
 * empties the seat (HMR safety).
 */
import { ConversationEventRegistry } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ComposerMessagePrefixRegistry } from '@deepseek-ai/dsh-client-ui-conversation/src/client/input/prefixes.ts'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import { EMPTY_CHAT_SNAPSHOT } from '../../ui-chat/src/client/contract/snapshot.ts'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { PlanChip } from '../src/client/PlanModeControl.tsx'
import { PlanCards, PlanReviewOpen, type PlanCardsInjected, type PlanOpenInjected, type PlanReviewOpenInjected } from '../src/client/PlanCard.tsx'
import { PlanPreview, PlanTitle, type PlanPreviewInjected } from '../src/client/PlanPreview.tsx'
import {
  PlanCommentChip, PlanReviewDecision, type PlanCommentChipInjected, type PlanReviewDecisionInjected,
} from '../src/client/PlanCommentControls.tsx'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { submittedPlan } from '../src/client/plan.ts'
import type { PlanChipInjected } from '../src/client/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { createSidebarRightController } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/service.ts'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { createSidebarRightStore } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/stores.ts'

type OpenTab = ReturnType<Context['sidebarRight']['openTabs']['getSnapshot']>[number]

function providePreview(ctx: Context) {
  const events = new ConversationEventRegistry(ctx)
  const chat = createSnapshotStore<ChatSnapshot | undefined>(EMPTY_CHAT_SNAPSHOT)
  ctx.provide('uiConversation', { events, binding: () => ({ target: () => chat }) })
  const removeResources = vi.fn()
  const removeType = vi.fn()
  const registerType = vi.fn<Context['sidebarRightTabs']['register']>(() => removeType)
  const openResourceIn = vi.fn<Context['sidebarRight']['openResourceIn']>()
  const openResource = vi.fn<Context['sidebarRight']['openResource']>()
  const mounted = createSnapshotStore<SessionId | undefined>(undefined)
  const openTabs = createSnapshotStore<ReturnType<Context['sidebarRight']['openTabs']['getSnapshot']>>([])
  const subagentAddress = vi.fn<Context['sessions']['subagentAddress']>(() => undefined)
  const binding = vi.fn<() => object | undefined>(() => ({}))
  ctx.provide('sessions', { subagentAddress, binding })
  ctx.provide('resources', { register: vi.fn(() => removeResources) })
  ctx.provide('sidebarRightTabs', { register: registerType })
  ctx.provide('sidebarRight', { openResourceIn, openResource, mounted, openTabs })
  ctx.provide('remote.session', {})
  const prefixes = new ComposerMessagePrefixRegistry()
  ctx.provide('conversation', { prefixes })
  return {
    events, removeResources, removeType, registerType, openResourceIn, openResource, mounted, openTabs, subagentAddress, chat, binding,
    prefixes,
  }
}

const SID = 's-plan' as SessionId

async function bench() {
  const ctx = new Context()
  const preview = providePreview(ctx)
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: {
      'conversation.input.plan': { kind: 'single', scope: 'session' },
      'conversation.chat.turnTail': { kind: 'list', scope: 'session' },
      'conversation.plan-review.actions': { kind: 'list', scope: 'session' },
      'conversation.plan-review.decision': { kind: 'single', scope: 'session' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
      'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
      'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  const execute = vi.fn((_sessionId: SessionId, _line: string) =>
    Promise.resolve({ ok: true, value: { commandId: 'c1', result: { kind: 'success' as const } } }))
  const commandsRemote = { execute }
  ctx.provide('remote', { commands: commandsRemote })
  ctx.provide('remote.commands', commandsRemote)
  ctx.provide('locale', new LocaleRuntime(ctx))
  return { ctx, slots, execute, ...preview }
}

describe('ui-plan browser apply', () => {
  it('binds plan cards to one Turn collection and reports unavailable bindings', async () => {
    const b = await bench()
    const turnDataSource = vi.fn<(turn: number, kind: string) => void>()
    b.chat.set({ ...EMPTY_CHAT_SNAPSHOT, nodes: {
      ...EMPTY_CHAT_SNAPSHOT.nodes,
      turnDataSource: (turn, kind) => {
        turnDataSource(turn, kind)
        return EMPTY_CHAT_SNAPSHOT.nodes.turnDataSource(turn, kind)
      },
    } })
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    try {
      await fiber.await()
      const entry = b.slots.entries('conversation.chat.turnTail')[0]!
      const resolve = entry.inject as NonNullable<typeof entry.inject> & ((sessionId: SessionId) => PlanCardsInjected)
      const injected = resolve(SID)
      const source = injected.keyedHooks.plans('7')
      expect(turnDataSource).toHaveBeenCalledExactlyOnceWith(7, 'submitted-plan')
      expect(source.getSnapshot()).toEqual([])
      expect(injected.keyedHooks.plans('7')).toBe(source)
      b.chat.set(undefined)
      expect(() => injected.keyedHooks.plans('7')).toThrow('Chat target is unavailable')
      b.binding.mockReturnValueOnce(undefined)
      expect(() => resolve(SID)).toThrow('unknown session')
    } finally {
      await fiber.dispose()
    }
  })

  it('opens an embedded child plan in the visible parent sidebar without adopting a child store', async () => {
    const b = await bench()
    const parent = 'visible-parent' as SessionId
    const child = 'embedded-child' as SessionId
    const tabs = new SidebarRightTabRegistry(b.ctx)
    b.registerType.mockImplementation(definition => tabs.register(definition))
    const store = createSidebarRightStore(() => ({ kind: 'guide', title: 'Guide' })).create()
    const { controller, adopt, show } = createSidebarRightController(tabs, vi.fn(), {
      autoFullscreen: () => false,
      openWithFocus: (_sessionId, open) => { open() },
      closeWithFocus: (_sessionId, _paneId, close) => { close() },
    })
    const release = adopt(parent, store)
    store.actions.open(parent)
    show(parent)
    b.openResource.mockImplementation(controller.openResource.bind(controller))
    b.openResourceIn.mockImplementation(controller.openResourceIn.bind(controller))
    b.subagentAddress.mockReturnValue({ parentSessionId: parent, childSessionId: child, mode: 'continuable' })
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    try {
      await fiber.await()
      const card = b.slots.entries('conversation.chat.turnTail')[0]!
      const opener = (card.inject as unknown as (sessionId: SessionId) => PlanOpenInjected)(child)
      const plan = submittedPlan({ type: 'tool/call', data: { callId: 'child-plan', name: 'exit_plan_mode', arguments: '{"plan":"# Child plan"}' } })!
      opener.openPlan(plan.callId)
      const resources = () => Object.values(store.getSnapshot().bySession[parent]!.layout.tabs).map(tab => tab.contentId)
      expect(resources()).toContain('dsh-resource://plan/subagent/visible-parent/embedded-child/continuable/child-plan')
      expect(store.getSnapshot().bySession[child]).toBeUndefined()
      const review = b.slots.entries('conversation.plan-review.actions')[0]!
      const reviewOpener = (review.inject as unknown as (sessionId: SessionId) => PlanReviewOpenInjected)(child)
      reviewOpener.openReview({ id: 'pending', question: 'Approve?', plan: '# Temporary child plan', approve: { label: 'Approve' } }, 'child-question')
      expect(resources().some(address => address.startsWith('dsh-resource://plan-review/embedded-child/'))).toBe(true)
      expect(store.getSnapshot().bySession[child]).toBeUndefined()
    } finally {
      await fiber.dispose()
      show(undefined)
      release()
      controller.tabDomain.dispose()
    }
  })

  it('shares unsent comments between the document, the review decision, the composer chip, and the next message', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    try {
      await fiber.await()
      const preview = b.slots.entries('sidebar.right.pane.tab')[0]!
      const document = (preview.inject as NonNullable<typeof preview.inject> & ((sessionId: SessionId) => PlanPreviewInjected))(SID)
      const decisionEntry = b.slots.entries('conversation.plan-review.decision')[0]!
      expect(decisionEntry.component).toBe(PlanReviewDecision)
      type DecisionResolver = NonNullable<typeof decisionEntry.inject> & ((sessionId: SessionId) => PlanReviewDecisionInjected)
      const decision = (decisionEntry.inject as DecisionResolver)(SID)
      const chipEntry = b.slots.entries('conversation.input.dock')[0]!
      expect(chipEntry.component).toBe(PlanCommentChip)
      const chip = (chipEntry.inject as NonNullable<typeof chipEntry.inject> & ((sessionId: SessionId) => PlanCommentChipInjected))(SID)
      expect(chip.hooks.planComments).toBe(document.hooks.planComments)
      const logged = decision.documentOf({ id: 'r', question: 'Approve?', plan: '# P', callId: 'call' as ToolCallId, approve: { label: 'Approve' } }, 'q:1')
      expect(logged).toBe('dsh-resource://plan/s-plan/call')
      const temporary = decision.documentOf({ id: 'r', question: 'Approve?', plan: '# P', approve: { label: 'Approve' } }, 'q:2')
      expect(temporary).toMatch(/^dsh-resource:\/\/plan-review\/s-plan\//)
      document.addComment(logged, { block: 2, quote: 'second', offset: 0 }, 'later')
      document.addComment(logged, { block: 0, quote: 'first', offset: 0 }, 'earlier')
      document.addComment('dsh-resource://plan/other-session/call', { block: 0, quote: 'elsewhere', offset: 0 }, 'not this Session')
      const [first, second] = document.hooks.planComments.getSnapshot().documents[logged]!
      document.updateComment(logged, first!.id, 'earlier, edited')
      const [prefix] = b.prefixes.collect(SID)
      expect(prefix?.text).toBe('> first\nearlier, edited\n\n> second\nlater')
      document.removeComment(logged, second!.id)
      expect(b.prefixes.collect(SID)[0]?.text).toBe('> first\nearlier, edited')
      prefix!.commit()
      expect(document.hooks.planComments.getSnapshot().documents[logged]).toEqual([{ ...first, text: 'earlier, edited', resolved: true }])
      expect(b.prefixes.collect(SID)).toEqual([])
      expect(b.prefixes.collect('other-session' as SessionId)).toHaveLength(1)
      chip.removeComments('dsh-resource://plan/other-session/call', document.hooks.planComments.getSnapshot().documents['dsh-resource://plan/other-session/call']!.map(comment => comment.id))
      expect(Object.keys(document.hooks.planComments.getSnapshot().documents)).toEqual([logged])
      document.addComment(logged, { block: 1, quote: 'sent', offset: 0 }, 'on its own')
      const prompt = vi.fn(() => Promise.resolve({ ok: true as const, value: { accepted: true as const } }))
      b.binding.mockReturnValue({ session: { prompt } })
      await expect(chip.sendComments(SID)).resolves.toBeNull()
      expect(prompt).toHaveBeenCalledWith([{ type: 'text', text: '> sent\non its own' }], 'queue')
      expect(b.prefixes.collect(SID)).toEqual([])
      document.addComment(logged, { block: 0, quote: 'kept', offset: 0 }, 'until teardown')
      await fiber.dispose()
      expect(b.prefixes.collect(SID)).toEqual([])
      expect(b.slots.entries('conversation.plan-review.decision')).toEqual([])
      expect(b.slots.entries('conversation.input.dock')).toEqual([])
    } finally { await fiber.dispose() }
  })

  it('declares every service it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.commands', 'remote.session', 'sessions', 'locale', 'conversation', 'uiConversation', 'resources', 'sidebarRight', 'sidebarRightTabs'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('waits until conversation declares the plan seat', async () => {
    const ctx = new Context()
    providePreview(ctx)
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('remote', { commands: {} })
    ctx.provide('remote.commands', {})
    ctx.provide('locale', new LocaleRuntime(ctx))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('conversation.input.plan')).toHaveLength(0)
    ctx.slots.register({
      name: 'root', children: { 'conversation.input.plan': { kind: 'single', scope: 'session' } },
    } as never, () => null)
    await Promise.resolve()
    expect(ctx.slots.entries('conversation.input.plan')).toHaveLength(1)
  })

  it('registers the chip, executes /plan off, and unregisters on teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = b.slots.entries('conversation.input.plan')[0]!
    expect(entry.component).toBe(PlanChip)
    const injected = (entry.inject as unknown as (id: SessionId) => PlanChipInjected)(SID)

    await expect(injected.exitPlanMode()).resolves.toBeNull()
    expect(b.execute).toHaveBeenLastCalledWith(SID, '/plan off', [])

    // Business failure folds to the composer-visible line: the generated method
    // reports the RPC failure in its error branch.
    b.execute.mockResolvedValueOnce({
      ok: false,
      error: new RemoteError('session/not-found', 'gone', { sessionId: SID }),
    } as never)
    await expect(injected.exitPlanMode()).resolves.toBe('gone (session/not-found)')

    // Unmatched admission (plan-mode not composed host-side) is also a failure line.
    b.execute.mockResolvedValueOnce({ ok: true, value: undefined } as never)
    await expect(injected.exitPlanMode()).resolves.toBe('unknown command: /plan off')

    expect(b.events.entries().map(entry => entry.kind)).toEqual(['submitted-plan'])
    await fiber.dispose()
    expect(b.events.entries()).toEqual([])
    expect(b.removeResources).toHaveBeenCalledOnce()
    expect(b.removeType).toHaveBeenCalledOnce()
    expect(b.slots.entries('conversation.input.plan')).toHaveLength(0)
  })
  it('binds both entry points to the same Session resource and removes the sidebar seats', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    try {
      await fiber.await()
      const removeFileEntry = b.slots.register({ name: 'conversation.chat.turnTail', id: 'test-file-deliveries' }, () => null)
      expect(b.slots.entries('conversation.chat.turnTail')).toHaveLength(2)
      removeFileEntry()
      const address = 'dsh-resource://plan/s-plan/call'
      const type = b.registerType.mock.calls[0]![0]
      expect(type.canOpen!(address)).toBe(true)
      expect(type.canOpen!('file:///plan.md')).toBe(false)
      expect(type.title(address)).toBeTruthy()
      const plan = submittedPlan({ type: 'tool/call', data: { callId: 'call', name: 'exit_plan_mode', arguments: '{"plan":"# Saved plan"}' } })!
      const card = b.slots.entries('conversation.chat.turnTail')[0]!
      expect(card.component).toBe(PlanCards)
      const injected = (card.inject as unknown as (sessionId: SessionId) => PlanOpenInjected)(SID)
      injected.openPlan(plan.callId)
      expect(b.openResource).toHaveBeenLastCalledWith(address, {})
      // Another plan of the same Session replaces the open plan tab instead of adding one.
      b.mounted.set(SID)
      b.openTabs.set([
        { sessionId: SID, tabId: 'other' as OpenTab['tabId'], kind: 'plan', contentId: 'dsh-resource://plan/elsewhere/call' },
        { sessionId: SID, tabId: 'tab' as OpenTab['tabId'], kind: 'plan', contentId: 'dsh-resource://plan/s-plan/older' },
      ])
      injected.openPlan(plan.callId)
      expect(b.openResource).toHaveBeenLastCalledWith(address, { replaceTab: 'tab' })
      b.openTabs.set([])
      b.mounted.set(undefined)
      const review = b.slots.entries('conversation.plan-review.actions')[0]!
      expect(review.component).toBe(PlanReviewOpen)
      const reviewInjected = (review.inject as unknown as (sessionId: SessionId) => PlanReviewOpenInjected)(SID)
      // The automatic open reads the service's on-screen Session source, not a copy.
      expect(reviewInjected.hooks.sidebarMounted).toBe(b.mounted)
      const pending = { id: 'review', question: 'Approve?', plan: plan.markdown, callId: plan.callId, approve: { label: 'Approve' } }
      reviewInjected.openReview(pending, 'question:1')
      expect(b.openResource).toHaveBeenLastCalledWith(address, {})
      b.subagentAddress.mockReturnValue({ parentSessionId: 'parent' as SessionId, childSessionId: SID, mode: 'continuable' })
      injected.openPlan(plan.callId)
      expect(b.openResource).toHaveBeenLastCalledWith('dsh-resource://plan/subagent/parent/s-plan/continuable/call', {})
      reviewInjected.openReview(pending, 'question:1')
      expect(b.openResource).toHaveBeenLastCalledWith('dsh-resource://plan/subagent/parent/s-plan/continuable/call', {})
      const temporary = { id: 'review', question: 'Approve?', plan: '# Temporary\n\nComplete body', approve: { label: 'Approve' } }
      reviewInjected.openReview(temporary, 'question:2')
      const first = b.openResource.mock.calls.at(-1)!
      expect(type.canOpen!(first[0])).toBe(true)
      expect(first).toEqual([expect.stringMatching(/^dsh-resource:\/\/plan-review\/s-plan\//), {
        params: { planReview: { title: 'Temporary', markdown: temporary.plan } },
      }])
      reviewInjected.openReview(temporary, 'question:2')
      expect(b.openResource).toHaveBeenLastCalledWith(...first)
      reviewInjected.openReview(temporary, 'question:3')
      expect(b.openResource.mock.calls.at(-1)![0]).not.toBe(first[0])
      expect(b.slots.entries('sidebar.right.pane.tab')[0]!.component).toBe(PlanPreview)
      expect(b.slots.entries('sidebar.right.pane.tab.title')[0]!.component).toBe(PlanTitle)
      await fiber.dispose()
      expect(b.slots.entries('conversation.chat.turnTail')).toEqual([])
      expect(b.slots.entries('conversation.plan-review.actions')).toEqual([])
      expect(b.slots.entries('sidebar.right.pane.tab')).toEqual([])
      expect(b.slots.entries('sidebar.right.pane.tab.title')).toEqual([])
    } finally { await fiber.dispose() }
  })
})
