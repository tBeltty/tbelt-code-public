/**
 * Deliverables plugin, browser half: registers the changed-files card and
 * delivery cards into the chat view's turn-tail list, the `present` and
 * `preview` tool rows, the `changes-review` right-Sidebar tab type that
 * reviews one turn's changed files one comparison
 * at a time, the `artifacts` right-Sidebar page that lists the Session's
 * delivered and changed files by Turn with its Session-header button, and provides the `chatFileMentions` service that links
 * inline-code mentions of produced or delivered files in the closing prose.
 * All policy lives here — the supported mutation calls, mention matching, row
 * cap, and copy — so composing this plugin out of cordis.yml removes every
 * surface; the owning view renders an empty list and inert prose at zero cost.
 */
import './file-actions.ts'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type { ChatFileMentions } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-browser/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { changesReviewAddress } from '../changes.ts'
import { ArtifactsButton, type ArtifactsButtonInjected } from './ArtifactsButton.tsx'
import { ArtifactsTab, type ArtifactsInjected } from './ArtifactsTab.tsx'
import { ARTIFACTS_ID, ARTIFACTS_KIND, artifactsDefinition } from './artifacts-definition.ts'
import { sessionArtifacts, type ArtifactTurn } from './session-artifacts.ts'
import { ChangesDiffStore } from './changes-diff.ts'
import { ChangesSummaryStore } from './changes-summary.ts'
import { DiffCommentStore, formatDiffComments } from './diff-comments.ts'
import { PresentedOpenController } from './present-open.ts'
import { PresentRow } from './PresentRow.tsx'
import { PreviewRow, type PreviewInjected } from './PreviewRow.tsx'
import { DeliverablesTail, type DeliverablesInjected } from './Deliverables.tsx'
import { ReviewTab, type ReviewInjected } from './ReviewTab.tsx'
import { CHANGES_REVIEW_ID, changesReviewDefinition } from './review-definition.ts'
import { createReviewStore } from './review-store.ts'
import { en, NS, zh, type DeliverablesKey } from './locales.ts'
import {
  deliverablesDefinition, presentedForClosing, producedFileMentions, selectProducedFiles,
} from './turn-deliverables.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Changed-files card, review tab, delivery card, and file-mention copy. */
    'deliverables': DeliverablesKey
  }
}

/** Required services for the tail-slot and tab-type registrations and their dictionaries. */
export const inject = [
  'slots', 'locale', 'sessions', 'uiConversation', 'conversation', 'remote', 'remote.session', 'sidebarRightTabs', 'sidebarRight', 'configForms',
]

