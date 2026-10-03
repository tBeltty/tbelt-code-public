/** Plan-mode control, persistent Chat cards, Session-backed sidebar previews, and plan comments. */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
// Type-only: pulls the ui-conversation SlotMap merge (the input.plan seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the `plan` SessionProjectionMap merge for useProjection.
import type {} from '@deepseek-ai/dsh-plan-mode/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import { extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { PlanCards, PlanReviewOpen, type PlanCardsInjected, type PlanOpenInjected, type PlanReviewOpenInjected } from './PlanCard.tsx'
import { PlanPreview, PlanTitle } from './PlanPreview.tsx'
import { planDefinition } from './plan-definition.ts'
import { planResourceProvider } from './plan-resource.ts'
import { planAddress, parsePlanAddress, samePlanSession } from './plan.ts'
import { isReviewPreviewAddress, reviewPreviewAddress } from './review-preview.ts'
import { createPlanReviewStore } from './review-store.ts'
import { PlanChip } from './PlanModeControl.tsx'
import {
  addPlanComment, carryPlanComments, createPlanCommentStore, formatPlanFeedback, removePlanComments, resolvePlanComments,
  sessionComments, updatePlanComment,
} from './comments.ts'
import {
  PlanCommentChip, PlanReviewDecision, type PlanCommentChipInjected, type PlanCommentsInjected, type PlanReviewDecisionInjected,
} from './PlanCommentControls.tsx'
import type { PlanPreviewInjected } from './PlanPreview.tsx'
import { en, zh, type PlanKey } from './locales.ts'

