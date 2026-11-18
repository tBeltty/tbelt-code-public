/** Worktree Sessions and the change request panel through the real optional bundle, a Git checkout, and a scripted GitHub CLI. */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type {} from '@deepseek-ai/dsh-experimental-forge-session'
import { pluginRecordOf, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { initialShortcutConfig, type DesktopShortcutInput, type ShortcutRevision } from '@deepseek-ai/dsh-client-shortcuts/protocol'
import { abbreviateHomePath } from '@deepseek-ai/dsh-util-workspace-path'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { expect, it, onTestFailed, onTestFinished } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, fixtureUserPrompts, launchWebScaffold, readPersistedEvents, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import {
  connectFreshWorkspace, hideSessionPanel, saveFailureShot, sessionPanelToggle, showSessionPanel, writeComposerDraft, EN_BROWSER_LOCALE,
} from './support.ts'

declare global {
  interface Window {
    forgeKeyboard: { readonly revision: ShortcutRevision; deliver(input: DesktopShortcutInput): void }
  }
}

const BUNDLE = fileURLToPath(new URL('../../../packages/experimental/forge-bundle', import.meta.url))
/** A plugin that uses the forge extension API: a Host lens, line annotations, and every forge slot. */
const EXTENSION = fileURLToPath(new URL('./fixtures/plugins/fixture-forge-extension', import.meta.url))
const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/lifecycle-chrome/session.v4.jsonl', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./expected/forge-panel', import.meta.url))
const MODE = webSnapshotMode()
const PULL = 'https://github.com/octo/demo/pull/7'
/** A draft change request that the double lets the panel mark ready and merge. */
const DRAFT = 'https://github.com/octo/demo/pull/9'
/** Message sent after the worktree is removed, which waits until the worktree is restored. */
const FOLLOW_UP = 'Summarize the failed check'
/** Reply to {@link FOLLOW_UP}, a model call appended after the borrowed scenario's single one. */
const FOLLOW_UP_REPLY = 'RESTORED'
const run = promisify(execFile)

/**
 * GitHub CLI double: signed in to github.com, with octo/demo allowing every
 * merge method and the viewer's usual one squash. GraphQL serves pull request
 * 7 with one failed and one passed check run, one unresolved thread, and a
 * required review, and pull request 9, an approved draft whose checks passed.
 * `gh pr ready 9` and the REST merge of pull request 9 change what later
 * queries report, through `state.json`, which can also move the head of pull
 * request 9. The compare API serves `compare.json`, keyed by `base...head`, and
 * otherwise, between a pull request's recorded base and its head, prints
 * `pr-N.diff`, or, when `pr-N.refused` exists, fails with that JSON error body
 * and the matching diagnostic as GitHub's HTTP 406 refusal. The raw contents API
 * serves `contents.json`, keyed by `path@commit`, and the commit listing of pull
 * request 7 serves `commits.json`, oldest first. The review thread read serves
 * `threads.json` as its one page of threads, with the viewer `lin`, who may write
 * to the repository and did not open either pull request, or no threads without it. `overview.json` replaces fields
 * of pull request 7, such as its checks and reviewers, and the viewer's
 * permission. Viewed marks start from `viewed.json`, keyed by path; reading
 * them fails while `viewed.unreadable` exists. Mutations, which arrive as
 * JSON on stdin, change what later reads report through `state.json`: replies,
 * which join the pending review whenever one exists, resolution, comment edits and
 * deletions, the pending review of `lin` with its new threads, which a
 * submission publishes, viewed marks, which fail while `viewed.refused` exists,
 * review requests, and branch updates. Each mutation is appended to
 * `mutations.jsonl`, each REST rerun to `reruns.jsonl`, and every invocation to `calls.jsonl`.
 */
const GH = `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const args = process.argv.slice(2)
const here = dirname(fileURLToPath(import.meta.url))
appendFileSync(join(here, 'calls.jsonl'), JSON.stringify(args) + '\\n')
const statePath = join(here, 'state.json')
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { ready: false, mergedAt: null }
const save = () => { writeFileSync(statePath, JSON.stringify(state)) }
if (args[0] === 'pr' && args[1] === 'view' && args[2] === '7') {
  const fields = args[args.indexOf('--json') + 1]
  const url = 'https://github.com/octo/demo/pull/7'
  process.stdout.write(fields !== 'url' ? JSON.stringify({ number: 7, title: 'Add the pull request panel' })
    : args.includes('--jq') ? url + '\\n' : JSON.stringify({ url }))
  process.exit(0)
}
if (args[0] === 'pr' && args[1] === 'ready' && args[2] === '9') {
  state.ready = true
  save()
  process.stderr.write('Pull request octo/demo#9 is marked as "ready for review"\\n')
  process.exit(0)
}
if (args[0] === 'api' && args[5] === 'repos/octo/demo/pulls/9/merge') {
  state.mergedAt = new Date().toISOString()
  save()
  process.stdout.write(JSON.stringify({ sha: 'c'.repeat(40), merged: true, message: 'Pull Request successfully merged' }))
  process.exit(0)
}
if (args[0] === 'api' && args[3] === 'repos/octo/demo/pulls/7') {
  process.stdout.write(JSON.stringify({ head: { sha: 'a'.repeat(40) }, state: 'open' }))
  process.exit(0)
}
if (args[0] === 'api' && args[4] === 'POST' && ['repos/octo/demo/pulls/7/comments', 'repos/octo/demo/pulls/7/reviews'].includes(args[5])) {
  const body = JSON.parse(readFileSync(0, 'utf8'))
  appendFileSync(join(here, 'reviews.jsonl'), JSON.stringify({ endpoint: args[5], body }) + '\\n')
  process.stdout.write(JSON.stringify({ html_url: 'https://github.com/octo/demo/pull/7#pullrequestreview-1' }))
  process.exit(0)
}
const BASE = 'e'.repeat(40)
const heads = () => ({ 7: 'a'.repeat(40), 9: state.head ?? 'b'.repeat(40) })
if (args[0] === 'api' && args.includes('Accept: application/vnd.github.diff')) {
  const [, range] = args.at(-1).split('/compare/')
  const chosen = existsSync(join(here, 'compare.json')) ? JSON.parse(readFileSync(join(here, 'compare.json'), 'utf8'))[range] : undefined
  if (chosen !== undefined) {
    process.stdout.write(chosen)
    process.exit(0)
  }
  const [base, head] = range.split('...')
  const number = Object.entries(heads()).find(([, oid]) => oid === head)?.[0]
  if (base !== BASE || number === undefined) {
    process.stderr.write('gh: Not Found (HTTP 404)\\n')
    process.exit(1)
  }
  const refused = join(here, 'pr-' + number + '.refused')
  if (existsSync(refused)) {
    const message = readFileSync(refused, 'utf8')
    process.stdout.write(JSON.stringify({ message, errors: [{ resource: 'PullRequest', field: 'diff', code: 'too_large' }], status: '406' }))
    process.stderr.write('gh: ' + message + ' (HTTP 406)\\n')
    process.exit(1)
  }
  await new Promise(resolve => process.stdout.write(readFileSync(join(here, 'pr-' + number + '.diff'), 'utf8'), resolve))
  process.exit(0)
}
if (args[0] === 'api' && args[3] === '-H' && args[4] === 'Accept: application/vnd.github.raw+json') {
  const [resource, query] = args[5].split('?')
  const path = decodeURIComponent(resource.slice('repos/octo/demo/contents/'.length))
  const text = JSON.parse(readFileSync(join(here, 'contents.json'), 'utf8'))[path + '@' + query.slice('ref='.length)]
  if (text === undefined) {
    process.stderr.write('gh: Not Found (HTTP 404)\\n')
    process.exit(1)
  }
  process.stdout.write(text)
  process.exit(0)
}
if (args[0] === 'api' && args[3] === '--method' && args[4] === 'POST' && args[5].startsWith('repos/octo/demo/actions/')) {
  appendFileSync(join(here, 'reruns.jsonl'), args[5] + '\\n')
  state.reruns = [...state.reruns ?? [], args[5]]
  save()
  process.exit(0)
}
if (args[0] === 'auth' && args[1] === 'status') {
  process.stdout.write('github.com\\n  Logged in to github.com account octo\\n')
  process.exit(0)
}
const review = () => ({ pending: null, published: [], replies: {}, resolved: {}, bodies: {}, deleted: [], ...state.review })
/** The signed-in reviewer, who did not open the pull requests. */
const VIEWER = 'lin'
/** One review comment node by \`login\`, which the viewer may change when it is the viewer's own. */
const commentNode = (id, body, login, pending) => ({ id, state: pending ? 'PENDING' : 'SUBMITTED', createdAt: '2026-10-09T01:00:00Z',
  url: pending ? null : 'https://github.com/octo/demo/pull/7#discussion_' + id, body,
  viewerCanUpdate: login === VIEWER, viewerCanDelete: login === VIEWER, author: { __typename: 'User', login, avatarUrl: null } })
if (args[0] === 'api' && args[1] === 'graphql' && args.includes('--input')) {
  const { query, variables } = JSON.parse(readFileSync(0, 'utf8'))
  const field = query.match(/\\{\\s*(\\w+)\\(input:/)[1]
  appendFileSync(join(here, 'mutations.jsonl'), JSON.stringify({ field, variables }) + '\\n')
  const current = review()
  const draft = thread => ({ id: 'new-' + (current.published.length + (current.pending?.threads.length ?? 0) + 1),
    path: thread.path, side: thread.side, line: thread.line, startLine: thread.startLine ?? null, body: thread.body })
  let payload
  if (field === 'markFileAsViewed' || field === 'unmarkFileAsViewed') {
    if (existsSync(join(here, 'viewed.refused'))) {
      process.stdout.write(JSON.stringify({ data: null, errors: [{ type: 'FORBIDDEN', message: readFileSync(join(here, 'viewed.refused'), 'utf8') }] }))
      process.exit(0)
    }
    state.viewed = { ...state.viewed, [variables.path]: field === 'unmarkFileAsViewed' ? 'UNVIEWED' : 'VIEWED' }
    payload = { clientMutationId: null }
  } else if (field === 'requestReviews') {
    // The reviewer lookup names each user \`user-<login>\`.
    state.requested = [...new Set([...state.requested ?? [], ...(variables.input.userIds ?? []).map(id => id.slice('user-'.length))])]
    payload = { clientMutationId: null }
  } else if (field === 'updatePullRequestBranch') {
    if (variables.input.expectedHeadOid !== 'a'.repeat(40)) {
      process.stdout.write(JSON.stringify({ data: null, errors: [{ type: 'UNPROCESSABLE', message: 'expected head sha did not match current head ref' }] }))
      process.exit(0)
    }
    state.updated = variables.input.updateMethod
    payload = { clientMutationId: null }
  } else if (field === 'addPullRequestReview') {
    current.pending = { id: 'review-1', commit: variables.commit, threads: [] }
    for (const thread of variables.threads ?? []) current.pending.threads.push(draft(thread))
    payload = { pullRequestReview: { id: 'review-1' } }
  } else if (field === 'addPullRequestReviewThread') {
    current.pending.threads.push(draft(variables))
    payload = { thread: { id: current.pending.threads.at(-1).id } }
  } else if (field === 'addPullRequestReviewThreadReply') {
    const replies = current.replies[variables.thread] ??= []
    // As on GitHub, a reply joins the pending review whenever one exists.
    replies.push({ id: variables.thread + '-reply-' + replies.length, body: variables.body, pending: variables.review !== null || current.pending !== null })
    payload = { comment: { id: replies.at(-1).id } }
  } else if (field === 'resolveReviewThread' || field === 'unresolveReviewThread') {
    current.resolved[variables.thread] = field === 'resolveReviewThread'
    payload = { thread: { id: variables.thread } }
  } else if (field === 'updatePullRequestReviewComment') {
    current.bodies[variables.comment] = variables.body
    payload = { pullRequestReviewComment: { id: variables.comment } }
  } else if (field === 'deletePullRequestReviewComment') {
    current.deleted.push(variables.comment)
    payload = { clientMutationId: null }
  } else if (field === 'submitPullRequestReview' || field === 'deletePullRequestReview') {
    if (field === 'submitPullRequestReview') current.published.push(...current.pending.threads)
    for (const replies of Object.values(current.replies)) {
      for (const reply of replies) if (reply.pending && field === 'deletePullRequestReview') current.deleted.push(reply.id)
      for (const reply of replies) reply.pending = false
    }
    current.pending = null
    payload = { pullRequestReview: { id: variables.review } }
  }
  state.review = current
  save()
  process.stdout.write(JSON.stringify({ data: { [field]: payload } }))
  process.exit(0)
}
if (args[0] === 'api' && args[1] === 'graphql') {
  const query = args.find(arg => arg.startsWith('query=')).slice('query='.length)
  const check = (name, conclusion, completedAt, databaseId = 101) => ({
    __typename: 'CheckRun', id: 'check-' + databaseId, name, status: 'COMPLETED', conclusion, databaseId,
    detailsUrl: 'https://github.com/octo/demo/actions/runs/1', startedAt: '2026-10-09T00:00:00Z', completedAt,
    checkSuite: { app: { id: 'github-actions' }, workflowRun: { databaseId: 1, event: 'pull_request', workflow: { id: 'ci', name: 'CI' } } },
  })
  const overview = existsSync(join(here, 'overview.json')) ? JSON.parse(readFileSync(join(here, 'overview.json'), 'utf8')) : {}
  const none = { totalCount: 0, nodes: [] }
  const requested = (state.requested ?? []).map(login => ({ asCodeOwner: false, requestedReviewer: { __typename: 'User', login, avatarUrl: null } }))
  const requests = overview.reviewRequests ?? none
  const reviewing = { totalCount: requests.totalCount + requested.length, nodes: [...requests.nodes, ...requested] }
  const pulls = {
    7: {
      id: 'pull-7', number: 7, url: 'https://github.com/octo/demo/pull/7', title: 'Add the pull request panel', state: 'OPEN', isDraft: false,
      updatedAt: '2026-10-09T00:00:00Z', closedAt: null, author: { login: 'octo' }, headRefName: 'feat', headRefOid: 'a'.repeat(40), baseRefOid: BASE,
      baseRefName: 'main', additions: 128, deletions: 14, mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', reviewDecision: 'REVIEW_REQUIRED',
      reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ isResolved: false }] },
      commits: { nodes: [{ commit: { statusCheckRollup: { id: 'rollup-7', state: 'FAILURE', contexts: overview.checks ?? {
        pageInfo: { hasNextPage: true, endCursor: 'checks-100' },
        nodes: Array.from({ length: 100 }, (_, i) => check('lint', 'FAILURE', '2026-10-08T00:00:42Z', i + 1)),
      } } } }] },
      viewerCanUpdateBranch: (overview.viewerCanUpdateBranch ?? false) && state.updated === undefined, canBeRebased: overview.canBeRebased ?? false,
      reviewRequests: reviewing, latestReviews: overview.latestReviews ?? none, latestOpinionatedReviews: overview.latestOpinionatedReviews ?? none,
      closingIssuesReferences: overview.closingIssues ?? none,
      ...overview.mergeable === undefined ? {} : { mergeable: overview.mergeable },
    },
    9: {
      id: 'pull-9', number: 9, url: 'https://github.com/octo/demo/pull/9', title: 'Add the merge button', state: state.mergedAt === null ? 'OPEN' : 'MERGED',
      isDraft: !state.ready, updatedAt: '2026-10-09T00:00:00Z', closedAt: state.mergedAt, author: { login: 'octo' },
      headRefName: 'feat/merge', headRefOid: heads()[9], baseRefName: 'main', baseRefOid: BASE, additions: 30, deletions: 2, mergeable: 'MERGEABLE',
      mergeStateStatus: state.ready ? 'CLEAN' : 'BLOCKED', reviewDecision: 'APPROVED',
      reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
      commits: { nodes: [{ commit: { statusCheckRollup: { id: 'rollup-9', state: 'SUCCESS', contexts: {
        pageInfo: { hasNextPage: false, endCursor: null }, nodes: [check('lint', 'SUCCESS', '2026-10-09T00:00:42Z')],
      } } } }] },
      viewerCanUpdateBranch: false, canBeRebased: true, reviewRequests: none, latestReviews: none, latestOpinionatedReviews: none,
      closingIssuesReferences: none,
    },
  }
  if (query.includes('commits(first: $first')) {
    const commits = existsSync(join(here, 'commits.json')) ? JSON.parse(readFileSync(join(here, 'commits.json'), 'utf8')) : []
    process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: { headRefOid: 'a'.repeat(40), commits: {
      totalCount: commits.length, pageInfo: { hasNextPage: false, endCursor: null },
      nodes: commits.map(commit => ({ commit: {
        oid: commit.sha, messageHeadline: commit.title, authoredDate: '2026-10-08T00:00:00Z',
        author: { name: 'Octo', user: { login: 'octo' } }, parents: { nodes: [{ oid: commit.parent }] },
      } })),
    } } } } }))
    process.exit(0)
  }
  const number = Number(args.find(arg => arg.startsWith('number='))?.slice('number='.length))
  if (query.includes('files(first: $first')) {
    if (existsSync(join(here, 'viewed.unreadable'))) {
      process.stdout.write(JSON.stringify({ data: null, errors: [{ message: readFileSync(join(here, 'viewed.unreadable'), 'utf8') }] }))
      process.exit(0)
    }
    const paths = readFileSync(join(here, 'pr-' + number + '.diff'), 'utf8').split('\\n')
      .filter(line => line.startsWith('diff --git ')).map(line => line.split(' b/').at(-1))
    const marks = { ...existsSync(join(here, 'viewed.json')) ? JSON.parse(readFileSync(join(here, 'viewed.json'), 'utf8')) : {}, ...state.viewed }
    process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: { headRefOid: pulls[number].headRefOid, files: {
      totalCount: paths.length, pageInfo: { hasNextPage: false, endCursor: null },
      nodes: paths.map(path => ({ path, viewerViewedState: marks[path] ?? 'UNVIEWED' })),
    } } } } }))
    process.exit(0)
  }
  if (query.includes('user(login: $u0)')) {
    const users = Object.fromEntries(args.flatMap(arg => /^u\\d+=/.test(arg) ? [[arg.split('=')[0], { id: 'user-' + arg.slice(arg.indexOf('=') + 1) }]] : []))
    process.stdout.write(JSON.stringify({ data: users }))
    process.exit(0)
  }
  if (query.includes('assignableUsers')) {
    const people = [['mona', 'Mona Lisa'], ['hubot', null], ['lin-reviewer', 'Lin']].map(([login, name]) => ({ login, name, avatarUrl: null }))
    const search = args.find(arg => arg.startsWith('search=')).slice('search='.length)
    process.stdout.write(JSON.stringify({ data: { repository: {
      assignableUsers: { nodes: people.filter(person => person.login.includes(search)) },
      pullRequest: { author: { login: 'octo' }, suggestedReviewers: [{ reviewer: people[2] }] },
    } } }))
    process.exit(0)
  }
  if (query.includes('viewer { login }')) {
    const number = Number(args.find(arg => arg.startsWith('number=')).slice('number='.length))
    const current = review()
    const page = nodes => ({ pageInfo: { hasNextPage: false, endCursor: null }, nodes })
    const written = (thread, pending) => ({
      id: thread.id, isOutdated: false, isResolved: false, path: thread.path, diffSide: thread.side, startDiffSide: thread.startLine === null ? null : thread.side,
      line: thread.line, startLine: thread.startLine, originalLine: thread.line, originalStartLine: thread.startLine, subjectType: 'LINE',
      viewerCanReply: true, viewerCanResolve: true, viewerCanUnresolve: false,
      root: { nodes: [{ diffHunk: '@@ -1,5 +1,5 @@', commit: { oid: pulls[number].headRefOid }, originalCommit: { oid: pulls[number].headRefOid } }] },
      comments: page([commentNode(thread.id + '-0', thread.body, VIEWER, pending)]),
    })
    const stored = existsSync(join(here, 'threads.json')) ? JSON.parse(readFileSync(join(here, 'threads.json'), 'utf8')) : []
    const threads = [...stored, ...current.published.map(thread => written(thread, false)),
      ...(current.pending?.threads ?? []).map(thread => written(thread, true))].map((thread) => {
      const replies = (current.replies[thread.id] ?? []).map(reply => commentNode(reply.id, reply.body, VIEWER, reply.pending))
      const comments = [...thread.comments.nodes, ...replies].filter(comment => !current.deleted.includes(comment.id))
        .map(comment => ({ ...comment, body: current.bodies[comment.id] ?? comment.body }))
      return { ...thread, isResolved: current.resolved[thread.id] ?? thread.isResolved, comments: page(comments) }
    }).filter(thread => thread.comments.nodes.length > 0)
    const pendingComments = threads.flatMap(thread => thread.comments.nodes).filter(comment => comment.state === 'PENDING').length
    process.stdout.write(JSON.stringify({ data: { viewer: { login: VIEWER }, repository: { isArchived: false, viewerPermission: 'WRITE',
      pullRequest: { id: 'pull-' + number, headRefOid: pulls[number].headRefOid, locked: false, viewerDidAuthor: false,
        reviews: { nodes: current.pending === null ? [] : [{ id: current.pending.id, viewerDidAuthor: true, comments: { totalCount: pendingComments } }] },
        reviewThreads: page(threads) } } } }))
    process.exit(0)
  }
  if (query.includes('reviews(states: PENDING')) {
    const number = Number(args.find(arg => arg.startsWith('number=')).slice('number='.length))
    const pending = review().pending
    // Every thread and comment the double serves belongs to the pull request it was read from.
    const target = args.some(arg => arg.startsWith('target=')) ? { target: { pullRequest: { id: 'pull-' + number } } } : {}
    process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: { id: 'pull-' + number, headRefOid: pulls[number].headRefOid,
      reviews: { nodes: pending === null ? [] : [{ id: pending.id, viewerDidAuthor: true }] } } }, ...target } }))
    process.exit(0)
  }
  if (query.includes('pullRequest(number: $number)')) {
    process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: {
      id: 'pull-' + number, headRefOid: pulls[number].headRefOid, baseRefOid: BASE,
    } } } }))
    process.exit(0)
  }
  if (query.includes('node(id: $id)')) {
    process.stdout.write(JSON.stringify({ data: { node: { contexts: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [check('lint', 'SUCCESS', '2026-10-09T00:00:42Z'), check('test', 'FAILURE', '2026-10-09T00:02:07Z')],
    } } } }))
    process.exit(0)
  }
  const settings = {
    squashMergeAllowed: true, mergeCommitAllowed: true, rebaseMergeAllowed: true, viewerPermission: overview.viewerPermission ?? 'WRITE',
    viewerDefaultMergeMethod: 'SQUASH',
  }
  const data = {}
  let repository
  for (const match of query.matchAll(/(r\\d+): repository\\(|(p\\d+): pullRequest\\(number: (\\d+)\\)/g)) {
    if (match[1] !== undefined) data[repository = match[1]] = { ...settings }
    else data[repository][match[2]] = pulls[Number(match[3])] ?? null
  }
  process.stdout.write(JSON.stringify({ data }))
  process.exit(0)
}
process.stderr.write('unexpected gh invocation\\n')
process.exit(1)
`