/**
 * Client plugin body: register the dictionaries, the turn-tail entry, the comparison tab type, and the Artifacts page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const opener = new PresentedOpenController()
  const summaries = new ChangesSummaryStore()
  const diffs = new ChangesDiffStore()
  const comments = new DiffCommentStore()
  ctx.effect(() => () => Promise.all([opener.dispose(), summaries.dispose(), diffs.dispose()]))
  ctx.on('connection/reset', () => {
    opener.resetHost()
    summaries.reset()
    diffs.reset()
  })
  ctx.effect(() => ctx.conversation.prefixes.register((sessionId) => {
    const entries = comments.unsent(sessionId)
    if (entries.length === 0) return undefined
    return { text: formatDiffComments(entries), commit: () => { comments.markSent(sessionId, entries.map(entry => entry.id)) } }
  }), 'ui-deliverables: line comments in composer messages')
  ctx.uiConversation.events.register(deliverablesDefinition)
  const deliverablesFace = (): DeliverablesInjected => ({
    hooks: { changesDiff: diffs.state, presentedOpen: opener.state, presentedHost: opener.host, changesSummary: summaries.state,
      showCodeDiff: ctx.configForms.developerTools.enabled },
    loadChangesDiff: (sessionId, seq, index) => diffs.load(sessionId, seq, index),
    reloadPresentedHost: () => opener.loadHost(),
    loadChangesSummary: (sessionId, seq) => summaries.load(sessionId, seq),
    openPresented: (sessionId, seq, index, action, application) => opener.open(sessionId, seq, index, action, application),
    openChanged: (sessionId, seq, index, action, application) => opener.openChanged(sessionId, seq, index, action, application),
    openChangesReview: (coordinates, index) => {
      ctx.sidebarRight.openResource(changesReviewAddress(coordinates), { params: { index } })
    },
  })
  // One artifact index per bound Session; a rebound Session gets a fresh one.
  const artifactIndexes = new WeakMap<SessionBinding, ObservableSnapshot<readonly ArtifactTurn[]>>()
  const artifacts: ArtifactsInjected['artifacts'] = (sessionId) => {
    const binding = ctx.sessions.binding(sessionId)
    if (binding === undefined) return undefined
    let index = artifactIndexes.get(binding)
    if (index === undefined) {
      const chat = ctx.uiConversation.binding(binding).target('chat')
      index = sessionArtifacts({
        getSnapshot: () => chat.getSnapshot()?.timeline,
        subscribe: listener => chat.subscribe(listener),
      })
      artifactIndexes.set(binding, index)
    }
    return index
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-deliverables: dictionaries')
  ctx.slots.inject(
    'conversation.chat.turnTail',
    () => ctx.slots.register({
      name: 'conversation.chat.turnTail',
      id: '@deepseek-ai/dsh-client-ui-deliverables',
      locale: NS,
      children: { 'deliverables.file.actions': { kind: 'list', scope: 'session' } },
      inject: deliverablesFace,
    }, DeliverablesTail),
  )
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'present', locale: NS }, PresentRow,
  ))
  // Loopback pages open in a Browser tab when one is composed; otherwise the system browser shows them.
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'preview', locale: NS,
    inject: (): PreviewInjected => ({
      openUrl: (url) => {
        if (ctx.get('sidebarRightTabs')?.get('browser') !== undefined) ctx.sidebarRight.openTab('browser', { params: { url } })
        else window.open(url, '_blank', 'noopener,noreferrer')
      },
    }),
  }, PreviewRow))
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register(changesReviewDefinition(t)), 'ui-deliverables: changes-review type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    {
      name: 'sidebar.right.pane.tab', key: CHANGES_REVIEW_ID, locale: NS, store: createReviewStore(),
      children: { 'deliverables.review.file.actions': { kind: 'list', scope: 'session' } },
      inject: (): ReviewInjected => ({
        hooks: {
          changesSummary: summaries.state, changesDiff: diffs.state, presentedOpen: opener.state, presentedHost: opener.host,
          diffComments: comments.state,
        },
        loadChangesSummary: (sessionId, seq) => summaries.load(sessionId, seq),
        loadChangesDiff: (sessionId, seq, index) => diffs.load(sessionId, seq, index),
        reloadPresentedHost: () => opener.loadHost(),
        openChanged: (sessionId, seq, index, action, application) => opener.openChanged(sessionId, seq, index, action, application),
        addComment: (sessionId, filePath, lineNumber, body) => { comments.add(sessionId, filePath, lineNumber, body) },
        updateComment: (sessionId, id, body) => { comments.update(sessionId, id, body) },
        removeComment: (sessionId, id) => { comments.remove(sessionId, id) },
        sendComments: async (sessionId) => {
          const entries = comments.unsent(sessionId)
          if (entries.length === 0) return null
          const session = ctx.sessions.binding(sessionId)?.session
          // Failure strings stay English (error-surface policy: not localized).
          if (session === undefined) return `unknown session: ${sessionId}`
          const result = await session.prompt([{ type: 'text', text: formatDiffComments(entries) }], 'queue')
          if (!result.ok) return `${result.error.message} (${result.error.code})`
          comments.markSent(sessionId, entries.map(entry => entry.id))
          return null
        },
      }),
    },
    ReviewTab,
  )), 'ui-deliverables: changes-review body')
  ctx.effect(() => ctx.sidebarRightTabs.register(artifactsDefinition(t)), 'ui-deliverables: artifacts type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    {
      name: 'sidebar.right.pane.tab', key: ARTIFACTS_ID, locale: NS,
      children: { 'deliverables.artifacts.file.actions': { kind: 'list', scope: 'session' } },
      inject: (): ArtifactsInjected => ({ ...deliverablesFace(), artifacts }),
    },
    ArtifactsTab,
  )), 'ui-deliverables: artifacts body')
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'artifacts', order: -20, locale: NS,
    inject: (): ArtifactsButtonInjected => ({
      artifacts,
      openArtifacts: () => { ctx.sidebarRight.openTab(ARTIFACTS_KIND) },
    }),
  }, ArtifactsButton))
  // The prose side of the same vocabulary: the chat view reaches this face
  // via ctx.get, so its absence — this plugin composed out — is the off state.
  const mentions: ChatFileMentions = {
    forClosing(owner) {
      const paths = selectProducedFiles(owner)
      const presented = presentedForClosing(owner)
      if (paths === null && presented.length === 0) return undefined
      return producedFileMentions([...new Set([...paths ?? [], ...presented.map(file => file.path)])], owner.openFile,
        path => t('presented.previewButton', { name: path }))
    },
  }
  ctx.provide('chatFileMentions', mentions)
}
