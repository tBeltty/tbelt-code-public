// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { PermissionRow, type PermissionRowProps } from '../src/client/PermissionRow.tsx'
import { es } from '../src/client/locales.ts'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { PermissionPresetSettingsController } from '../src/client/settings-store.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

const catalog = { options: [], defaultPreset: 'read-only', defaultOptions: ['read-only', 'workspace-write', 'danger-full-access'].map(value => ({ value, name: value })) }
const directory = { store: createSnapshotStore({ value: catalog }), load: () => Promise.resolve(catalog) }

/** Controller over a real mirror derived from the same scripted context. */
function derivedController(remote: { settings: object }, source: typeof directory = directory) {
  const ctx = { remote } as never
  return new PermissionPresetSettingsController(new SettingsDescribeMirror(ctx), ctx, source)
}

afterEach(cleanup)

const SCHEMA = {
  uid: 5,
  refs: {
    1: { type: 'const', value: 'read-only' },
    2: { type: 'const', value: 'workspace-write' },
    3: { type: 'const', value: 'danger-full-access' },
    4: { type: 'union', list: [1, 2, 3] },
    5: { type: 'object', dict: { defaultPreset: 4 } },
  },
}

function view(defaultPreset: string, revision = 0): SettingsNamespaceView {
  return {
    ns: 'permission',
    schema: SCHEMA,
    value: { defaultPreset },
    base: { defaultPreset: 'read-only' },
    autoGenerate: true, applies: 'live',
    secrets: [],
    revision,
  }
}

/** The settings namespace answers over the Remote carrier, which has no envelope. */
function ok<T>(value: T) {
  return { ok: true as const, value }
}

const dictionary: Record<string, string> = es
const t: PermissionRowProps['t'] = key => dictionary[key] ?? key
type AttentionSnapshot = Parameters<Parameters<PermissionRowProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: PermissionRowProps['useSessionStatus'] = selector => selector(noAttention)
const runtime = {
  useSessions: (() => { throw new Error('unused') }) as never,
  useSessionStatus,
  usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
  useWorkspaces: (() => { throw new Error('unused') }) as never,
}

function mount(controller: PermissionPresetSettingsController) {
  return render(
    <PermissionRow
      {...runtime}
      load={() => controller.load()}
      select={preset => controller.select(preset)}
      usePermission={bindSnapshotSelector(controller.store)}
      t={t}
    />,
  )
}

describe('PermissionRow', () => {
  it('describes the chosen preset and each menu row, but not a preset the host renamed', async () => {
    const renamed = {
      ...catalog,
      defaultOptions: [
        { value: 'read-only', name: 'read-only' },
        { value: 'workspace-write', name: 'Project Files' },
      ],
    }
    const source = { store: createSnapshotStore({ value: renamed }), load: () => Promise.resolve(renamed) }
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('read-only')] })),
      },
    }, source)
    mount(controller)
    fireEvent.click(await screen.findByRole('button', { name: /^Solo lectura/ }))
    expect(screen.getAllByText(es['hint.readOnly']).length).toBeGreaterThan(0)
    expect(screen.getByRole('menuitem', { name: 'Project Files' })).toBeTruthy()
    expect(screen.queryByText(es['hint.workspaceWrite'])).toBeNull()
  })

  it('loads the descriptor, opens the menu, and selects a new default', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok(view('workspace-write', 1))))
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('read-only')] })),
        mutate,
      },
    })
    mount(controller)
    const button = await screen.findByRole('button', { name: /^Solo lectura/ })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(button.getAttribute('aria-expanded')).toBe('false') })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('menuitem', { name: /^Solo lectura/ }))
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('menuitem', { name: /^Escritura en el espacio de trabajo/ }))
    await screen.findByRole('button', { name: /^Escritura en el espacio de trabajo/ })
    expect(mutate).toHaveBeenCalledOnce()
  })

  it('requires explicit acknowledgement before saving full access', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok(view('danger-full-access', 1))))
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('read-only')] })),
        mutate,
      },
    })
    mount(controller)
    fireEvent.click(await screen.findByRole('button', { name: /^Solo lectura/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Acceso total/ }))
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: '¿Activar el acceso total?' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Solo lectura/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Acceso total/ }))
    const dialog = screen.getByRole('dialog', { name: '¿Activar el acceso total?' })
    const enable = screen.getByRole('button', { name: 'Activar acceso total' })
    expect((enable as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(enable)
    await waitFor(() => { expect(mutate).toHaveBeenCalledOnce() })
    expect(dialog.isConnected).toBe(false)
  })

  it('hides an unavailable namespace and disables a read-only provider', async () => {
    const absent = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [] })),
        mutate: vi.fn(),
      },
    })
    const rendered = mount(absent)
    await waitFor(() => { expect(rendered.container.textContent).toBe('') })
    rendered.unmount()

    const readonly = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: false, hasDocument: false, namespaces: [view('read-only')] })),
        mutate: vi.fn(),
      },
    })
    mount(readonly)
    expect((await screen.findByRole('button', { name: /^Solo lectura/ })).hasAttribute('disabled')).toBe(true)
  })

  it('shows loading and a contained write error', async () => {
    const describe = Promise.withResolvers<ReturnType<typeof ok<{
      writable: boolean
      namespaces: SettingsNamespaceView[]
    }>>>()
    const controller = derivedController({
      settings: {
        describe: () => describe.promise,
        mutate: () => Promise.resolve({
          ok: false as const,
          error: new RemoteError('settings/conflict', 'changed elsewhere', {
            ns: 'permission', expected: 1, actual: 2,
          }),
        }),
      },
    })
    mount(controller)
    expect((await screen.findByRole('button', { name: 'Cargando' })).hasAttribute('disabled')).toBe(true)
    describe.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('read-only')] }))
    const button = await screen.findByRole('button', { name: /^Solo lectura/ })
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('menuitem', { name: /^Escritura en el espacio de trabajo/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('changed elsewhere')
  })
})