/** Head commit of pull request 7 in the GitHub CLI double. */
const HEAD7 = 'a'.repeat(40)

/** Patch of pull request 9: one line added to each of 301 files, more than the pull request diff endpoint accepts. */
const PR9_DIFF = Array.from({ length: 301 }, (_, index) => [
  `diff --git a/merge/m${index}.ts b/merge/m${index}.ts`, 'index 1111111..2222222 100644', `--- a/merge/m${index}.ts`, `+++ b/merge/m${index}.ts`,
  '@@ -1 +1,2 @@', ' export {}', `+export const m${index} = ${index}`, '',
].join('\n')).join('')

/** Message of the double's HTTP 406 refusal, which it sends in the error body format GitHub uses for a diff over its size limit. */
const PR9_REFUSAL = 'Sorry, the diff exceeded the size limit.'

/** Line `n` of `src/panel.ts` before (`old`) or after (`new`) pull request 7, which changes lines 2 and 15 of its 20. */
function panelLine(n: number, side: 'old' | 'new'): string {
  if (n === 2) return side === 'old' ? 'export const n2 = 2' : 'export const n2 = \'two\''
  if (n === 7) return 'export const n7 = "Long unchanged context stays wrapped while switching between Sessions and reviewing the same file"'
  if (n === 15) return side === 'old' ? 'export const n15 = 15' : 'export const n15 = \'fifteen\''
  return `export const n${n} = ${n}`
}

/** Patch of pull request 7 as `gh pr diff` prints it: two hunks of `src/panel.ts` and the new `docs/panel.md`. */
const PR7_DIFF = [
  'diff --git a/src/panel.ts b/src/panel.ts',
  'index 1111111..2222222 100644',
  '--- a/src/panel.ts',
  '+++ b/src/panel.ts',
  '@@ -1,5 +1,5 @@',
  ` ${panelLine(1, 'new')}`, `-${panelLine(2, 'old')}`, `+${panelLine(2, 'new')}`,
  ...[3, 4, 5].map(n => ` ${panelLine(n, 'new')}`),
  '@@ -12,7 +12,7 @@',
  ...[12, 13, 14].map(n => ` ${panelLine(n, 'new')}`), `-${panelLine(15, 'old')}`, `+${panelLine(15, 'new')}`,
  ...[16, 17, 18].map(n => ` ${panelLine(n, 'new')}`),
  'diff --git a/docs/panel.md b/docs/panel.md',
  'new file mode 100644',
  'index 0000000..3333333',
  '--- /dev/null',
  '+++ b/docs/panel.md',
  '@@ -0,0 +1,2 @@',
  '+# Panel',
  '+Shows the change requests of a Session.',
  '',
].join('\n')

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' } })
  return stdout.trim()
}

/** A Web scaffold with the bundle, a GitHub checkout of `main` and `release`, and the New Session screen of that workspace. */
interface PanelLaunch {
  readonly scaffold: WebScaffold
  readonly page: Page
  /** Temporary directory of the GitHub CLI double and its call log. */
  readonly root: string
  /** The Session's workspace, a main checkout. */
  readonly project: string
  readonly tripwire: ReturnType<typeof watchConsole>
}

/**
 * Launch the bundle against a GitHub checkout of `main` and `release` and open the New Session screen of that workspace.
 * @param failureShot - name of the screenshot saved when the test fails.
 * @param scenario - normal conversation, a restoration follow-up, or a numbered PR lookup through `bash` or a PTC program.
 * @param options - desktop transport, checkout branch, browser input, sandbox runner availability, diff output limit, and
 * whether the extension fixture plugin loads.
 * @returns the scaffold, page, and checkout.
 */
