// @vitest-environment jsdom
/** Collapsed progress summaries and Host-owned steps survive view remounts. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { es as commonEs } from '@deepseek-ai/dsh-client-locale/src/locales/es.ts'
import type { SpeechPreparationState, SpeechPreparationStep, SpeechProviderId } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import { afterEach, expect, it, vi } from 'vitest'
import { PreparationCard, VoicePreparation } from '../src/client/PreparationCard.tsx'
import type { VoiceInputProps } from '../src/client/VoiceInput.tsx'
import type { SpeechReadiness } from '../src/client/readiness.ts'
import { Recording } from '../src/client/audio.ts'
import { en, es, el, fr } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })
const id = 'local' as SpeechProviderId, t = makeTranslate(es, commonEs)
const steps: SpeechPreparationStep[] = [
  { kind: 'check', status: 'complete' }, { kind: 'model', status: 'complete' },
  { kind: 'vad', status: 'complete' }, { kind: 'verify', status: 'running', startedAt: 0 }, { kind: 'load', status: 'pending' },
]
function fixture(preparation: SpeechPreparationState, connected = true) {
  const prepare = vi.fn(async (_id: SpeechProviderId) => {}), cancelPreparation = vi.fn(async (_id: SpeechProviderId) => {})
  const props = { provider: { id, name: 'SenseVoiceSmall', location: 'host-local' as const, languages: ['auto', 'zh', 'en', 'ja'], preparation },
    connected, prepare, cancelPreparation, t }
  return { ...render(<PreparationCard {...props} />), prepare, cancelPreparation, props }
}
it('collapses by default, expands all steps, and shows details only for the active step', async () => {
  vi.useFakeTimers(); vi.setSystemTime(5000)
  const b = fixture({ phase: 'checking', step: 'verify', startedAt: 0, steps })
  expect(screen.queryByRole('list')).toBeNull()
  expect(screen.getByText('Esperando 5 segundos')).toBeTruthy()
  expect(screen.queryByRole('progressbar')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Verificar archivos de modelo/ }))
  expect(screen.getAllByRole('listitem')).toHaveLength(5)
  expect(b.container.querySelectorAll('[data-step-state="complete"] [data-state="done"]')).toHaveLength(3)
  expect(b.container.querySelectorAll('[data-step-state="pending"] [data-state="idle"]')).toHaveLength(1)
  expect(screen.getAllByText('Esperando 5 segundos')).toHaveLength(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.getByText('Esperando 6 segundos')).toBeTruthy()
  b.unmount()
  fixture({ phase: 'checking', step: 'verify', startedAt: 0, steps })
  expect(screen.getByText('Esperando 6 segundos')).toBeTruthy()
  expect(screen.queryByRole('list')).toBeNull()
})
it('uses measured byte progress in both the collapsed summary and expanded active step', () => {
  const state: SpeechPreparationState = { phase: 'downloading', step: 'model', resource: 'model.pt',
    completedBytes: 638_000_000, totalBytes: 936_000_000,
    steps: steps.map(step => ({ ...step, status: step.kind === 'model' ? 'running' : step.kind === 'verify' ? 'complete' : step.status })),
  }
  const b = fixture(state)
  expect(screen.getByRole('status').textContent).toContain('638.0 / 936.0 MB, 68%')
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('638000000')
  fireEvent.click(screen.getByRole('button', { name: /Preparar modelo de reconocimiento/ }))
  expect(screen.getByRole('progressbar').getAttribute('max')).toBe('936000000')
  expect(screen.getByText('model.pt')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: es.cancelPrepare }))
  expect(b.cancelPreparation).toHaveBeenCalledWith(id)
})
it('keeps unknown download totals indeterminate and disables commands while disconnected', () => {
  const b = fixture({ phase: 'downloading', resource: 'model.pt', completedBytes: 638_000_000 })
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('Descargado 638.0 MB')
  b.rerender(<PreparationCard {...b.props} connected={false} />)
  fireEvent.click(screen.getByRole('button', { name: es.cancelPrepare }))
  expect(b.cancelPreparation).not.toHaveBeenCalled()
  expect(screen.getByText(es.reconnecting)).toBeTruthy()
})
it('starts preparation and offers retry without showing progress for completed or pending steps', async () => {
  const b = fixture({ phase: 'unprepared', steps: steps.map(step => ({ kind: step.kind, status: 'pending' })) })
  fireEvent.click(screen.getByRole('button', { name: es.prepare }))
  expect(b.prepare).toHaveBeenCalledWith(id)
  b.rerender(<PreparationCard {...b.props} provider={{ ...b.props.provider,
    preparation: { phase: 'failed', message: 'network unavailable', steps: [{ kind: 'model', status: 'failed' }] } }} />)
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: es.retryPrepare }).disabled).toBe(false) })
  b.prepare.mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByRole('button', { name: es.retryPrepare }))
  await screen.findByText('Error en el reconocimiento de voz: offline')
  b.prepare.mockRejectedValueOnce('network closed')
  fireEvent.click(screen.getByRole('button', { name: es.retryPrepare }))
  await screen.findByText('Error en el reconocimiento de voz: network closed')
  fireEvent.click(screen.getByRole('button', { name: es['short.failed'] }))
  expect(screen.queryByRole('progressbar')).toBeNull()
})
it('shows waking without an explicit preparation cancellation control', () => {
  fixture({ phase: 'waking', startedAt: Date.now() - 5000 })
  expect(screen.getByText('Esperando 5 segundos')).toBeTruthy()
  expect(screen.queryByRole('button', { name: es.cancelPrepare })).toBeNull()
})
it('explains download failures on the Host machine and retains an actionable retry', () => {
  const b = fixture({ phase: 'failed', message: 'fetch failed', download: {
    resource: 'model.int8.onnx', source: 'https://mirror.example', reason: 'dns', code: 'ENOTFOUND',
  } })
  const alert = screen.getByRole('alert')
  expect(alert.textContent).toContain('No se puede descargar model.int8.onnx: no se pudo resolver la dirección de descarga.')
  expect(alert.textContent).toContain('Verifique la configuración de DNS y proxy en la máquina que ejecuta tBelt Code')
  expect(alert.textContent).toContain('Fuente de descarga: https://mirror.example')
  expect(alert.textContent).toContain('Código de error: ENOTFOUND')
  expect(alert.textContent).not.toContain('fetch failed')
  expect(alert.textContent).not.toContain('Hugging Face')
  fireEvent.click(screen.getByRole('button', { name: es.retryPrepare }))
  expect(b.prepare).toHaveBeenCalledWith(id)
  b.rerender(<PreparationCard {...b.props} provider={{ ...b.props.provider, preparation: {
    phase: 'failed', message: 'download unavailable', download: {
      resource: 'tokens.txt', source: 'https://huggingface.co', reason: 'http', status: 503,
    },
  } }} />)
  expect(screen.getByRole('alert').textContent).toContain('No se puede descargar tokens.txt: el servicio de descarga devolvió HTTP 503.')
  expect(screen.getByRole('alert').textContent).not.toContain('Código de error')
  b.rerender(<PreparationCard {...b.props} provider={{ ...b.props.provider,
    preparation: { phase: 'failed', message: 'runtime missing' } }} />)
  expect(screen.getByRole('alert').textContent).toBe('Error de preparación: runtime missing')
})
it('persists settings and reports disconnection in the detail card', async () => {
  const store = createSnapshotStore<SpeechReadiness>({ connected: true, error: null, catalog: {
    selection: { providerId: id, language: 'auto' }, maxAudioBytes: 100, maxDurationSeconds: 120,
    providers: [{ id, name: 'SenseVoiceSmall', location: 'host-local', languages: ['auto', 'zh', 'en', 'ja'], preparation: { phase: 'ready' } },
      { id: 'cloud' as SpeechProviderId, name: 'Cloud', location: 'cloud', languages: ['auto', 'en', 'zh', 'ja', 'fr', 'it'], preparation: { phase: 'ready' } }],
  } })
  const configure = vi.fn<VoiceInputProps['configure']>(async () => {})
  const props = { useSpeechReadiness: bindSnapshotSelector(store), configure, t,
    useMicrophoneDevice: bindSnapshotSelector(createSnapshotStore({ id: '', label: '' })),
    selectMicrophone: vi.fn(), createRecording: () => new Recording(() => {}),
    prepare: vi.fn(async () => {}), cancelPreparation: vi.fn(async () => {}) }
  const view = render(<VoicePreparation {...props} />)
  fireEvent.change(screen.getByLabelText(es.provider), { target: { value: 'cloud' } })
  await waitFor(() => { expect(configure).toHaveBeenCalledWith({ providerId: 'cloud' }) })
  const current = store.getSnapshot()
  act(() => { store.set({ ...current, catalog: { ...current.catalog!, selection: { providerId: 'cloud' as SpeechProviderId, language: 'en' } } }) })
  expect(screen.getByText(es.cloud)).toBeTruthy()
  expect(within(screen.getByLabelText(es.language)).getAllByRole<HTMLOptionElement>('option').map(item => item.value))
    .toEqual(['auto', 'en', 'zh', 'ja', 'fr', 'it'])
  expect(within(screen.getByLabelText(es.language)).getByRole('option', { name: es.fr })).toBeTruthy()
  expect(within(screen.getByLabelText(es.language)).getByRole('option', { name: 'it' })).toBeTruthy()
  configure.mockRejectedValueOnce(new Error('settings are read-only'))
  fireEvent.change(screen.getByLabelText(es.language), { target: { value: 'zh' } })
  await screen.findByText('Error en el reconocimiento de voz: settings are read-only')
  configure.mockRejectedValueOnce('settings are locked')
  fireEvent.change(screen.getByLabelText(es.language), { target: { value: 'ja' } })
  await screen.findByText('Error en el reconocimiento de voz: settings are locked')
  act(() => { store.set({ catalog: null, connected: false, error: 'disconnected' }) })
  view.rerender(<VoicePreparation {...props} />)
  expect(screen.getByText(es.loading)).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('disconnected')
})
it.each(['cancelled', 'standby', 'cancelling'] as const)('displays Host state %s', (phase) => {
  fixture(phase === 'cancelling' ? { phase, startedAt: Date.now() } : { phase })
  expect(screen.getByText(es[`preparation.${phase}`])).toBeTruthy()
})

it('shows provider-specific installation estimates before preparation and removes them while running', () => {
  const b = fixture({ phase: 'unprepared' })
  const provider = { ...b.props.provider, setupEstimate: {
    recommendedDiskBytes: 5_000_000_000, expectedMemoryBytes: 2_000_000_000, minimumMinutes: 5, maximumMinutes: 30,
  } }
  b.rerender(<PreparationCard {...b.props} provider={provider} />)
  expect(screen.getByText(es['setup.local'])).toBeTruthy()
  expect(screen.getByText(/Permitir aproximadamente 5 GB/)).toBeTruthy()
  expect(screen.getByText(/Aproximadamente 2 GB con el modelo cargado/)).toBeTruthy()
  expect(screen.getByText(/Espere aproximadamente 5–30 minutos/)).toBeTruthy()
  b.rerender(<PreparationCard {...b.props} provider={{ ...provider, preparation: { phase: 'checking', startedAt: Date.now() } }} />)
  expect(screen.queryByText(es['setup.local'])).toBeNull()
})

it('offers Host sources, submits a manual choice, and retains it for retry', async () => {
  const b = fixture({ phase: 'unprepared' })
  const provider = { ...b.props.provider, downloadSources: ['https://huggingface.co', 'https://hf-mirror.com'] }
  b.rerender(<PreparationCard {...b.props} provider={provider} />)
  const picker = screen.getByLabelText<HTMLSelectElement>(es.sourceChoice)
  expect(picker.value).toBe('')
  expect(within(picker).getAllByRole('option').map(option => option.textContent)).toEqual([es.sourceAuto, es.sourceHuggingFace, es.sourceMirror])
  expect(screen.getByText(es.sourceAutoHelp)).toBeTruthy()
  fireEvent.change(picker, { target: { value: 'https://hf-mirror.com' } })
  expect(screen.getByText(es.sourceManualHelp)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: es.prepare }))
  await waitFor(() => { expect(b.prepare).toHaveBeenCalledWith(id, { downloadSource: 'https://hf-mirror.com' }) })
  b.rerender(<PreparationCard {...b.props} provider={{ ...provider, preparation: { phase: 'failed', message: 'offline' } }} />)
  expect(screen.getByLabelText<HTMLSelectElement>(es.sourceChoice).value).toBe('https://hf-mirror.com')
  fireEvent.change(picker, { target: { value: 'https://huggingface.co' } })
  fireEvent.click(screen.getByRole('button', { name: es.retryPrepare }))
  await waitFor(() => { expect(b.prepare).toHaveBeenLastCalledWith(id, { downloadSource: 'https://huggingface.co' }) })
  fireEvent.change(picker, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: es.retryPrepare }))
  await waitFor(() => { expect(b.prepare).toHaveBeenLastCalledWith(id) })
})

it('respects a fixed private source and removes a choice that the Host withdraws', async () => {
  const b = fixture({ phase: 'unprepared' })
  b.rerender(<PreparationCard {...b.props} provider={{ ...b.props.provider, downloadSources: ['https://huggingface.co', 'https://hf-mirror.com'] }} />)
  fireEvent.change(screen.getByLabelText(es.sourceChoice), { target: { value: 'https://hf-mirror.com' } })
  b.rerender(<PreparationCard {...b.props} provider={{ ...b.props.provider, downloadSources: ['https://private.example'] }} />)
  const picker = screen.getByLabelText<HTMLSelectElement>(es.sourceChoice)
  expect(picker.value).toBe('https://private.example')
  expect(picker.disabled).toBe(true)
  expect(within(picker).getAllByRole('option')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: es.prepare }))
  await waitFor(() => { expect(b.prepare).toHaveBeenCalledWith(id, { downloadSource: 'https://private.example' }) })
  b.rerender(<PreparationCard {...b.props} provider={{ ...b.props.provider, downloadSources: [] }} />)
  expect(screen.queryByLabelText(es.sourceChoice)).toBeNull()
})

it('locks source changes while a preparation request is pending and hides them during active work', async () => {
  const b = fixture({ phase: 'unprepared' }), pending = Promise.withResolvers<undefined>()
  b.prepare.mockImplementation(async () => { await pending.promise })
  const provider = { ...b.props.provider, downloadSources: ['https://huggingface.co', 'https://hf-mirror.com'] }
  b.rerender(<PreparationCard {...b.props} provider={provider} />)
  fireEvent.click(screen.getByRole('button', { name: es.prepare }))
  try {
    expect(screen.getByLabelText<HTMLSelectElement>(es.sourceChoice).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: es.prepare }).disabled).toBe(true)
  } finally { await act(async () => { pending.resolve(undefined); await pending.promise }) }
  b.rerender(<PreparationCard {...b.props} provider={provider} connected={false} />)
  expect(screen.getByLabelText<HTMLSelectElement>(es.sourceChoice).disabled).toBe(true)
  b.rerender(<PreparationCard {...b.props} provider={{ ...provider, preparation: { phase: 'downloading', resource: 'model.onnx', completedBytes: 0 } }} />)
  expect(screen.queryByLabelText(es.sourceChoice)).toBeNull()
})

it('gives each speech recognition language a distinct localized name', () => {
  for (const dictionary of [en, es, el, fr]) {
    const names = [
      dictionary.zh, dictionary.en, dictionary.yue, dictionary.ja, dictionary.es,
      dictionary.fr, dictionary.de, dictionary.ru, dictionary.pt, dictionary.ko,
    ]
    expect(new Set(names).size).toBe(names.length)
  }
  expect(es.fr).toBe('francés')
})
