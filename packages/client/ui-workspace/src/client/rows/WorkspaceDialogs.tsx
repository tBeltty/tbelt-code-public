/** Workspace rename, removal, and new-worktree dialogs, keyed by their captured request. */
import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceActionRequest, WorkspaceBrowserProps, WorktreeInspection } from '../contract/slots.ts'
import css from './WorkspaceBrowser.module.css'

type Props = Pick<
  WorkspaceBrowserProps,
  'renameWorkspace' | 'deleteWorkspace' | 'createWorktreeWorkspace' | 'inspectWorktree' | 'removeWorktree'
  | 'startSession' | 'settleWorkspaceAction' | 't'
> & {
  request: WorkspaceActionRequest
  workspaces: readonly WorkspaceView[]
}

/** @param props - captured request, current Workspace list, and existing mutations. @returns the active dialog. */
export function WorkspaceDialogs({
  request, workspaces, renameWorkspace, deleteWorkspace, createWorktreeWorkspace, inspectWorktree, removeWorktree,
  startSession, settleWorkspaceAction, t,
}: Props) {
  const composingRef = useRef(false)
  const renameTarget = request.action === 'rename' ? request : null
  const [renameDraft, setRenameDraft] = useState(request.displayTitle)
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameTrimmed = renameDraft.trim()
  // Self is excluded by identity, not by title: the draft is seeded with the
  // localized label, which for an automatically titled Workspace equals its
  // own displayed title without being a conflict with itself.
  const renameDuplicate = renameTarget !== null && renameTrimmed !== ''
    && workspaces.some(w => w.workspaceId !== renameTarget.workspaceId && w.title === renameTrimmed)
  const renameBlocked = renaming || renameTrimmed === ''
    || renameTarget === null || renameTrimmed === renameTarget.storedTitle || renameDuplicate
  const closeRename = () => {
    if (renaming) return
    settleWorkspaceAction()
    setRenameError(null)
  }
  const confirmRename = () => {
    if (renameBlocked) return
    setRenaming(true)
    setRenameError(null)
    renameWorkspace(renameTarget.workspaceId, renameTrimmed).then(() => {
      setRenaming(false)
      settleWorkspaceAction()
    }).catch((reason: unknown) => {
      setRenaming(false)
      setRenameError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const deleteTarget = request.action === 'delete' ? request : null
  const [deleting, setDeleting] = useState(false)
  const [deleteCommittedId, setDeleteCommittedId] = useState<WorkspaceId | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // What removing the target would do to its directory; `null` until the Host answers, or when it cannot say.
  const [deleteWorktree, setDeleteWorktree] = useState<WorktreeInspection | null>(null)
  const inspectWorktreeRef = useRef(inspectWorktree)
  inspectWorktreeRef.current = inspectWorktree
  const deleteTargetId = deleteTarget?.workspaceId
  useEffect(() => {
    if (deleteTargetId === undefined) return
    let current = true
    inspectWorktreeRef.current(deleteTargetId).then((inspection) => {
      if (current) setDeleteWorktree(inspection)
    }).catch((reason: unknown) => {
      // An unreadable worktree state leaves the plain registration delete; the Host refuses a dirty removal itself.
      console.warn('worktree inspection rejected:', reason)
    })
    return () => { current = false }
  }, [deleteTargetId])
  useEffect(() => {
    if (deleteCommittedId === null
      || workspaces.some(workspace => workspace.workspaceId === deleteCommittedId)) return
    setDeleting(false)
    setDeleteCommittedId(null)
    settleWorkspaceAction()
  }, [deleteCommittedId, workspaces, settleWorkspaceAction])
  const closeDelete = () => {
    if (deleting) return
    settleWorkspaceAction()
    setDeleteError(null)
  }
  const confirmDelete = () => {
    /* v8 ignore next -- the Modal is absent without a target and its button is disabled while deleting. */
    if (deleting || deleteTarget === null) return
    setDeleting(true)
    setDeleteCommittedId(null)
    setDeleteError(null)
    const removal = deleteWorktree?.linked === true
      ? removeWorktree(deleteTarget.workspaceId, { force: deleteWorktree.uncommitted.length > 0 })
      : deleteWorkspace(deleteTarget.workspaceId)
    removal.then(() => {
      // Keep the confirmation pending until this component has rendered the
      // committed list projection without the deleted id. Closing earlier
      // exposes one stale React frame to the next Create Workspace gesture.
      setDeleteCommittedId(deleteTarget.workspaceId)
    }).catch((reason: unknown) => {
      setDeleting(false)
      setDeleteError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  // A worktree is created on the Host (setup commands may take a while); the Session starts once the Workspace exists.
  const worktreeTarget = request.action === 'worktree' ? request : null
  const [worktreeBusy, setWorktreeBusy] = useState(worktreeTarget !== null)
  const [worktreeError, setWorktreeError] = useState<string | null>(null)
  const worktreeStarted = useRef(false)
  const worktreeTargetId = worktreeTarget?.workspaceId
  useEffect(() => {
    if (worktreeTargetId === undefined || worktreeStarted.current) return
    worktreeStarted.current = true
    createWorktreeWorkspace(worktreeTargetId).then((created) => {
      setWorktreeBusy(false)
      settleWorkspaceAction()
      startSession(created.workspaceId)
    }).catch((reason: unknown) => {
      setWorktreeBusy(false)
      setWorktreeError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [worktreeTargetId, createWorktreeWorkspace, startSession, settleWorkspaceAction])

  const deleteIsWorktree = deleteWorktree?.linked === true
  const deleteLabel = t(deleteIsWorktree ? 'delete.worktree' : 'delete.workspace')

  return <>
    <Modal
      open={renameTarget !== null}
      onClose={closeRename}
      closeLabel={t('close')}
      title={t('rename.workspace.title')}
      footer={(
        <>
          <Button variant="outline" disabled={renaming} onClick={closeRename}>{t('cancel')}</Button>
          <Button variant="primary" disabled={renameBlocked} onClick={confirmRename}>{t('rename')}</Button>
        </>
      )}
    >
      <input
        className={css.renameInput}
        value={renameDraft}
        aria-label={t('field.workspaceName')}
        data-modal-autofocus
        disabled={renaming}
        onFocus={(e) => { e.target.select() }}
        onChange={(e) => { setRenameDraft(e.target.value); setRenameError(null) }}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !composingRef.current) {
            e.preventDefault()
            confirmRename()
          }
        }}
      />
      {renameDuplicate && (
        <div className={css.renameError} role="alert">{t('conflict.named', { name: renameTrimmed })}</div>
      )}
      {renameError !== null && <div className={css.renameError} role="alert">{renameError}</div>}
    </Modal>

    <Modal
      open={deleteTarget !== null}
      onClose={closeDelete}
      closeLabel={t('close')}
      title={deleteLabel}
      {...deleteTarget === null
        ? {}
        : {
          description: deleteWorktree?.linked === true
            ? t('delete.worktree.desc', { name: deleteTarget.displayTitle, branch: deleteWorktree.branch ?? '' })
            : t('delete.desc', { name: deleteTarget.displayTitle }),
        }}
      footer={(
        <>
          <Button variant="outline" disabled={deleting} onClick={closeDelete}>{t('cancel')}</Button>
          <Button
            variant="outline"
            className={css.deleteAction}
            disabled={deleting}
            onClick={confirmDelete}
          >
            {deleteWorktree !== null && deleteWorktree.linked && deleteWorktree.uncommitted.length > 0
              ? t('delete.worktree.discard')
              : deleteLabel}
          </Button>
        </>
      )}
    >
      {deleteWorktree !== null && deleteWorktree.uncommitted.length > 0 && (
        <>
          <div className={css.deleteStatus}>{t('delete.worktree.dirty')}</div>
          <ul className={css.archiveActivity}>
            {deleteWorktree.uncommitted.map(entry => <li key={entry}>{entry}</li>)}
          </ul>
        </>
      )}
      {deleting && <div className={css.deleteStatus} role="status">{t(deleteIsWorktree ? 'delete.worktree.pending' : 'delete.pending')}</div>}
      {deleteError !== null && <div className={css.renameError} role="alert">{deleteError}</div>}
    </Modal>

    <Modal
      open={worktreeTarget !== null && (worktreeBusy || worktreeError !== null)}
      onClose={() => { if (!worktreeBusy) settleWorkspaceAction() }}
      closeLabel={t('close')}
      title={t(worktreeBusy ? 'menu.newWorktreeSession' : 'worktree.failed.title')}
      footer={<Button variant="outline" disabled={worktreeBusy} onClick={settleWorkspaceAction}>{t('close')}</Button>}
    >
      {worktreeBusy && <div className={css.deleteStatus} role="status">{t('worktree.creating')}</div>}
      {worktreeError !== null && <div className={css.renameError} role="alert">{worktreeError}</div>}
    </Modal>
  </>
}