async function launchPanel(failureShot: string, scenario: 'normal' | 'follow-up' | 'reference' | 'ptc-reference' = 'normal',
  options: {
    desktop?: 'darwin' | 'win32'
    branch?: string
    hasTouch?: boolean
    missingSandbox?: boolean
    maxDiffBytes?: number
    extension?: boolean
  } = {}): Promise<PanelLaunch> {
  const { desktop } = options
  const resources: { scaffold?: WebScaffold; browser?: Browser } = {}
  const root = await mkdtemp(join(tmpdir(), 'dsh-forge-panel-'))
  onTestFinished(async () => {
    const failures: unknown[] = []
    await resources.browser?.close().catch((error: unknown) => failures.push(error))
    await resources.scaffold?.close().catch((error: unknown) => failures.push(error))
    await rm(root, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    if (failures.length > 0) throw new AggregateError(failures, 'Forge panel teardown failed')
  })
  const gh = join(root, 'gh')
  await writeFile(gh, GH)
  await chmod(gh, 0o755)
  await writeFile(join(root, 'pr-7.diff'), PR7_DIFF)
  await writeFile(join(root, 'pr-9.diff'), PR9_DIFF)
  const panelText = `${Array.from({ length: 20 }, (_, index) => panelLine(index + 1, 'new')).join('\n')}\n`
  await writeFile(join(root, 'contents.json'), JSON.stringify({ [`src/panel.ts@${HEAD7}`]: panelText }))
  const overlay = join(root, 'forge.patch.yml')
  await writeFile(overlay, `- id: forge-github\n  config: ${JSON.stringify({ ghCommand: gh })}\n`
    + (options.maxDiffBytes === undefined ? '' : `- id: forge-panel\n  config: ${JSON.stringify({ maxDiffBytes: options.maxDiffBytes })}\n`)
    + (options.missingSandbox ? `- id: sandbox\n  config: ${JSON.stringify({ runnerCommand: [join(root, 'missing-sandbox')], runnerFailureSignatures: ['sandbox startup failed'] })}\n` : ''))
  const override = join(root, 'replay.override.json')
  // The borrowed scenario records one model call, so index 1 appends the reply to the follow-up.
  if (scenario === 'follow-up') await writeFile(override, JSON.stringify({ patches: [{ at: 1, entry: { kind: 'chunks', chunks: textReply(FOLLOW_UP_REPLY) } }] }))
  const reference = scenario === 'reference' || scenario === 'ptc-reference'
  if (reference) {
    const command = `PATH=${JSON.stringify(`.fixture-bin:${process.env.PATH ?? ''}`)} gh pr view 7 --repo octo/demo --json number,title 2>&1 | head -200`
    const bash = { command, description: 'View PR metadata' }
    const call = { type: 'tool-call', id: 'view-pr', ...scenario === 'reference'
      ? { name: 'bash', arguments: JSON.stringify(bash) }
      : { name: 'run_code', arguments: JSON.stringify({ code: `await tools.bash(${JSON.stringify(bash)})`, description: 'View PR metadata' }) } }
    await writeFile(override, JSON.stringify({ patches: [
      { at: 0, entry: { kind: 'chunks', chunks: [
        { type: 'block-start', index: 0, blockType: 'tool-call' },
        { type: 'block-end', index: 0, block: call },
        { type: 'finish', reason: { kind: 'tool-calls' } },
      ] } },
      { at: 1, entry: { kind: 'chunks', chunks: textReply('Viewed PR 7.') } },
    ] }))
  }
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, ...options.extension === true ? [{ dir: EXTENSION, enabled: true }] : []] },
    extraOverlayPath: overlay,
    replayFixture: FIXTURE,
    ...scenario !== 'normal' ? { replayOverride: override } : {},
    // The worktree notice, worktree records, and bindings are asserted separately from the borrowed conversation.
    compareReplaySession: false,
  })
  resources.scaffold = scaffold

  const project = join(scaffold.workspaceCwd, 'workspace')
  await mkdir(project, { recursive: true })
  await git(project, 'init', '--quiet', '--initial-branch=main')
  await git(project, 'config', 'user.name', 'Forge Panel')
  await git(project, 'config', 'user.email', 'forge-panel@example.test')
  await git(project, 'config', 'commit.gpgsign', 'false')
  await writeFile(join(project, 'README.md'), 'demo\n')
  await git(project, 'add', 'README.md')
  await git(project, 'commit', '--quiet', '-m', 'init')
  await git(project, 'remote', 'add', 'origin', 'https://github.com/octo/demo.git')
  await git(project, 'branch', 'release')
  await git(project, 'commit', '--quiet', '--allow-empty', '-m', 'main only')
  if (options.branch !== undefined) await git(project, 'checkout', '--quiet', '-b', options.branch)
  if (reference) {
    // The model's confined command must own the CLI double's writable call log.
    const modelBin = join(project, '.fixture-bin')
    await mkdir(modelBin)
    await writeFile(join(modelBin, 'gh'), GH)
    await chmod(join(modelBin, 'gh'), 0o755)
  }

  const browser = await chromium.launch()
  resources.browser = browser
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: EN_BROWSER_LOCALE, timezoneId: 'Asia/Shanghai',
    hasTouch: options.hasTouch ?? false })
  if (desktop !== undefined) {
    // Only Electron's keyboard transport is substituted; the product registry and menus remain real.
    await page.addInitScript(({ device, config }) => {
      const mark = () => { document.documentElement.dataset.platform = device }
      if (document.documentElement === null) window.addEventListener('DOMContentLoaded', mark)
      else mark()
      const listeners = new Set<(input: DesktopShortcutInput) => void>()
      Object.assign(window, {
        forgeKeyboard: { revision: config.revision,
          deliver: (input: DesktopShortcutInput) => { for (const listener of listeners) listener(input) } },
        dshDesktop: { protocolVersion: 1,
          shortcuts: { get: async () => config, subscribe: () => () => {}, recording: async () => {}, edit: async () => { throw new Error('Unused preference edit') } },
          keyboard: {
            subscribe: (listener: (input: DesktopShortcutInput) => void) => {
              listeners.add(listener)
              return () => { listeners.delete(listener) }
            },
            closeWindow: async () => {},
          },
        },
      })
    }, { device: desktop, config: { ...initialShortcutConfig(), status: 'ready' as const } })
  }
  const tripwire = watchConsole(page)
  onTestFailed(async () => { await saveFailureShot(page, failureShot) })
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await connectFreshWorkspace(page, scaffold.workspaceCwd)
  if (scenario === 'ptc-reference') {
    const [agent] = scaffold.ctx.agents.list()
    if (agent === undefined) throw new Error('The connected workspace has no blank Session')
    await scaffold.ctx.agentPresets.select(agent, 'ptc')
  }
  return { scaffold, page, root, project, tripwire }
}