export type { PlanKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer plan chip's copy. */
    plan: PlanKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'plan'

/** Injected business face of the composer plan seat. */
export interface PlanChipInjected {
  /**
   * Leave plan mode by executing /plan off.
   * @returns null on admitted execution; a user-visible failure line otherwise.
   */
  exitPlanMode: () => Promise<string | null>
}

/** Services for plan controls, Conversation projection, composer messages, and resource navigation. */
export const inject = ['slots', 'remote', 'remote.commands', 'remote.session', 'sessions', 'locale', 'conversation', 'uiConversation', 'resources', 'sidebarRight', 'sidebarRightTabs']

/**
 * Register plan controls, permanent Chat cards, sidebar document reading, and
 * plan comments: comments live in this fiber's memory; a review decision, the
 * next plain composer message, or the chip's send action carries the unsent
 * ones of their Session and marks them resolved. Each Session shows one plan
 * tab: opening another plan of the same plan Session replaces it.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plan: dictionaries')

  const previewId = '@deepseek-ai/dsh-client-ui-plan'
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.uiConversation.events.register(planDefinition), 'ui-plan: conversation definition')
  ctx.effect(() => ctx.resources.register(planResourceProvider(ctx.remote.session)), 'ui-plan: resources')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: previewId, kind: 'plan', patterns: ['dsh-resource://plan/**', 'dsh-resource://plan-review/**'], priority: 'builtin',
    canOpen: address => parsePlanAddress(address) !== undefined || isReviewPreviewAddress(address),
    title: () => t('preview.title'),
  }), 'ui-plan: sidebar type')
  const logged = (sessionId: SessionId, callId: ToolCallId): string => {
    const child = ctx.sessions.subagentAddress(sessionId)
    const session = child === undefined ? { kind: 'session' as const, sessionId } : { kind: 'subagent' as const, ...child }
    return planAddress({ session, callId })
  }
  const openLogged = (address: string): void => {
    const target = parsePlanAddress(address)
    const onScreen = ctx.sidebarRight.mounted.getSnapshot()
    const tab = target === undefined ? undefined : ctx.sidebarRight.openTabs.getSnapshot().find(entry =>
      entry.sessionId === onScreen && entry.kind === 'plan' && entry.contentId !== address
      && samePlanSession(parsePlanAddress(entry.contentId), target))
    ctx.sidebarRight.openResource(address, tab === undefined ? {} : { replaceTab: tab.tabId })
  }
  const open = (sessionId: SessionId): PlanOpenInjected => ({
    openPlan: (callId) => { openLogged(logged(sessionId, callId)) },
  })
  const reviewWindow = randomUUID()
  const reviewDocument = (sessionId: SessionId, review: { callId?: ToolCallId }, requestKey: string): string =>
    review.callId === undefined ? reviewPreviewAddress(sessionId, `${reviewWindow}:${requestKey}`) : logged(sessionId, review.callId)
  const comments = createPlanCommentStore()
  const commentFace: PlanCommentsInjected = {
    hooks: { planComments: comments },
    removeComments: (address, ids) => { removePlanComments(comments, address, ids) },
    resolveComments: (address, ids) => { resolvePlanComments(comments, address, ids) },
  }
  const chipFace: PlanCommentChipInjected = {
    ...commentFace,
    sendComments: async (sessionId) => {
      const entries = sessionComments(comments.getSnapshot().documents, sessionId)
      if (entries.length === 0) return null
      const session = ctx.sessions.binding(sessionId)?.session
      // Failure strings stay English (error-surface policy: not localized).
      if (session === undefined) return `unknown session: ${sessionId}`
      const result = await session.prompt([{ type: 'text', text: formatPlanFeedback(entries.map(entry => entry.comment)) }], 'queue')
      if (!result.ok) return `${result.error.message} (${result.error.code})`
      for (const { address, comment } of entries) resolvePlanComments(comments, address, [comment.id])
      return null
    },
  }
  ctx.effect(() => ctx.conversation.prefixes.register((sessionId) => {
    const entries = sessionComments(comments.getSnapshot().documents, sessionId)
    if (entries.length === 0) return undefined
    return {
      text: formatPlanFeedback(entries.map(entry => entry.comment)),
      commit: () => { for (const { address, comment } of entries) resolvePlanComments(comments, address, [comment.id]) },
    }
  }), 'ui-plan: comments in composer messages')
  const reviewStore = createPlanReviewStore()
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: previewId, locale: NS,
    inject: (sessionId: SessionId): PlanCardsInjected => {
      const binding = ctx.sessions.binding(sessionId)
      if (binding === undefined) throw new Error(`ui-plan: unknown session "${sessionId}"`)
      const chat = ctx.uiConversation.binding(binding).target('chat')
      return {
        ...open(sessionId),
        keyedHooks: {
          plans: (turn) => {
            const snapshot = chat.getSnapshot()
            if (snapshot === undefined) throw new Error('ui-plan: Chat target is unavailable')
            return snapshot.nodes.turnDataSource(Number(turn), 'submitted-plan')
          },
        },
      }
    },
  }, PlanCards))
  ctx.slots.inject('conversation.plan-review.actions', () => ctx.slots.register({
    name: 'conversation.plan-review.actions', id: previewId, locale: NS, store: reviewStore,
    inject: (sessionId: SessionId): PlanReviewOpenInjected => ({
      openReview: (review, requestKey) => {
        if (review.callId !== undefined) { open(sessionId).openPlan(review.callId); return }
        ctx.sidebarRight.openResource(reviewDocument(sessionId, review, requestKey), {
          params: { planReview: { markdown: review.plan, title: extractMarkdownPlainText(review.plan, { mode: 'first-line' }) } },
        })
      },
      hooks: { sidebarMounted: ctx.sidebarRight.mounted },
    }),
  }, PlanReviewOpen))
  ctx.slots.inject('conversation.plan-review.decision', () => ctx.slots.register({
    name: 'conversation.plan-review.decision', locale: NS,
    inject: (sessionId: SessionId): PlanReviewDecisionInjected => ({
      ...commentFace,
      documentOf: (review, requestKey) => reviewDocument(sessionId, review, requestKey),
    }),
  }, PlanReviewDecision))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: previewId, order: 10, locale: NS, inject: (): PlanCommentChipInjected => chipFace,
  }, PlanCommentChip))
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: previewId, locale: NS,
    inject: (): PlanPreviewInjected => ({
      hooks: commentFace.hooks,
      addComment: (address, anchor, text) => { addPlanComment(comments, address, { ...anchor, id: randomUUID(), text }) },
      updateComment: (address, id, text) => { updatePlanComment(comments, address, id, text) },
      removeComment: (address, id) => { removePlanComments(comments, address, [id]) },
      carryComments: (from, to, text) => { carryPlanComments(comments, from, to, text) },
    }),
  }, PlanPreview))
  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: previewId,
  }, PlanTitle))

  ctx.slots.inject('conversation.input.plan', () => ctx.slots.register({
    name: 'conversation.input.plan',
    locale: NS,
    inject: (sessionId: SessionId): PlanChipInjected => ({
      // Failure strings stay English (error-surface policy: not localized).
      exitPlanMode: async () => {
        const result = await ctx.remote.commands.execute(sessionId, '/plan off', [])
        if (!result.ok) return `${result.error.message} (${result.error.code})`
        if (result.value === undefined) return 'unknown command: /plan off'
        return null
      },
    }),
  }, PlanChip))
}