/** Stream chunks of a model reply that is one text block. */
function textReply(text: string): unknown[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 50, outputTokens: 2, cacheReadTokens: 0, reasoningTokens: 0 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/**
 * Launch the panel and choose the worktree option of the fresh Session from `release`.
 * @param failureShot - name of the screenshot saved when the test fails.
 * @param followUp - whether the replay answers a second model call.
 * @returns the scaffold, page, and checkout.
 */
async function requestReleaseWorktree(failureShot: string, followUp = false): Promise<PanelLaunch> {
  const launched = await launchPanel(failureShot, followUp ? 'follow-up' : 'normal')
  const { page } = launched
  const option = page.locator('[data-forge-worktree]')
  await option.waitFor({ timeout: 20_000 })
  await option.getByRole('checkbox', { name: 'New worktree', exact: true }).check()
  await option.getByRole('button', { name: '基于 main', exact: true }).click()
  await page.getByRole('menuitem', { name: 'release', exact: true }).click()
  await option.getByRole('button', { name: '基于 release', exact: true }).waitFor()
  return launched
}

/**
 * Send the first prompt of the borrowed scenario.
 * @returns the prompt and the turn's settlement, which resolves to the Session id.
 */
async function sendPrompt(page: Page, scaffold: WebScaffold): Promise<{ readonly prompt: string; readonly settled: Promise<SessionId> }> {
  const [prompt] = fixtureUserPrompts(await readFile(FIXTURE, 'utf8'))
  if (prompt === undefined) throw new Error('The borrowed scenario requires a user prompt')
  const settled = scaffold.whenTurnSettled()
  const composer = page.locator('[data-composer-input]').first()
  await writeComposerDraft(page, composer, prompt)
  await composer.press('Enter')
  return { prompt, settled }
}

/**
 * Choose an item from the More menu of a change request card.
 * @param page - the page under test.
 * @param change - the card.
 * @param name - the card's name in the menu button, such as `#7`.
 * @param item - the item to choose.
 */
async function chooseCardAction(page: Page, change: Locator, name: string, item: string): Promise<void> {
  await change.getByRole('button', { name: `Actions for ${name}`, exact: true }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

/** Accessible name of the panel toggle while a change request needs attention. */
const TOGGLE_ATTENTION = 'Session panel Change requests of this Session need attention'

/**
 * A Session panel row as the panel's row rules lay it out: its height, how far
 * the centers of its icon and menu columns sit from its start and end edges
 * (null for a part that takes no room), and the part a press reaches at its
 * start edge and on its trailing part.
 */
function panelRowLayout(row: Locator) {
  return row.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const rectOf = (part: string): DOMRect | null => {
      const rect = element.querySelector(`[data-row-part="${part}"]`)?.getBoundingClientRect()
      return rect === undefined || rect.width === 0 ? null : rect
    }
    const partAt = (x: number, y: number): string | null =>
      document.elementFromPoint(x, y)?.closest('[data-row-part]')?.getAttribute('data-row-part') ?? null
    const [icon, trailing, menu] = [rectOf('icon'), rectOf('trailing'), rectOf('menu')]
    return {
      marked: element.hasAttribute('data-session-panel-row'),
      height: box.height,
      iconCenter: icon === null ? null : icon.left + icon.width / 2 - box.left,
      menuCenter: menu === null ? null : box.right - (menu.left + menu.width / 2),
      startPress: partAt(box.left + 2, box.top + 2),
      trailingPress: trailing === null ? null : partAt(trailing.left + trailing.width / 2, trailing.top + trailing.height / 2),
    }
  })
}

function worktreeRecords(events: readonly SessionEvent[]): unknown[] {
  return events.flatMap((event) => {
    const record = pluginRecordOf(event)
    if (record?.type === 'plugin:client-ui-forge/worktree') return [record.data]
    if (record?.type === 'plugin:worktree/created') return [{ created: record.data }]
    return []
  })
}

it.skipIf(MODE === 'record')('reads local Git with full access when the sandbox runner cannot start', async () => {
  const { scaffold, page, project, tripwire } = await launchPanel('web-e2e-forge-permissions', 'normal', { missingSandbox: true })
  await git(project, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  await git(project, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  await writeFile(join(project, 'README.md'), 'demo\nchanged\n')
  const { settled } = await sendPrompt(page, scaffold)
  const sessionId = await settled
  await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
  const panel = await showSessionPanel(page)
  const failed = panel.locator('[data-forge-checkout][data-failed]')
  await failed.getByText('Git information could not be read', { exact: true }).waitFor({ timeout: 20_000 })
  // The failure's reason shows from the info button, also on a press as touch screens need; another press hides it.
  const reason = failed.getByRole('button', { name: 'Show the reason', exact: true })
  await reason.click()
  await expect.poll(async () => (await page.getByRole('tooltip').textContent())?.trim().length ?? 0).toBeGreaterThan(0)
  await reason.click()
  await expect.poll(() => page.getByRole('tooltip').count()).toBe(0)

  const permission = page.locator('button[aria-label^="访问模式"]').first()
  await permission.click()
  await page.getByRole('menuitem', { name: 'Full access', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Enable Full access?' })
  await confirmation.getByRole('checkbox', { name: 'I understand the risks and want to continue' }).check()
  await confirmation.getByRole('button', { name: 'Enable Full access' }).click()
  await showSessionPanel(page)
  const local = page.locator('[data-forge-local]')
  await local.getByRole('button', { name: '本地变更 · 1 个文件，新增 1 行，删除 0 行', exact: true }).waitFor({ timeout: 20_000 })
  await compareOrRefreshGolden(join(EXPECTED, 'full-access.expected.md'), await captureStableAria(page, '[data-forge-local]', scaffold.workspaceCwd), MODE)
  // The panel lays the row out by its marks: one 28px line with the icon and the More button on the panel columns.
  // The body is the row's button, so a press at the row's edge reaches it, while the diff size stays above it.
  expect(await panelRowLayout(local)).toEqual({ marked: true, height: 28, iconCenter: 14, menuCenter: 14, startPress: 'body', trailingPress: 'trailing' })
  // This composition registers no directory menu entries: the checkout row's menu takes no room, and its body is not a button.
  expect(await panelRowLayout(panel.locator('[data-forge-checkout]')))
    .toEqual({ marked: true, height: 28, iconCenter: 14, menuCenter: null, startPress: null, trailingPress: 'trailing' })
  await local.getByRole('button', { name: '本地变更 · 1 个文件，新增 1 行，删除 0 行', exact: true }).click()
  await page.locator('[data-forge-diff-file="README.md"]').getByText('changed', { exact: true }).waitFor()

  await permission.click()
  await page.getByRole('menuitem', { name: '工作区内修改', exact: true }).click()
  await showSessionPanel(page)
  await failed.getByText('Git information could not be read', { exact: true }).waitFor({ timeout: 20_000 })
  await expect.poll(async () => (await readPersistedEvents(scaffold, sessionId))
    .filter(event => event.type === 'sandbox/mode').map(event => event.data.mode).slice(-2))
    .toEqual(['danger-full-access', 'workspace-write'])
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('reports incomplete filter configuration and retries after it is corrected', async () => {
  const { scaffold, page, project, tripwire } = await launchPanel('web-e2e-forge-filter-config', 'normal', { maxDiffBytes: 512 })
  await git(project, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  await git(project, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  await writeFile(join(project, 'README.md'), 'demo\nchanged\n')
  const { settled } = await sendPrompt(page, scaffold)
  await settled
  await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
  await showSessionPanel(page)
  const openChanges = page.locator('[data-forge-local]').getByRole('button', { name: '本地变更 · 1 个文件，新增 1 行，删除 0 行', exact: true })
  await openChanges.waitFor({ timeout: 20_000 })
  const key = `filter.${'long'.repeat(200)}.clean`
  await git(project, 'config', key, 'cat')
  await openChanges.click()
  const changes = page.locator('[data-forge-changes="local"]')
  await changes.getByText('No comparison was run because Git filter settings could not be read completely. Check the Git settings and output limit, then retry.', { exact: true }).waitFor()
  await compareOrRefreshGolden(join(EXPECTED, 'filter-config-failed.expected.md'),
    await captureStableAria(page, '[data-forge-changes="local"]', scaffold.workspaceCwd), MODE)

  await git(project, 'config', '--unset', key)
  await changes.getByRole('button', { name: '重试', exact: true }).click()
  await changes.locator('[data-forge-diff-file="README.md"]').getByText('changed', { exact: true }).waitFor()
  expect(await changes.getByRole('status').count()).toBe(0)
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

/**
 * Expect the panel to show PR 7, which the model viewed by number without its URL in the output, and the lookup that resolved it.
 * @param launch - the panel launched for a reference scenario.
 * @param sessionId - Session whose binding records are read.
 */
async function expectNumberedReference({ scaffold, page, project, tripwire }: PanelLaunch, sessionId: SessionId): Promise<void> {
  await page.getByRole('button', { name: TOGGLE_ATTENTION, exact: true }).waitFor({ timeout: 20_000 })
  await showSessionPanel(page)
  const change = page.locator(`[data-forge-change="${PULL}"]`)
  await change.locator('[data-forge-opens]').filter({ hasText: 'Add the pull request panel' }).waitFor({ timeout: 20_000 })
  await change.getByText('等待评审', { exact: true }).waitFor()
  await compareOrRefreshGolden(join(EXPECTED, 'reference.expected.md'),
    await captureStableAria(page, `[data-forge-change="${PULL}"]`, scaffold.workspaceCwd), MODE)
  await expect.poll(async () => {
    await scaffold.ctx.sessionPersistence.flush()
    const boundEvents = await readPersistedEvents(scaffold, sessionId)
    return boundEvents.flatMap((event) => {
      const record = pluginRecordOf(event)
      return record?.type === 'plugin:forge-session/binding' ? [record.data] : []
    })
  }).toEqual([{ action: 'reference', url: PULL }])
  const calls = (await readFile(join(project, '.fixture-bin', 'calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[])
  expect(calls).toContainEqual(['pr', 'view', '7', '--repo', 'octo/demo', '--json', 'url', '--jq', '.url'])
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
}

it.skipIf(MODE === 'record')('automatically shows a numbered PR when gh JSON omits its URL', async () => {
  const launch = await launchPanel('web-e2e-forge-numbered-reference', 'reference')
  const { settled } = await sendPrompt(launch.page, launch.scaffold)
  const sessionId = await settled
  const events = await readPersistedEvents(launch.scaffold, sessionId)
  const request = events.find(event => event.type === 'request/header')
  expect(request?.data.header.tools?.filter(tool => tool.name === 'enter_worktree')).toHaveLength(1)
  const toolOutput = events.flatMap(event => event.type === 'tool/result'
    ? event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []) : []).join('\n')
  expect(toolOutput).toContain('Add the pull request panel')
  await expectNumberedReference(launch, sessionId)
})

it.skipIf(MODE === 'record')('automatically shows a numbered PR that a PTC program views when gh JSON omits its URL', async () => {
  const launch = await launchPanel('web-e2e-forge-ptc-reference', 'ptc-reference')
  const { settled } = await sendPrompt(launch.page, launch.scaffold)
  const sessionId = await settled
  const events = await readPersistedEvents(launch.scaffold, sessionId)
  expect(events.find(event => event.type === 'request/header')?.data.header.tools?.map(tool => tool.name)).toEqual(['run_code'])
  expect(events.flatMap(event => event.type === 'tool/call' ? [event.data.name] : [])).toEqual(['run_code'])
  const dispatches = events.flatMap(event => event.type === 'tool/ptc-dispatch' ? [event.data] : [])
  expect(dispatches.map(dispatch => [dispatch.name, dispatch.isError])).toEqual([['bash', false]])
  expect(dispatches[0]?.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')).toContain('Add the pull request panel')
  await expectNumberedReference(launch, sessionId)
})

it.skipIf(MODE === 'record')('starts a Session in a worktree before its first message, follows its change request, and restores the removed worktree', async () => {
  const { scaffold, page, root, project, tripwire } = await requestReleaseWorktree('web-e2e-forge-panel', true)
  const { settled } = await sendPrompt(page, scaffold)
  const sessionId = await settled
  await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
  await page.locator('[data-forge-creation]').waitFor({ state: 'detached' })
  await page.locator('[data-forge-worktree]').waitFor({ state: 'detached' })

  const session = scaffold.ctx.sessions.get(sessionId)
  if (session === undefined) throw new Error('The worktree Session must stay loaded')
  const directory = scaffold.ctx.workingDirectory.get(session)
  const branch = basename(directory)
  expect(directory).toBe(join(project, '.agents', 'worktrees', branch))
  expect(branch).toMatch(new RegExp(`^dsh-${sessionId.slice('session-'.length, 'session-'.length + 8)}-[0-9a-f]{4}$`))
  expect(await git(directory, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(branch)
  const baseCommit = await git(project, 'rev-parse', 'release')
  expect(await git(directory, 'rev-parse', 'HEAD')).toBe(baseCommit)
  const events = await readPersistedEvents(scaffold, sessionId)
  expect(worktreeRecords(events)).toEqual([
    { action: 'request', from: 'refs/heads/main' },
    { action: 'request', from: 'refs/heads/release' },
    { created: { path: directory, branch, baseCommit, repositoryRoot: project } },
  ])
  // The worktree existed before the turn, so the first model request carried its directory notice.
  const created = events.findIndex((event) => {
    const record = pluginRecordOf(event)
    return record?.type === 'plugin:worktree/created'
  })
  const turn = events.findIndex(event => event.type === 'turn/start')
  const notice = events.findIndex(event => event.type === 'user/message' && event.data.source.kind === 'working-directory')
  expect(created).toBeLessThan(turn)
  expect(notice).toBeGreaterThan(turn)
  expect(notice).toBeLessThan(events.findIndex(event => event.type === 'assistant/message'))

  // A change request bound the way a `gh pr create` result binds one.
  scaffold.ctx.forgeSession.track(session, PULL)
  await page.getByRole('button', { name: TOGGLE_ATTENTION, exact: true }).waitFor({ timeout: 20_000 })
  expect(await sessionPanelToggle(page).getAttribute('aria-expanded')).toBe('false')

  // The Session row marks the worktree and its change request's state, and its hover card names both.
  const row = page.locator(`[data-row-key="session:${sessionId}"]`)
  await row.getByRole('img', { name: 'In its own worktree', exact: true }).waitFor({ timeout: 20_000 })
  await row.getByRole('img', { name: '变更请求状态：需要处理 · 检查失败', exact: true }).waitFor({ timeout: 20_000 })
  // A fresh page cannot retain the previous browser source's status values.
  await page.goto('about:blank')
  await expect.poll(() => scaffold.ctx.storageDomain.get('forge_panel_change_requests')).toBeUndefined()
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await row.getByRole('img', { name: '变更请求状态：需要处理 · 检查失败', exact: true }).waitFor({ timeout: 20_000 })
  await row.hover()
  const rowHover = page.locator('[data-forge-session-hover]')
  await rowHover.getByText('#7 Add the pull request panel', { exact: true }).waitFor({ timeout: 20_000 })
  await compareOrRefreshGolden(join(EXPECTED, 'session-row-hover.expected.md'),
    await captureStableAria(page, '[data-forge-session-hover]', scaffold.workspaceCwd, { replacements: [[branch, 'dsh-{{worktree}}']] }), MODE)
  await page.mouse.move(0, 0)
  await rowHover.waitFor({ state: 'detached' })
  const panel = await showSessionPanel(page)
  const checkout = panel.locator('[data-forge-checkout]')
  const checkoutName = checkout.getByText(branch, { exact: true })
  await checkoutName.waitFor({ timeout: 20_000 })
  await checkout.getByText('工作树 · 基于 release', { exact: true }).waitFor()
  await checkoutName.hover()
  await page.getByRole('tooltip').filter({ hasText: `工作树（基于 release）：${abbreviateHomePath(directory, homedir())}` }).waitFor()
  await page.mouse.move(0, 0)
  const change = panel.locator(`[data-forge-change="${PULL}"]`)
  const title = change.locator('[data-forge-opens]').filter({ hasText: 'Add the pull request panel' })
  await title.waitFor({ timeout: 20_000 })
  // The only open change request starts expanded.
  await change.getByText('等待评审', { exact: true }).waitFor()
  // The random branch suffix can read as a duration, so the branch is replaced before the capture normalizes durations.
  await compareOrRefreshGolden(join(EXPECTED, 'panel.expected.md'),
    await captureStableAria(page, '[data-session-panel]', scaffold.workspaceCwd, {
      replacements: [[branch, 'dsh-{{worktree}}'], [abbreviateHomePath(scaffold.workspaceCwd, homedir()), '{{cwd}}']],
    }), MODE)
  const beforeChecks = (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[])
  expect(beforeChecks.some(args => args.includes('id=rollup-7'))).toBe(false)
  const checksRow = change.getByRole('button', { name: /^检查/ })
  await checksRow.click()
  const checks = page.getByRole('menu')
  // Failed checks are listed with the rerun; passed ones wait behind a toggle.
  await expect.poll(() => checks.getByRole('menuitem').allTextContents())
    .toEqual(['重跑失败项', expect.stringMatching(/^test/), '显示其余 1 项（通过、跳过）'])
  const afterChecks = (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[])
  expect(afterChecks.filter(args => args.includes('id=rollup-7'))).toHaveLength(1)
  await page.keyboard.press('Escape')
  await checks.waitFor({ state: 'detached' })
  expect(await checksRow.getAttribute('aria-expanded')).toBe('false')

  const bindings = async () => (await readPersistedEvents(scaffold, sessionId)).flatMap((event) => {
    const record = pluginRecordOf(event)
    return record?.type === 'plugin:forge-session/binding' ? [record.data] : []
  })
  await chooseCardAction(page, change, '#7', '从本会话移除')
  await change.waitFor({ state: 'detached' })
  await panel.locator('[data-session-panel-section="change-requests"]').waitFor({ state: 'hidden' })
  await page.getByRole('alert').filter({ hasText: '已从本会话移除 #7' }).getByRole('button', { name: '撤销', exact: true }).click()
  await showSessionPanel(page)
  await title.waitFor({ timeout: 20_000 })
  await expect.poll(bindings).toEqual([{ action: 'track', url: PULL }, { action: 'dismiss', url: PULL }, { action: 'track', url: PULL }])

  const calls = (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[])
  expect(calls).toContainEqual(['auth', 'status', '--hostname', 'github.com'])
  expect(calls.some(args => args[0] === 'api' && args[1] === 'graphql' && args.includes('--hostname'))).toBe(true)
  await hideSessionPanel(page)

  // Removing the worktree outside the Session holds the next message in the inbox until the worktree is restored.
  await git(project, 'worktree', 'remove', '--force', directory)
  const composer = page.locator('[data-composer-input]').first()
  await writeComposerDraft(page, composer, FOLLOW_UP)
  const accepted = page.waitForResponse('**/api/session/prompt')
  await composer.press('Enter')
  const envelope = await (await accepted).json() as { readonly result: unknown }
  expect(envelope.result).toMatchObject({ ok: true })
  const missing = page.locator('[data-forge-missing]')
  await missing.getByText(`可以在原位置恢复分支 ${branch} 的工作树。删除前未提交的修改无法恢复`, { exact: true }).waitFor()
  await missing.getByText('The message is sent after you restore the worktree or continue in the project', { exact: true }).waitFor()
  await showSessionPanel(page)
  await expect.poll(() => checkout.getAttribute('data-missing')).toBe('')
  const turns = async (): Promise<number> => (await readPersistedEvents(scaffold, sessionId)).filter(event => event.type === 'turn/start').length
  expect(await turns()).toBe(1)
  await missing.getByRole('button', { name: 'Restore worktree', exact: true }).click()
  await missing.waitFor({ state: 'detached', timeout: 20_000 })
  await page.getByRole('alert').filter({ hasText: 'Worktree restored' }).waitFor()
  expect(await git(directory, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(branch)
  expect(await git(directory, 'rev-parse', 'HEAD')).toBe(baseCommit)
  await showSessionPanel(page)
  await expect.poll(() => checkout.getAttribute('data-missing')).toBeNull()
  // The waiting message goes on in the restored worktree.
  await page.getByText(FOLLOW_UP_REPLY, { exact: true }).waitFor({ timeout: 20_000 })
  expect(await turns()).toBe(2)
  expect(scaffold.ctx.workingDirectory.get(session)).toBe(directory)
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('creates the requested worktree for the first message, not for the notice an access mode change queues before it', async () => {
  const { scaffold, page, project, tripwire } = await requestReleaseWorktree('web-e2e-forge-panel-access-mode')
  await page.locator('button[aria-label^="访问模式"]').first().click()
  await page.getByRole('menuitem', { name: '完全权限', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '确认启用完全权限？' })
  await confirmation.getByRole('checkbox', { name: '我已了解风险，并愿意继续' }).check()
  await confirmation.getByRole('button', { name: '启用完全权限' }).click()
  await page.locator('button[aria-label="访问模式，当前：完全权限"]').waitFor()
  // The switch queues its approval notice for the next step, which opens no turn. A hold would run as maintenance of
  // the Agent until the worktree exists, and the Session would then work in it.
  const noticed = () => scaffold.ctx.agents.list()
    .find(candidate => candidate.inbox.nextStep.some(message => message.source.kind === 'user-approval'))
  await expect.poll(() => noticed() !== undefined).toBe(true)
  const agent = noticed()
  if (agent === undefined) throw new Error('The access mode change must queue its notice')
  await agent.runMaintenance(() => Promise.resolve())
  expect(scaffold.ctx.workingDirectory.get(agent.session)).toBe(project)

  const { settled } = await sendPrompt(page, scaffold)
  const sessionId = await settled
  await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
  expect(sessionId).toBe(agent.session.id)

  // The prompt opens the first turn, and its hold creates the worktree.
  const events = await readPersistedEvents(scaffold, sessionId)
  const queued = (target: 'next-step' | 'next-turn', kind: string): number => events.findIndex(event => event.type === 'agent/inbox/spliced'
    && event.data.target === target && event.data.inserted.some(message => message.source.kind === kind))
  const created = events.findIndex(event => pluginRecordOf(event)?.type === 'plugin:worktree/created')
  expect(queued('next-step', 'user-approval')).toBeGreaterThan(-1)
  expect(queued('next-turn', 'user')).toBeGreaterThan(queued('next-step', 'user-approval'))
  expect(created).toBeGreaterThan(queued('next-turn', 'user'))
  expect(created).toBeLessThan(events.findIndex(event => event.type === 'turn/start'))
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('keeps the first message waiting when the worktree cannot be created, tries again, and sends it without the worktree', async () => {
  const { scaffold, page, project, tripwire } = await requestReleaseWorktree('web-e2e-forge-panel-failure')
  await git(project, 'branch', '--quiet', '-D', 'release')
  const { settled } = await sendPrompt(page, scaffold)
  const card = page.locator('[data-forge-creation="failed"]')
  const failure = card.getByRole('region', { name: 'The worktree could not be created', exact: true })
  await failure.getByText('Reason', { exact: true }).waitFor({ timeout: 20_000 })
  const attempted = await failure.getByRole('definition').first().textContent()
  expect(attempted).toMatch(/^dsh-[0-9a-f]{8}-[0-9a-f]{4}$/)
  await failure.getByText('The message is sent once the worktree exists', { exact: true }).waitFor()

  // Retry makes another attempt with a new branch name while the message keeps waiting.
  await card.getByRole('button', { name: '重试', exact: true }).click()
  await expect.poll(() => failure.getByRole('definition').first().textContent(), { timeout: 20_000 }).not.toBe(attempted)

  await card.getByRole('button', { name: 'Continue without a worktree', exact: true }).click()
  const sessionId = await settled
  await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
  await card.waitFor({ state: 'detached' })

  const session = scaffold.ctx.sessions.get(sessionId)
  if (session === undefined) throw new Error('The Session must stay loaded')
  expect(scaffold.ctx.workingDirectory.get(session)).toBe(project)
  const events = await readPersistedEvents(scaffold, sessionId)
  expect(worktreeRecords(events)).toEqual([
    { action: 'request', from: 'refs/heads/main' }, { action: 'request', from: 'refs/heads/release' }, { action: 'cancel' },
  ])
  expect(events.filter(event => event.type === 'turn/start')).toHaveLength(1)
  expect(events.some(event => event.type === 'user/message' && event.data.source.kind === 'working-directory')).toBe(false)
  const checkout = (await showSessionPanel(page)).locator('[data-forge-checkout]')
  const checkoutName = checkout.getByText('main', { exact: true })
  await checkoutName.waitFor({ timeout: 20_000 })
  await checkout.getByText('Project directory', { exact: true }).waitFor()
  await checkoutName.hover()
  await page.getByRole('tooltip').filter({ hasText: `项目目录：${abbreviateHomePath(project, homedir())}` }).waitFor()
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('marks a draft change request ready for review and merges it with the usual method', async () => {
  const { scaffold, page, root, tripwire } = await launchPanel('web-e2e-forge-panel-merge')
  const { settled } = await sendPrompt(page, scaffold)
  const sessionId = await settled
  await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
  const session = scaffold.ctx.sessions.get(sessionId)
  if (session === undefined) throw new Error('The Session must stay loaded')

  scaffold.ctx.forgeSession.track(session, DRAFT)
  await showSessionPanel(page)
  const change = page.locator(`[data-forge-change="${DRAFT}"]`)
  await change.locator('[data-forge-opens]').filter({ hasText: 'Add the merge button' }).waitFor({ timeout: 20_000 })

  // The only open change request starts expanded, so its Merge action shows once it is ready.
  await chooseCardAction(page, change, '#9', 'Ready for review')
  await page.getByRole('alert').filter({ hasText: '已将 #9 标记为可评审' }).waitFor()
  const merge = change.getByRole('button', { name: 'Merge', exact: true })
  await merge.waitFor({ timeout: 20_000 })
  await merge.click()
  const menu = page.getByRole('menu')
  await menu.getByText('将 #9 合并到 main', { exact: true }).waitFor()
  await compareOrRefreshGolden(join(EXPECTED, 'merge-menu.expected.md'), await captureStableAria(page, '[role="menu"]', scaffold.workspaceCwd), MODE)
  await writeFile(join(root, 'state.json'), JSON.stringify({ ready: true, mergedAt: null, head: 'c'.repeat(40) }))
  scaffold.ctx.forge.refresh({ repository: { forge: 'github', host: 'github.com', owner: 'octo', name: 'demo' }, number: 9 })
  const stale = menu.getByRole('menuitem', { name: 'New commits arrived. Review them before reopening the merge menu.', exact: true })
  await stale.waitFor()
  expect(await stale.isDisabled()).toBe(true)
  await compareOrRefreshGolden(join(EXPECTED, 'merge-stale.expected.md'), await captureStableAria(page, '[role="menu"]', scaffold.workspaceCwd), MODE)
  await merge.click()
  await merge.click()
  await menu.getByRole('menuitem', { name: 'Confirm merge', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '已合并 #9' }).waitFor()
  // Merged, the change request is no longer open, so its card collapses to the merge line.
  await change.getByText(/^已合并到 main · /).waitFor({ timeout: 20_000 })

  const calls = (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[])
  expect(calls).toContainEqual(['pr', 'ready', '9', '--repo', 'github.com/octo/demo'])
  expect(calls).toContainEqual([
    'api', '--hostname', 'github.com', '--method', 'PUT', 'repos/octo/demo/pulls/9/merge', '-f', 'merge_method=squash', '-f', `sha=${'c'.repeat(40)}`,
  ])
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('shows the local changes of the Session by scope and the changes of its change requests, expanding unchanged lines', async () => {
  const { scaffold, page, root, project, tripwire } = await launchPanel('web-e2e-forge-panel-changes', 'follow-up', { branch: 'feat' })
  // origin/main stops at the twelve-line README; the branch adds a commit, which `topic` also has, a staged file, an edit,
  // and an untracked file.
  await writeFile(join(project, 'README.md'), Array.from({ length: 12 }, (_, index) => `line ${index + 1}\n`).join(''))
  await git(project, 'commit', '--quiet', '-am', 'readme')
  await git(project, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  await git(project, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  await mkdir(join(project, 'src'))
  await writeFile(join(project, 'src', 'app.ts'), 'export const app = 1\n')
  await git(project, 'add', 'src/app.ts')
  await git(project, 'commit', '--quiet', '-m', 'app')
  await git(project, 'branch', 'topic')
  await writeFile(join(project, 'src', 'extra.ts'), 'export const extra = 1\n')
  await git(project, 'add', 'src/extra.ts')
  await writeFile(join(project, 'README.md'), Array.from({ length: 12 }, (_, index) => index === 9 ? 'line ten\n' : `line ${index + 1}\n`).join(''))
  await writeFile(join(project, 'notes.md'), 'note\n')

  const { settled } = await sendPrompt(page, scaffold)
  const sessionId = await settled
  await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
  const session = scaffold.ctx.sessions.get(sessionId)
  if (session === undefined) throw new Error('The Session must stay loaded')
  // The New Session screen inspected the checkout before these changes, which came from outside the Session;
  // opening the panel inspects it again.
  await showSessionPanel(page)
  const card = page.locator('[data-forge-local]')
  await card.getByRole('button', { name: 'Local changes · 4 files, 4 lines added, 1 lines deleted', exact: true }).click({ timeout: 20_000 })

  const local = page.locator('[data-forge-changes="local"]')
  await local.getByRole('button', { name: 'Base branch: origin/main', exact: true }).waitFor({ timeout: 20_000 })
  await local.getByText('Including uncommitted changes', { exact: true }).waitFor()
  const files = local.locator('[data-forge-diff-file]')
  await expect.poll(() => files.evaluateAll(sections => sections.map(section => section.getAttribute('data-forge-diff-file'))), { timeout: 20_000 })
    .toEqual(['src/app.ts', 'src/extra.ts', 'README.md', 'notes.md'])
  await local.locator('[data-forge-diff-file="notes.md"]').getByText('新文件 · 未提交', { exact: true }).waitFor()
  const readme = local.locator('[data-forge-diff-file="README.md"]')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(() => navigator.clipboard.writeText('unchanged'))
  await readme.locator('[data-forge-file-label]').click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('unchanged')
  await readme.locator('[data-forge-path-spacer]').click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('unchanged')
  await readme.getByRole('button', { name: '6 行未变更', exact: true }).click()
  await readme.getByText('line 1', { exact: true }).first().waitFor({ timeout: 20_000 })
  await local.getByRole('button', { name: '全部 4 个文件', exact: true }).click()
  const tree = page.getByRole('menu')
  await tree.getByRole('textbox', { name: 'Filter files…' }).fill('extra')
  await tree.getByRole('menuitem', { name: 'src/extra.ts', exact: true }).click()
  for (const [path, comment] of [['src/app.ts', '请解释这行代码'], ['src/extra.ts', '请检查这项修改']] as const) {
    const section = local.locator(`[data-forge-diff-file="${path}"]`)
    const lineNumber = section.getByRole('button', { name: '选择第 R1 行', exact: true })
    await lineNumber.hover()
    expect(await lineNumber.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    const content = await section.locator('[data-review-code]').first().boundingBox()
    const fileBox = await section.boundingBox()
    if (content === null || fileBox === null) throw new Error('Added file must be visible')
    expect(content.x - fileBox.x).toBeLessThan(70)
    await lineNumber.click()
    expect(await section.getByRole('textbox', { name: 'Leave a comment…' }).count()).toBe(0)
    await section.getByRole('button', { name: 'Add comment', exact: true }).click()
    await section.getByRole('textbox', { name: 'Leave a comment…' }).fill(comment)
    await section.locator('[data-forge-comment]').getByRole('button', { name: 'Add to input', exact: true }).click()
    await section.locator('[data-forge-review-thread="agent"]').getByText(comment, { exact: true }).waitFor()
  }
  await compareOrRefreshGolden(join(EXPECTED, 'review-quotes.expected.md'),
    await captureStableAria(page, '[data-composer-input]', scaffold.workspaceCwd), MODE)
  expect((await readPersistedEvents(scaffold, sessionId)).some(event => event.type === 'user/message'
    && event.data.content.some(block => block.type === 'text' && block.text.includes('## User Comment')))).toBe(false)
  const reviewed = scaffold.whenTurnSettled()
  await page.locator('[data-composer-input]').first().press('Enter')
  await reviewed
  await page.getByText(FOLLOW_UP_REPLY, { exact: true }).waitFor()
  const comments = (await readPersistedEvents(scaffold, sessionId)).flatMap(event => event.type === 'user/message'
    ? event.data.content.flatMap(block => block.type === 'text' && block.text.includes('## User Comment') ? [block.text] : []) : [])
  expect(comments).toHaveLength(1)
  await compareOrRefreshGolden(join(EXPECTED, 'review-message.expected.md'), comments.join('').trimEnd(), MODE)

  // Compared with `topic`, which already has the committed `src/app.ts`, the branch scope keeps only the later changes.
  await local.getByRole('button', { name: 'Base branch: origin/main', exact: true }).click()
  const bases = page.locator('[data-forge-base-menu]')
  await bases.getByRole('menuitem', { name: 'topic', exact: true }).waitFor({ timeout: 20_000 })
  await compareOrRefreshGolden(join(EXPECTED, 'base-menu.expected.md'), await captureStableAria(page, '[data-forge-base-menu]', scaffold.workspaceCwd), MODE)
  await bases.getByRole('textbox', { name: 'Search branches' }).fill('TOP')
  await expect.poll(() => bases.getByRole('menuitem').allTextContents()).toEqual(['topic'])
  await bases.getByRole('textbox', { name: 'Search branches' }).press('Enter')
  await local.getByRole('button', { name: 'Base branch: topic', exact: true }).waitFor()
  await expect.poll(() => files.evaluateAll(sections => sections.map(section => section.getAttribute('data-forge-diff-file'))), { timeout: 20_000 })
    .toEqual(['src/extra.ts', 'README.md', 'notes.md'])

  await local.getByRole('button', { name: 'Branch', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Staged', exact: true }).click()
  await local.getByText('The index compared with HEAD', { exact: true }).waitFor()
  await expect.poll(() => files.evaluateAll(sections => sections.map(section => section.getAttribute('data-forge-diff-file'))), { timeout: 20_000 })
    .toEqual(['src/extra.ts'])

  // A change request bound the way a `gh pr create` result binds one.
  scaffold.ctx.forgeSession.track(session, PULL)
  await showSessionPanel(page)
  const change = page.locator(`[data-forge-change="${PULL}"]`)
  await change.locator('[data-forge-opens]').filter({ hasText: 'Add the pull request panel' }).waitFor({ timeout: 20_000 })
  await card.getByRole('button', { name: 'Local changes · 4 files, 4 lines added, 1 lines deleted', exact: true }).waitFor()
  // The open change request of the checked-out branch replaces the offer to create one.
  await card.getByRole('button', { name: 'Local changes actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'View changes', exact: true }).waitFor()
  expect(await page.getByRole('menuitem', { name: 'Create change request', exact: true }).count()).toBe(0)
  await card.getByRole('button', { name: 'Local changes actions', exact: true }).click()
  await compareOrRefreshGolden(join(EXPECTED, 'local-and-pr.expected.md'), await captureStableAria(page, '[data-session-panel]', scaffold.workspaceCwd, {
    replacements: [[abbreviateHomePath(scaffold.workspaceCwd, homedir()), '{{cwd}}']],
  }), MODE)
  await card.getByRole('button', { name: 'Local changes · 4 files, 4 lines added, 1 lines deleted', exact: true }).click()
  await local.getByText('The index compared with HEAD', { exact: true }).waitFor()
  await showSessionPanel(page)
  // A press on the card's line opens the changes, as its Changes row and its View changes item do.
  await change.locator('[data-forge-opens="changes"]').click()
  const view = page.locator('[data-forge-changes="change"]')
  const panelFile = view.locator('[data-forge-diff-file="src/panel.ts"]')
  const title = await view.getByText('Add the pull request panel', { exact: true }).boundingBox()
  const submit = await view.getByRole('button', { name: 'Submit review', exact: true }).boundingBox()
  if (title === null || submit === null) throw new Error('PR title and submit action must be visible')
  expect(Math.abs(title.y + title.height / 2 - submit.y - submit.height / 2)).toBeLessThan(1)

  await panelFile.getByRole('button', { name: '6 行未变更', exact: true }).waitFor({ timeout: 20_000 })
  await compareOrRefreshGolden(join(EXPECTED, 'changes-view.expected.md'),
    await captureStableAria(page, '[data-forge-changes="change"]', scaffold.workspaceCwd), MODE)
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  await view.getByRole('navigation').getByRole('button', { name: 'src/panel.ts', exact: true }).waitFor()
  const fileTree = view.getByRole('navigation')
  const treeIsLeft = async () => {
    const tree = await fileTree.boundingBox()
    const diff = await view.locator('[data-forge-changes-scroll]').boundingBox()
    if (tree === null || diff === null) throw new Error('Tree and diff must be visible')
    return tree.x < diff.x
  }
  expect(await treeIsLeft()).toBe(true)
  const directoryName = await fileTree.getByText('src', { exact: true }).boundingBox()
  const fileName = await fileTree.getByText('panel.ts', { exact: true }).boundingBox()
  if (directoryName === null || fileName === null) throw new Error('Tree entries must be visible')
  expect(fileName.x).toBeGreaterThan(directoryName.x)
  await fileTree.getByRole('textbox', { name: 'Filter files…' }).fill('src')
  await fileTree.getByRole('textbox', { name: 'Filter files…' }).fill('')
  await fileTree.getByRole('button', { name: 'src', exact: true }).click()
  await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).click()
  expect(await treeIsLeft()).toBe(false)
  expect(await fileTree.getByRole('button', { name: 'src', exact: true }).getAttribute('aria-expanded')).toBe('false')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await fileTree.isVisible()).toBe(false)
  expect(await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).isVisible()).toBe(false)
  await view.getByRole('button', { name: '全部 2 个文件', exact: true }).click()
  await page.getByRole('menu').getByRole('textbox', { name: 'Filter files…' }).waitFor()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1680, height: 1000 })
  expect(await treeIsLeft()).toBe(false)
  await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).click()
  expect(await fileTree.isVisible()).toBe(false)
  await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).click()
  expect(await treeIsLeft()).toBe(true)
  expect(await fileTree.getByRole('button', { name: 'src', exact: true }).getAttribute('aria-expanded')).toBe('false')
  await fileTree.getByRole('textbox', { name: 'Filter files…' }).fill('src')
  await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).click()
  await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).click()
  await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).click()
  expect(await fileTree.getByRole('textbox', { name: 'Filter files…' }).inputValue()).toBe('src')
  await compareOrRefreshGolden(join(EXPECTED, 'file-tree-toggle.expected.md'),
    await captureStableAria(page, '[data-forge-changes="change"]', scaffold.workspaceCwd), MODE)
  await fileTree.getByRole('textbox', { name: 'Filter files…' }).fill('')
  await fileTree.getByRole('button', { name: 'src', exact: true }).click()
  const resizeTree = view.getByRole('separator', { name: 'Resize file tree', exact: true })
  const originalWidth = Number(await resizeTree.getAttribute('aria-valuenow'))
  const handle = await resizeTree.boundingBox()
  if (handle === null) throw new Error('Tree resize handle must be visible')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100)
  await page.mouse.down()
  await page.mouse.move(handle.x + 80, handle.y + 100, { steps: 5 })
  await page.mouse.up()
  expect(Number(await resizeTree.getAttribute('aria-valuenow'))).toBeGreaterThan(originalWidth)
  await resizeTree.press('Home')
  expect(await fileTree.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  const searchBounds = await fileTree.getByRole('textbox').boundingBox()
  const treeBounds = await fileTree.boundingBox()
  if (searchBounds === null || treeBounds === null) throw new Error('Tree search must be visible')
  expect(searchBounds.x + searchBounds.width).toBeLessThanOrEqual(treeBounds.x + treeBounds.width)
  await resizeTree.press('ArrowRight')
  const resizedWidth = await resizeTree.getAttribute('aria-valuenow')
  await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).click()
  expect(await treeIsLeft()).toBe(false)
  expect(await resizeTree.getAttribute('aria-valuenow')).toBe(resizedWidth)
  await resizeTree.press('ArrowLeft')
  expect(Number(await resizeTree.getAttribute('aria-valuenow'))).toBe(Number(resizedWidth) + 20)
  await resizeTree.press('ArrowRight')
  const rightHandle = await resizeTree.boundingBox()
  if (rightHandle === null) throw new Error('Right tree resize handle must be visible')
  await page.mouse.move(rightHandle.x + rightHandle.width / 2, rightHandle.y + 100)
  await page.mouse.down()
  await page.mouse.move(rightHandle.x - 80, rightHandle.y + 100, { steps: 5 })
  await page.mouse.up()
  expect(Number(await resizeTree.getAttribute('aria-valuenow'))).toBeGreaterThan(Number(resizedWidth))
  const rightWidth = await resizeTree.getAttribute('aria-valuenow')
  await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).click()
  await view.getByRole('button', { name: /^(将文件树移到右侧|隐藏文件树|在左侧显示文件树)$/ }).click()
  expect(await resizeTree.getAttribute('aria-valuenow')).toBe(rightWidth)
  for (const side of ['old', 'new'] as const) {
    const firstCode = panelFile.locator(`[data-review-code][data-${side}-line="2"]`)
    const firstLine = await firstCode.boundingBox()
    const lastLine = await panelFile.locator(`[data-review-code][data-${side}-line="4"]`).boundingBox()
    if (firstLine === null || lastLine === null) throw new Error('Review text must be visible')
    // Press on the first character, past the lane where the hovered row shows its comment plus.
    const textStart = await firstCode.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))
    await page.mouse.move(firstLine.x + textStart + 1, firstLine.y + firstLine.height / 2)
    await page.mouse.down()
    await page.mouse.move(lastLine.x + 120, lastLine.y + lastLine.height / 2, { steps: 5 })
    await page.mouse.up()
    await panelFile.getByRole('button', { name: 'Add comment', exact: true }).waitFor()
    expect(await panelFile.getByRole('textbox', { name: 'Leave a comment…' }).count()).toBe(0)
    const opposite = panelFile.locator(`[data-diff-side="${side === 'old' ? 'R' : 'L'}"]`).first()
    expect(await opposite.evaluate(element => getComputedStyle(element).userSelect)).toBe('none')
    await page.keyboard.press('ControlOrMeta+c')
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain(side === 'old' ? 'n2 = 2' : "n2 = 'two'")
    expect(copied).not.toContain(side === 'old' ? "n2 = 'two'" : 'n2 = 2')
    expect(copied.match(/n3 = 3/g)).toHaveLength(1)
  }
  await panelFile.getByRole('button', { name: 'Add comment', exact: true }).click()
  await panelFile.getByRole('region', { name: '评论 R2–4', exact: true }).waitFor()
  await panelFile.getByRole('textbox', { name: 'Leave a comment…' }).fill('请核对边界条件')
  await panelFile.getByRole('button', { name: 'GitHub comment options', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Publish single comment', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await compareOrRefreshGolden(join(EXPECTED, 'review-composer.expected.md'),
    await captureStableAria(page, '[data-forge-comment]', scaffold.workspaceCwd), MODE)
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
  const commentForm = panelFile.locator('[data-forge-comment]')
  expect(await commentForm.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 780 })
  await commentForm.getByRole('textbox').focus()
  expect(await commentForm.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  const narrowComment = await commentForm.boundingBox()
  if (narrowComment === null) throw new Error('Comment form must remain visible')
  expect(narrowComment.x + narrowComment.width).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 1680, height: 1000 })
  await panelFile.getByRole('button', { name: 'Start review', exact: true }).click()
  // The comment starts the pending review on GitHub, and the threads read again show it there.
  const pendingThread = panelFile.locator('[data-forge-thread="new-1"]')
  await pendingThread.getByText('请核对边界条件', { exact: true }).waitFor({ timeout: 20_000 })
  await pendingThread.getByText('Pending', { exact: true }).waitFor()
  await page.setViewportSize({ width: 1680, height: 500 })
  const changesScroll = view.locator('[data-forge-changes-scroll]')
  await changesScroll.evaluate((element) => { element.scrollTop = element.scrollHeight })
  const reviewScroll = await changesScroll.evaluate(element => element.scrollTop)
  expect(reviewScroll).toBeGreaterThan(0)
  await view.getByRole('button', { name: '提交评审 (1)', exact: true }).click()
  const reviewDialog = page.getByRole('dialog', { name: 'Submit review', exact: true })
  await reviewDialog.waitFor()
  expect(await reviewDialog.getByRole('textbox').count()).toBe(1)
  expect(await reviewDialog.getByText('请核对边界条件', { exact: true }).count()).toBe(0)
  expect(await changesScroll.evaluate(element => element.scrollTop)).toBe(reviewScroll)
  await page.setViewportSize({ width: 390, height: 780 })
  expect(await reviewDialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  const narrowDialog = await reviewDialog.boundingBox()
  if (narrowDialog === null) throw new Error('Review dialog must remain visible')
  expect(narrowDialog.x + narrowDialog.width).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 1680, height: 500 })
  await page.keyboard.press('Escape')
  expect(await reviewDialog.count()).toBe(0)
  await view.getByRole('button', { name: '提交评审 (1)', exact: true }).click()
  await reviewDialog.getByRole('radio', { name: 'Request changes', exact: true }).check()
  await reviewDialog.getByText('Enter a review summary to request changes.', { exact: true }).waitFor()
  expect(await reviewDialog.getByRole('button', { name: 'Submit review', exact: true }).isDisabled()).toBe(true)
  await compareOrRefreshGolden(join(EXPECTED, 'review-summary-required.expected.md'),
    await captureStableAria(page, '[role="dialog"][aria-label="Submit review"]', scaffold.workspaceCwd), MODE)
  await reviewDialog.getByRole('textbox', { name: 'Review summary…', exact: true }).fill('需要补充边界检查')
  await compareOrRefreshGolden(join(EXPECTED, 'submit-review.expected.md'),
    await captureStableAria(page, '[role="dialog"][aria-label="Submit review"]', scaffold.workspaceCwd), MODE)
  await reviewDialog.getByRole('button', { name: 'Submit review', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '已Submit review' }).waitFor()
  await expect.poll(() => pendingThread.getByText('Pending', { exact: true }).count(), { timeout: 20_000 }).toBe(0)
  await compareOrRefreshGolden(join(EXPECTED, 'review-record.expected.md'),
    await captureStableAria(page, '[data-forge-thread="new-1"]', scaffold.workspaceCwd), MODE)
  const mutations = (await readFile(join(root, 'mutations.jsonl'), 'utf8')).trim().split('\n').map((line): unknown => JSON.parse(line))
  expect(mutations).toEqual([
    { field: 'addPullRequestReview', variables: { pull: 'pull-7', commit: HEAD7,
      threads: [{ path: 'src/panel.ts', body: '请核对边界条件', line: 4, side: 'RIGHT', startLine: 2, startSide: 'RIGHT' }] } },
    { field: 'submitPullRequestReview', variables: { review: 'review-1', event: 'REQUEST_CHANGES', body: '需要补充边界检查' } },
  ])
  expect(existsSync(join(root, 'reviews.jsonl'))).toBe(false)
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
  await panelFile.getByRole('button', { name: '6 行未变更', exact: true }).click()
  await panelFile.getByText('export const n6 = 6', { exact: true }).first().waitFor({ timeout: 20_000 })
  await panelFile.getByRole('button', { name: '2 行未变更', exact: true }).waitFor()
  await panelFile.getByRole('button', { name: 'panel.ts 的更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Copy path', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('src/panel.ts')
  const docsFile = view.locator('[data-forge-diff-file="docs/panel.md"]')
  await docsFile.getByRole('button', { name: '收起 panel.md', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 500 })
  const scrollport = view.locator('[data-forge-changes-scroll]')
  await scrollport.evaluate((element) => { element.scrollTop = 100; element.dispatchEvent(new Event('scroll')) })
  await panelFile.locator('[data-forge-file-label]').click()
  const position = await scrollport.evaluate(element => element.scrollTop)
  expect(position).toBeGreaterThan(0)
  const originalFile = await panelFile.elementHandle()
  await page.getByRole('button', { name: /^(?:New session|新.*会话)$/ }).last().click()
  await expect.poll(() => view.isVisible()).toBe(false)
  await page.locator(`[data-row-key="session:${sessionId}"]`).click()
  await panelFile.getByText('export const n6 = 6', { exact: true }).first().waitFor({ timeout: 20_000 })
  expect(await panelFile.evaluate((element, original) => element === original, originalFile)).toBe(true)
  await expect.poll(() => docsFile.getAttribute('data-expanded')).toBe(null)
  await expect.poll(() => scrollport.evaluate(element => element.scrollTop)).toBe(position)
  expect(await panelFile.locator('[data-forge-thread="new-1"]').count()).toBe(1)
  await page.setViewportSize({ width: 1680, height: 1000 })
  await page.locator('[data-dockkit-tab]').filter({ hasText: '#7 的变更' }).locator('[data-dockkit-tab-close]').click()
  await expect.poll(() => view.count()).toBe(0)
  await showSessionPanel(page)
  await change.getByRole('button', { name: 'View the changes of #7: 128 lines added, 14 lines deleted', exact: true }).click()
  await panelFile.getByRole('button', { name: '6 行未变更', exact: true }).waitFor()
  expect(await panelFile.locator('[data-forge-review-thread]').count()).toBe(0)
  await view.getByRole('button', { name: 'Submit review', exact: true }).click()
  await reviewDialog.waitFor()
  expect(await reviewDialog.getByRole('textbox').inputValue()).toBe('')
  expect(await reviewDialog.getByRole('radio', { name: 'Comment', exact: true }).isChecked()).toBe(true)
  await page.keyboard.press('Escape')

  // Pull request 9 changes 301 files, more than the pull request diff endpoint accepts; the compare read shows every file.
  scaffold.ctx.forgeSession.track(session, DRAFT)
  await showSessionPanel(page)
  const draft = page.locator(`[data-forge-change="${DRAFT}"]`)
  await draft.getByRole('button', { name: '展开 #9', exact: true }).click()
  await draft.getByRole('button', { name: '查看 #9 的变更：新增 30 行，删除 2 行', exact: true }).click({ timeout: 20_000 })
  const wide = page.locator('[data-forge-changes="change"]').filter({ hasText: 'Add the merge button' })
  await wide.getByRole('region', { name: 'All 301 files', exact: true }).waitFor({ timeout: 20_000 })
  expect(await wide.locator('[data-forge-diff-file]').count()).toBe(301)

  // A push moves the head to a commit whose diff GitHub refuses over its size limit, so a newly opened view offers the web page
  // instead of a retry.
  await page.locator('[data-dockkit-tab]').filter({ hasText: 'Changes in #9' }).locator('[data-dockkit-tab-close]').click()
  await expect.poll(() => wide.count()).toBe(0)
  await writeFile(join(root, 'state.json'), JSON.stringify({ ready: false, mergedAt: null, head: 'd'.repeat(40) }))
  await writeFile(join(root, 'pr-9.refused'), PR9_REFUSAL)
  scaffold.ctx.forge.refresh({ repository: { forge: 'github', host: 'github.com', owner: 'octo', name: 'demo' }, number: 9 })
  await expect.poll(() => scaffold.ctx.forge.latest({ repository: { forge: 'github', host: 'github.com', owner: 'octo', name: 'demo' }, number: 9 }),
    { timeout: 20_000 }).toMatchObject({ snapshot: { headSha: 'd'.repeat(40) } })
  await showSessionPanel(page)
  const expand = draft.getByRole('button', { name: 'Expand #9', exact: true })
  if (await expand.count() > 0) await expand.click()
  await draft.getByRole('button', { name: '查看 Changes in #9：新增 30 行，删除 2 行', exact: true }).click({ timeout: 20_000 })
  await wide.getByRole('status').filter({ hasText: 'These changes are too large to show here' }).waitFor({ timeout: 20_000 })
  await wide.getByRole('button', { name: 'View in browser', exact: true }).waitFor()
  expect(await wide.getByRole('button', { name: 'Retry', exact: true }).count()).toBe(0)

  const calls = (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[])
  const compared = (head: string) => [
    'api', '--hostname', 'github.com', '--allow-escape-sequences', '-H', 'Accept: application/vnd.github.diff',
    `repos/octo/demo/compare/${'e'.repeat(40)}...${head}`,
  ]
  expect(calls).toContainEqual(compared(HEAD7))
  expect(calls).toContainEqual(compared('b'.repeat(40)))
  expect(calls).toContainEqual(compared('d'.repeat(40)))
  expect(calls.some(call => call[0] === 'pr' && call[1] === 'diff')).toBe(false)
  expect(calls).toContainEqual([
    'api', '--hostname', 'github.com', '-H', 'Accept: application/vnd.github.raw+json', `repos/octo/demo/contents/src/panel.ts?ref=${HEAD7}`,
  ])
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})


it.skipIf(MODE === 'record')('retains a wrapped code line and tree width across tab and Session switches', async () => {
  const { page, scaffold, root, tripwire } = await launchPanel('web-e2e-forge-reading-position')
  const paths = ['src/before-0.ts', 'src/before-1.ts', 'src/before-2.ts', 'src/server.ts', 'src/after.ts']
  const patch = paths.map(path => [
    `diff --git a/${path} b/${path}`, 'index 1111111..2222222 100644', `--- a/${path}`, `+++ b/${path}`,
    '@@ -1,650 +1,650 @@', '-const oldValue = true;', '+const newValue = true;',
    ...Array.from({ length: 649 }, (_, index) => ` const value_${index + 2} = "${'x'.repeat(24 + (index + 2) % 70)}";`), '',
  ].join('\n')).join('\n')
  await writeFile(join(root, 'pr-7.diff'), patch)
  const { settled } = await sendPrompt(page, scaffold)
  const sessionId = await settled
  const session = scaffold.ctx.sessions.get(sessionId)
  if (session === undefined) throw new Error('Session must stay loaded')
  scaffold.ctx.forgeSession.track(session, PULL)
  // Keep the file tree and the Session sidebar visible together on every platform.
  await page.setViewportSize({ width: 2400, height: 700 })
  await showSessionPanel(page)
  await page.locator(`[data-forge-change="${PULL}"]`).getByRole('button', { name: /查看 #7 的变更/ }).click()
  // A start page beside the changes tab is the other tab the switches below show.
  await page.getByRole('button', { name: '新标签页', exact: true }).first().click()
  await page.getByRole('tab').filter({ hasText: '#7 的变更' }).click()
  const view = page.locator('[data-forge-changes="change"]')
  const scroll = view.locator('[data-forge-changes-scroll]')
  const file = view.locator('[data-forge-diff-file="src/server.ts"]')
  const code = file.locator('[data-review-code][data-new-line="300"]')
  const separator = view.getByRole('separator', { name: 'Resize file tree', exact: true })
  const beforeFile = view.locator('[data-forge-diff-file="src/before-0.ts"]')
  // ResizeObserver runs between rendering frames, including when an ancestor becomes hidden.
  const layout = () => page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) })
  }))
  const reading = () => file.evaluate((element) => {
    const viewport = element.closest('[data-forge-changes-scroll]')!
    const top = Math.max(viewport.getBoundingClientRect().top, element.firstElementChild!.getBoundingClientRect().bottom)
    const line = [...element.querySelectorAll<HTMLElement>('[data-review-code][data-new-line]')]
      .find(row => row.getBoundingClientRect().bottom > top + 1)!
    return { path: element.getAttribute('data-forge-diff-file'), line: line.dataset.newLine,
      offset: line.getBoundingClientRect().top - top, scrollTop: viewport.scrollTop }
  })
  // An expanded file draws its lines once the reader scrolls near it.
  await file.scrollIntoViewIfNeeded()
  await code.waitFor()
  for (const width of [240, 320]) {
    if (width === 320) {
      for (let step = 0; step < 4; step += 1) await separator.press('ArrowRight')
      await beforeFile.getByRole('button', { name: '收起 before-0.ts', exact: true }).click()
    }
    await layout()
    await code.evaluate((element) => {
      const viewport = element.closest('[data-forge-changes-scroll]')!
      const header = element.closest('[data-forge-diff-file]')!.firstElementChild!
      const top = viewport.getBoundingClientRect().top + header.getBoundingClientRect().height
      viewport.scrollTop += element.getBoundingClientRect().top - top + 7
    })
    await layout()
    const position = await reading()
    expect(position.line).toBe('300')
    expect(position.offset).toBe(-7)
    for (const destination of ['tab', 'session', 'tab', 'session']) {
      if (destination === 'tab') await page.getByRole('tab').filter({ hasText: 'Start' }).click()
      else await page.getByRole('button', { name: 'New session', exact: true }).last().click()
      await expect.poll(() => view.isVisible()).toBe(false)
      await layout()
      expect(await scroll.evaluate(element => element.clientWidth)).toBe(0)
      if (destination === 'tab') await page.getByRole('tab').filter({ hasText: '#7 的变更' }).click()
      else await page.locator(`[data-row-key="session:${sessionId}"]`).click()
      await view.waitFor()
      await layout()
      expect(await separator.getAttribute('aria-valuenow')).toBe(String(width))
      expect(await reading()).toEqual(position)
      expect(await beforeFile.getAttribute('data-expanded')).toBe(width === 240 ? '' : null)
    }
  }
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('uses horizontal arrows to navigate files while preserving vertical scrolling and comment editing', async () => {
  const { scaffold, page, project, tripwire } = await launchPanel('web-e2e-forge-file-keys')
  await git(project, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  await git(project, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  await mkdir(join(project, 'src'))
  for (const path of ['src/a.txt', 'src/b.txt', 'README.md']) {
    await writeFile(join(project, path), Array.from({ length: path === 'README.md' ? 1 : 80 }, (_, line) => `line ${line + 1}\n`).join(''))
  }
  const { settled } = await sendPrompt(page, scaffold)
  await settled
  await showSessionPanel(page)
  await page.locator('[data-forge-local]').getByRole('button', { name: /Local changes · 3 files/ }).click()
  const view = page.locator('[data-forge-changes="local"]')
  const scroll = view.getByRole('region', { name: '全部 3 个文件', exact: true })
  await scroll.waitFor()
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 500 })
  const tree = view.getByRole('navigation')
  const files = view.locator('[data-forge-diff-file]')
  const paths = await files.evaluateAll(elements => elements.map(element => element.getAttribute('data-forge-diff-file')))
  expect(paths).toEqual(['src/a.txt', 'src/b.txt', 'README.md'])
  expect(await tree.locator('button:not([aria-expanded])').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))).toEqual(paths)
  const a = view.locator('[data-forge-diff-file="src/a.txt"]')
  const b = view.locator('[data-forge-diff-file="src/b.txt"]')
  const c = view.locator('[data-forge-diff-file="README.md"]')
  await b.getByRole('button', { name: '收起 b.txt', exact: true }).click()
  await scroll.evaluate((element) => { element.scrollTop = 0 })
  await scroll.focus()
  await page.keyboard.press('ArrowLeft')
  expect(await scroll.evaluate(element => element.scrollTop)).toBe(0)
  expect(await scroll.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await scroll.evaluate((element) => { element.scrollTop = 0 })
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => tree.getByRole('button', { name: 'src/b.txt', exact: true }).getAttribute('aria-current')).toBe('true')
  expect(await b.getAttribute('data-expanded')).toBe('')
  expect(await scroll.evaluate(element => document.activeElement === element)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => tree.getByRole('button', { name: 'README.md', exact: true }).getAttribute('aria-current')).toBe('true')
  // The last file draws its lines after the jump, and scroll anchoring adjusts the position at the next layout.
  await c.locator('[data-review-code]').first().waitFor()
  await scroll.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) })
  }))
  const lastPosition = await scroll.evaluate(element => element.scrollTop)
  const lastBox = await c.boundingBox(), viewport = await scroll.boundingBox()
  if (lastBox === null || viewport === null) throw new Error('The last file and scroll viewport must be rendered')
  expect(lastBox.y).toBeGreaterThan(viewport.y)
  expect(lastBox.y).toBeLessThan(viewport.y + viewport.height)
  await page.keyboard.press('ArrowRight')
  expect(await scroll.evaluate(element => element.scrollTop)).toBe(lastPosition)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => tree.getByRole('button', { name: 'src/b.txt', exact: true }).getAttribute('aria-current')).toBe('true')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => tree.getByRole('button', { name: 'src/a.txt', exact: true }).getAttribute('aria-current')).toBe('true')
  await b.evaluate((element) => {
    const viewport = element.closest('[data-forge-changes-scroll]')!
    viewport.scrollTop += element.getBoundingClientRect().top - viewport.getBoundingClientRect().top + 100
  })
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => tree.getByRole('button', { name: 'README.md', exact: true }).getAttribute('aria-current')).toBe('true')
  await tree.getByRole('button', { name: 'src/a.txt', exact: true }).click()
  await a.getByRole('button', { name: '选择第 R1 行', exact: true }).click()
  await a.getByRole('button', { name: 'Add comment', exact: true }).click()
  const input = a.getByRole('textbox', { name: 'Leave a comment…', exact: true })
  await input.fill('keep editing')
  await input.press('ArrowLeft')
  expect(await input.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(11)
  await input.press('ArrowRight')
  expect(await input.inputValue()).toBe('keep editing')
  expect(await tree.getByRole('button', { name: 'src/a.txt', exact: true }).getAttribute('aria-current')).toBe('true')
  expect(await input.evaluate(element => document.activeElement === element)).toBe(true)
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('opens a comment from the hover plus in one press without covering the line number or the code', async () => {
  const { scaffold, page, project, tripwire } = await launchPanel('web-e2e-forge-hover-plus')
  // notes.txt changes into context, a deletion followed by context, and an addition, so unified rows show both numbers.
  await writeFile(join(project, 'notes.txt'), ['keep 1', 'keep 2', 'drop 3', 'keep 4', 'keep 5', 'keep 6'].map(line => `${line}\n`).join(''))
  await git(project, 'add', 'notes.txt')
  await git(project, 'commit', '--quiet', '-m', 'notes')
  await git(project, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  await git(project, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  await writeFile(join(project, 'README.md'), `changed\n${Array.from({ length: 8 }, (_, line) => `line ${line + 2}\n`).join('')}`)
  await writeFile(join(project, 'notes.txt'), ['keep 1', 'keep 2', 'keep 4', 'keep 5', 'added', 'keep 6'].map(line => `${line}\n`).join(''))
  const { settled } = await sendPrompt(page, scaffold)
  await settled
  await showSessionPanel(page)
  await page.locator('[data-forge-local]').getByRole('button', { name: /^本地变更 · / }).click()
  const view = page.locator('[data-forge-changes="local"]')
  const file = view.locator('[data-forge-diff-file="README.md"]')
  const number = (name: string) => file.getByRole('button', { name: `选择第 ${name} 行`, exact: true })
  const plus = (name: string) => file.locator(`[data-review-add="${name}"]`)
  const code = (line: number) => file.locator(`[data-review-code][data-new-line="${line}"]`)
  const draggable = async (from: string, to: string) => {
    const start = await plus(from).boundingBox(), end = await number(to).boundingBox()
    if (start === null || end === null) throw new Error('The plus and the line number must be rendered')
    const x = start.x + start.width / 2
    return { start: { x, y: start.y + start.height / 2 }, end: { x, y: end.y + end.height / 2 } }
  }
  await number('R3').waitFor()

  // The plus appears only on the hovered side of the hovered row, for the code as for the line number.
  expect(await plus('R3').isVisible()).toBe(false)
  await code(3).hover()
  expect(await plus('R3').isVisible()).toBe(true)
  expect(await plus('R4').isVisible()).toBe(false)
  expect(await plus('L1').isVisible()).toBe(false)
  await number('L1').hover()
  expect(await plus('L1').isVisible()).toBe(true)
  expect(await plus('R3').isVisible()).toBe(false)

  // Playwright refuses a click on a covered point, so these prove the hovered number and first character stay reachable.
  await number('R3').hover()
  await number('R3').click()
  expect(await number('R3').getAttribute('aria-pressed')).toBe('true')
  const first = await code(5).boundingBox()
  const textStart = await code(5).evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))
  if (first === null) throw new Error('Review text must be visible')
  await page.mouse.move(first.x + textStart + 1, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(first.x + textStart + 30, first.y + first.height / 2, { steps: 3 })
  await page.mouse.up()
  expect(await page.evaluate(() => document.getSelection()?.toString())).toMatch(/^li/)
  await page.evaluate(() => { document.getSelection()?.removeAllRanges() })

  // One press selects, a drag extends within the side, and the release opens the editor.
  await code(6).hover()
  const { start, end } = await draggable('R6', 'R8')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 })
  expect(await number('R8').getAttribute('aria-pressed')).toBe('true')
  expect(await file.getByRole('textbox').count()).toBe(0)
  await page.mouse.up()
  await file.getByRole('region', { name: '评论 R6–8', exact: true }).waitFor()
  // The open editor leaves the hover plus for the next comment.
  await code(3).hover()
  expect(await plus('R3').isVisible()).toBe(true)
  await file.getByRole('button', { name: '取消', exact: true }).click()
  await file.getByRole('textbox').waitFor({ state: 'detached' })

  // The single-column layout keeps the same gesture on the line's own side.
  await view.getByRole('button', { name: '左右对比', exact: true }).click()
  await file.locator('[data-diff-line]').first().waitFor()
  await code(4).hover()
  expect(await plus('R4').isVisible()).toBe(true)
  await number('R4').click()
  expect(await number('R4').getAttribute('aria-pressed')).toBe('true')

  // With both numbers shown, a deleted line's plus sits where a context line's does: in the sign column.
  const notes = view.locator('[data-forge-diff-file="notes.txt"]')
  const notesPlus = (name: string) => notes.locator(`[data-review-add="${name}"]`)
  const notesCode = (side: 'old' | 'new', line: number) => notes.locator(`[data-review-code][data-${side}-line="${line}"]`)
  await notesCode('new', 3).hover()
  const contextPlus = await notesPlus('R3').boundingBox()
  await notesCode('old', 3).hover()
  const deletedPlus = await notesPlus('L3').boundingBox()
  const nextRow = await notesCode('old', 4).boundingBox()
  if (contextPlus === null || deletedPlus === null || nextRow === null) throw new Error('The pluses and the next row must be rendered')
  expect(deletedPlus.x).toBe(contextPlus.x)
  // A drag from the deleted line's plus extends through the context row below it on the old side.
  const x = deletedPlus.x + deletedPlus.width / 2
  await page.mouse.move(x, deletedPlus.y + deletedPlus.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, nextRow.y + nextRow.height / 2, { steps: 5 })
  await page.mouse.up()
  await notes.getByRole('region', { name: '评论 L3–4', exact: true }).waitFor()
  await notes.getByRole('button', { name: '取消', exact: true }).click()
  await notes.getByRole('textbox').waitFor({ state: 'detached' })
  // The labeled plus of a left context line stays reachable; Playwright refuses a covered target.
  await notes.getByRole('button', { name: '选择第 L2 行', exact: true }).click()
  expect((await notes.getByRole('button', { name: '添加评论', exact: true }).boundingBox())?.x).toBe(contextPlus.x)
  await notes.getByRole('button', { name: '添加评论', exact: true }).click()
  await notes.getByRole('region', { name: '评论 L2', exact: true }).waitFor()
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('keeps tall branch and changed-file menus aligned with their triggers', async () => {
  const { scaffold, page, project, tripwire } = await launchPanel('web-e2e-forge-tall-menus')
  await Promise.all(Array.from({ length: 45 }, (_, index) =>
    git(project, 'update-ref', `refs/heads/worktree/long-menu-regression-${index}`, 'HEAD')))
  const option = page.locator('[data-forge-worktree]')
  await option.getByRole('checkbox', { name: '新建工作树', exact: true }).check()
  const base = option.getByRole('button', { name: '基于 main', exact: true })
  await base.click()
  const menu = page.getByRole('menu')
  await menu.getByRole('menuitem', { name: 'worktree/long-menu-regression-44', exact: true }).waitFor()
  await expect.poll(async () => {
    const trigger = await base.boundingBox()
    const card = await menu.boundingBox()
    return trigger === null || card === null ? Infinity : Math.abs(trigger.x + trigger.width - card.x - card.width)
  }).toBeLessThan(1)
  await page.keyboard.press('Escape')
  expect(await base.getAttribute('aria-expanded')).toBe('false')
  await option.getByRole('checkbox', { name: '新建工作树', exact: true }).uncheck()

  await git(project, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  await git(project, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  await mkdir(join(project, 'src'))
  await Promise.all(Array.from({ length: 60 }, (_, index) =>
    writeFile(join(project, 'src', `long-file-list-${index}.ts`), `export const value = ${index}\n`)))
  await git(project, 'add', 'src')
  await git(project, 'commit', '--quiet', '-m', 'long file list')
  const { settled } = await sendPrompt(page, scaffold)
  await settled
  const panel = await showSessionPanel(page)
  await panel.getByRole('button', { name: /^本地变更 · 60 个文件/ }).click()
  const changes = page.locator('[data-forge-changes="local"]')
  const files = changes.getByRole('button', { name: '全部 60 个文件', exact: true })
  await files.click()
  await menu.getByRole('textbox', { name: '筛选文件…', exact: true }).waitFor()
  await expect.poll(async () => {
    const trigger = await files.boundingBox()
    const card = await menu.boundingBox()
    return trigger === null || card === null ? Infinity : Math.abs(trigger.x - card.x)
  }).toBeLessThan(1)
  await menu.getByRole('textbox', { name: '筛选文件…', exact: true }).fill('long-file-list-59')
  expect(await menu.getByRole('menuitem', { name: 'src/long-file-list-59.ts', exact: true }).isVisible()).toBe(true)
  await page.keyboard.press('Escape')
  expect(await menu.count()).toBe(0)
  await page.setViewportSize({ width: 390, height: 700 })
  await files.click()
  await menu.getByRole('textbox', { name: '筛选文件…', exact: true }).waitFor()
  await expect.poll(() => menu.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return rect.left >= 12 && rect.right <= 378 && rect.top >= 12 && rect.bottom <= 688
  })).toBe(true)
  await page.keyboard.press('Escape')
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('aligns localized status rows by their glyphs in the Session panel at every width', async () => {
  const { scaffold, page, project, tripwire } = await launchPanel('web-e2e-forge-layout')
  await page.locator('[data-forge-current-branch]').waitFor()
  await compareOrRefreshGolden(join(EXPECTED, 'worktree-option.expected.md'),
    await captureStableAria(page, '[data-forge-worktree]', scaffold.workspaceCwd), MODE)
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('[data-forge-worktree]')
    .evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 1680, height: 1000 })
  await git(project, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  await git(project, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  await mkdir(join(project, 'src'))
  await Promise.all(Array.from({ length: 60 }, (_, index) => writeFile(join(project, 'src', `file-${index}.ts`), `export const value = ${index}\n`)))
  const { settled } = await sendPrompt(page, scaffold)
  const session = scaffold.ctx.sessions.get(await settled)
  if (session === undefined) throw new Error('The Session must stay loaded')
  scaffold.ctx.forgeSession.track(session, PULL)
  const panel = await showSessionPanel(page)
  await panel.locator('[data-forge-local]').getByRole('button', { name: /^Local changes · 60 files/ }).waitFor({ timeout: 20_000 })
  const change = panel.locator(`[data-forge-change="${PULL}"]`)
  for (const [locale, labels] of [
    ['zh', ['Checks', 'Review', 'Merge', '变更']],
    ['en', ['Checks', 'Review', 'Merge', 'Changes']],
    ['de', ['Prüfungen', 'Review', 'Zusammenführen', 'Änderungen']],
  ] as const) {
    await scaffold.ctx.settings.update('locale', { preference: locale })
    await change.getByText(labels[0], { exact: true }).waitFor()
    if (locale === 'en') {
      await compareOrRefreshGolden(join(EXPECTED, 'local-card.expected.md'),
        await captureStableAria(page, '[data-forge-local]', scaffold.workspaceCwd), MODE)
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 700 })
      // A narrower window can hide the panel, which then opens over the conversation.
      await showSessionPanel(page)
      await expect.poll(() => change.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(width)
      // Each row names its fact for assistive technology only; the row starts with its glyph.
      const rowOf = (label: string) => change.getByText(label, { exact: true }).locator('xpath=../..')
      await rowOf(labels[3]).hover()
      const offsets = new Set<number>()
      for (const label of labels) {
        const geometry = await rowOf(label).evaluate((row) => {
          const icon = row.firstElementChild!
          const cell = icon.nextElementSibling!
          const value = cell.lastElementChild!
          const trailing = cell.nextElementSibling?.matches('[class*="rowTrailing"]') === true ? cell.nextElementSibling : null
          const rowRect = row.getBoundingClientRect()
          const content = value.getBoundingClientRect()
          return {
            iconInset: icon.getBoundingClientRect().left - rowRect.left,
            rowInset: rowRect.left - row.closest('[data-forge-change]')!.getBoundingClientRect().left,
            valueOffset: content.left - rowRect.left,
            gap: trailing === null ? 8 : trailing.getBoundingClientRect().left - content.right,
            right: Math.max(content.right, trailing?.getBoundingClientRect().right ?? 0),
            width: document.documentElement.clientWidth,
          }
        })
        // The glyph starts 30px into the card, where the card's title starts.
        expect(geometry.iconInset).toBe(8)
        expect(geometry.rowInset).toBe(22)
        offsets.add(geometry.valueOffset)
        expect(geometry.gap).toBeGreaterThanOrEqual(8)
        expect(geometry.right).toBeLessThanOrEqual(geometry.width)
      }
      // Every value starts in the same column after its glyph.
      expect([...offsets]).toEqual([32])
    }
  }
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record')('keeps long branch details accessible by touch and keyboard across the hero row breakpoints', async () => {
  const branch = 'feature/a-long-current-branch-name-for-mobile-review'
  const { page, scaffold, tripwire } = await launchPanel('web-e2e-forge-branch-details', 'normal', { branch, hasTouch: true })
  const option = page.locator('[data-forge-worktree]')
  const chip = option.locator('[data-forge-current-branch]')
  await chip.waitFor()
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  for (const [locale, label] of [['zh', `当前分支：${branch}`], ['en', `Current branch: ${branch}`], ['de', `Aktueller Branch: ${branch}`]] as const) {
    await scaffold.ctx.settings.update('locale', { preference: locale })
    await option.getByRole('button', { name: label, exact: true }).waitFor()
    for (const width of [390, 600, 601, 700, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      await chip.scrollIntoViewIfNeeded()
      await expect.poll(() => option.evaluate((element) => {
        const row = element.closest('[class*="heroWorkspaceRow"]')!
        const ancestors: Element[] = []
        for (let node: Element | null = row; node !== null; node = node.parentElement) ancestors.push(node)
        return {
          fits: element.getBoundingClientRect().right <= innerWidth,
          overflow: ancestors.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className),
        }
      })).toEqual({ fits: true, overflow: [] })
    }
  }
  await scaffold.ctx.settings.update('locale', { preference: 'en' })
  await option.getByRole('button', { name: `Current branch: ${branch}`, exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await chip.locator('span').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  const tooltip = page.getByRole('tooltip', { exact: true, name: `Current branch: ${branch}` })
  await chip.tap()
  await tooltip.waitFor()
  await compareOrRefreshGolden(join(EXPECTED, 'branch-details.expected.md'), await tooltip.ariaSnapshot(), MODE)
  await chip.tap()
  await tooltip.waitFor({ state: 'hidden' })
  await chip.tap()
  await tooltip.waitFor()
  await page.locator('[class*="heroWorkspaceRow"]').tap({ position: { x: 1, y: 1 } })
  await tooltip.waitFor({ state: 'hidden' })
  await chip.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await tooltip.waitFor()
  await page.keyboard.press('Escape')
  await tooltip.waitFor({ state: 'hidden' })
  await page.keyboard.press('Enter')
  await tooltip.waitFor()
  await page.keyboard.press('Escape')
  await tooltip.waitFor({ state: 'hidden' })
  expect(await option.getByRole('checkbox').isChecked()).toBe(false)
  expect(await page.getByRole('menu').count()).toBe(0)
  await scaffold.ctx.settings.update('locale', { preference: 'zh' })
  await option.getByRole('checkbox', { name: 'New worktree', exact: true }).waitFor()
  const { settled } = await sendPrompt(page, scaffold)
  await settled
  expect(tripwire.pageErrors).toEqual([])
  expect(tripwire.warnings).toEqual([])
})

it.skipIf(MODE === 'record').each(['darwin', 'win32'] as const)('closes diff menus when the %s desktop shortcut deactivates a retained tab', async (platform) => {
  const { page, scaffold, project, tripwire } = await launchPanel(`web-e2e-forge-menu-${platform}`, 'normal', { desktop: platform })
  await git(project, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  await git(project, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  await writeFile(join(project, 'README.md'), 'review this change\n')
  const { settled } = await sendPrompt(page, scaffold)
  const sessionId = await settled
  await showSessionPanel(page)
  await page.locator('[data-forge-local]').getByRole('button', { name: /Local changes · 1 files/ }).click()
  const view = page.locator('[data-forge-changes="local"]')
  await view.locator('[data-forge-diff-file="README.md"]').waitFor()
  for (const name of ['Branch', '全部 1 个文件', 'README.md 的更多操作']) {
    await view.getByRole('button', { name, exact: true }).click()
    await page.getByRole('menu').waitFor()
    await page.evaluate((mac) => { window.forgeKeyboard.deliver({
      kind: 'keyboard', frameName: '', revision: window.forgeKeyboard.revision, code: 'KeyN',
      meta: mac, control: !mac, alt: false, shift: false, repeat: false,
    }) }, platform === 'darwin')
    await expect.poll(() => view.isVisible()).toBe(false)
    await expect.poll(() => page.getByRole('menu').count()).toBe(0)
    await page.locator(`[data-row-key="session:${sessionId}"]`).click()
    await view.waitFor()
    await expect.poll(() => page.getByRole('menu').count()).toBe(0)
  }
  expect(tripwire.warnings).toEqual([])
})


it.skipIf(MODE === 'record')('archives a clean UI worktree and restores its retained branch', async () => {
  const { scaffold, page, project, tripwire } = await requestReleaseWorktree('web-e2e-forge-archive')
  const { settled } = await sendPrompt(page, scaffold)
  const sessionId = await settled
  const session = scaffold.ctx.sessions.get(sessionId)
  if (session === undefined) throw new Error('The completed Session was not retained')
  const directory = scaffold.ctx.workingDirectory.get(session)
  const branch = await git(directory, 'branch', '--show-current')
  const head = await git(directory, 'rev-parse', 'HEAD')
  const title = '工作树归档恢复'
  await scaffold.ctx.sessionController.rename({ sessionId, title })
  const row = page.getByRole('treeitem').filter({ has: page.getByText(title, { exact: true }) })
  await row.hover()
  await row.getByRole('button', { name: '归档会话', exact: true }).click()
  await expect.poll(async () => {
    try { await access(directory); return true } catch { return false }
  }, { timeout: 20_000 }).toBe(false)
  expect(scaffold.ctx.workspaceRegistry.archivedSessionIds).toContain(sessionId)
  expect(await git(project, 'rev-parse', branch)).toBe(head)
  await page.getByRole('button', { name: '视图选项', exact: true }).click()
  await page.getByRole('menuitem', { name: '全部对话（显示已归档）', exact: true }).click()
  await row.hover()
  await row.getByRole('button', { name: '取消归档', exact: true }).click()
  await row.click()
  const missing = page.locator('[data-forge-missing]')
  await missing.getByRole('button', { name: '恢复工作树', exact: true }).waitFor({ timeout: 20_000 })
  await compareOrRefreshGolden(join(EXPECTED, 'archive-restore.expected.md'),
    await captureStableAria(page, '[data-forge-missing]', scaffold.workspaceCwd, { replacements: [[branch, 'dsh-{{worktree}}']] }), MODE)
  expect(scaffold.ctx.workingDirectory.get(session)).toBe(directory)
  await missing.getByRole('button', { name: '恢复工作树', exact: true }).click()
  await missing.waitFor({ state: 'detached', timeout: 20_000 })
  expect(await git(directory, 'rev-parse', 'HEAD')).toBe(head)
  expect(tripwire.pageErrors).toEqual([])
})

it.skipIf(MODE === 'record').each([120, 4000])('types a review comment beside %i changed lines', async (count) => {
  const { scaffold, page, root, tripwire } = await launchPanel('web-e2e-forge-review-typing')
  const patch = ['diff --git a/src/typing.ts b/src/typing.ts', 'index 1111111..2222222 100644',
    '--- a/src/typing.ts', '+++ b/src/typing.ts', `@@ -1,${count} +1,${count} @@`,
    ...Array.from({ length: count }, (_, index) => {
      const context = index % 80 === 0 ? 'wrapped context '.repeat(600) : index % 5 === 0 ? 'context '.repeat(30) : ''
      return `-export const value${index} = [${index}, '${context}']\n+export const value${index} = [${index + 1}, '${context}']`
    }), ''].join('\n')
  await writeFile(join(root, 'pr-7.diff'), patch)
  const { settled } = await sendPrompt(page, scaffold)
  const sessionId = await settled
  const session = scaffold.ctx.sessions.get(sessionId)
  if (session === undefined) throw new Error('Session must stay loaded')
  scaffold.ctx.forgeSession.track(session, PULL)
  await showSessionPanel(page)
  const change = page.locator(`[data-forge-change="${PULL}"]`)
  await change.getByRole('button', { name: 'View the changes of #7: 128 lines added, 14 lines deleted', exact: true }).click()
  const file = page.locator('[data-forge-diff-file="src/typing.ts"]')
  const collapsed = file.getByRole('button', { name: /^文件较大，/ })
  await file.waitFor()
  if (count > 120) await collapsed.click()
  await file.getByRole('button', { name: '选择第 R5 行', exact: true }).click()
  await file.getByRole('button', { name: 'Add comment', exact: true }).click()
  const input = file.getByRole('textbox', { name: 'Leave a comment…', exact: true })
  await input.waitFor()
  const field = await input.boundingBox()
  if (field === null) throw new Error('Comment field must be visible')
  await page.mouse.move(field.x + field.width - 3, field.y + field.height - 3)
  await page.mouse.down()
  await page.mouse.move(field.x + field.width - 3, field.y + field.height + 77, { steps: 5 })
  await page.mouse.up()
  const resized = await input.boundingBox()
  if (resized === null) throw new Error('Resized comment field must remain visible')
  expect(resized.height).toBeGreaterThan(field.height + 50)
  await input.fill('Review a wrapped line. '.repeat(80))
  expect(await input.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  expect(await input.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await input.fill('')
  await page.keyboard.type('Check the boundary')
  await page.keyboard.press('Enter')
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Input.imeSetComposition', { text: 'Checks', selectionStart: 2, selectionEnd: 2 })
    expect(await input.inputValue()).toBe('Check the boundary\n检查')
    expect(await file.locator('[data-forge-review-thread]').count()).toBe(0)
    await cdp.send('Input.insertText', { text: '检查边界条件' })
  } finally { await cdp.detach() }
  expect(await input.inputValue()).toBe('Check the boundary\n检查边界条件')
  await input.fill(' \n')
  expect(await file.getByRole('button', { name: 'Start review', exact: true }).isDisabled()).toBe(true)
  await input.fill('检查边界条件')
  await file.getByRole('button', { name: 'Start review', exact: true }).click()
  await file.locator('[data-forge-thread]').getByText('检查边界条件', { exact: true }).waitFor({ timeout: 20_000 })
  expect(tripwire.pageErrors).toEqual([])
})
