import { describe, expect, it, vi } from 'vitest'
import { ATTENTION_COOLDOWN_MS, DesktopAgentAttention } from '../src/agent-attention.ts'
import { DEFAULT_ATTENTION_SETTINGS } from '../src/attention-settings.ts'
import { en } from '../src/locale.ts'
import type { DesktopAttentionSettings } from '../src/ipc.ts'

function harness(settings: Partial<DesktopAttentionSettings> = {}) {
  const state = { settings: { ...DEFAULT_ATTENTION_SETTINGS, ...settings }, focused: false, time: 10_000 }
  const notify = vi.fn()
  const focusWindow = vi.fn()
  const startSleepBlocker = vi.fn(() => 7)
  const stopSleepBlocker = vi.fn()
  const attention = new DesktopAgentAttention({
    settings: () => state.settings,
    messages: () => en,
    windowFocused: () => state.focused,
    notify, focusWindow, startSleepBlocker, stopSleepBlocker,
    now: () => state.time,
  })
  return { state, attention, notify, focusWindow, startSleepBlocker, stopSleepBlocker }
}

describe('desktop agent attention', () => {
  it('notifies when an unfocused window sees a finished turn or an approval', () => {
    const { attention, notify, focusWindow } = harness()
    attention.handle({ type: 'agent-attention', kind: 'turn-end' })
    attention.handle({ type: 'agent-attention', kind: 'approval' })
    expect(notify).toHaveBeenNthCalledWith(1, en.aboutProduct, en.attentionTurnEnd, focusWindow)
    expect(notify).toHaveBeenNthCalledWith(2, en.aboutProduct, en.attentionApproval, focusWindow)
  })

  it('stays quiet while the window is focused unless focused notifications are enabled', () => {
    const quiet = harness()
    quiet.state.focused = true
    quiet.attention.handle({ type: 'agent-attention', kind: 'turn-end' })
    expect(quiet.notify).not.toHaveBeenCalled()
    const loud = harness({ notifyWhenFocused: true })
    loud.state.focused = true
    loud.attention.handle({ type: 'agent-attention', kind: 'turn-end' })
    expect(loud.notify).toHaveBeenCalledOnce()
  })

  it('stays quiet when notifications are off', () => {
    const { attention, notify } = harness({ notifications: false })
    attention.handle({ type: 'agent-attention', kind: 'approval' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('collapses a burst of one kind into one notification', () => {
    const { attention, notify, state } = harness()
    attention.handle({ type: 'agent-attention', kind: 'turn-end' })
    state.time += ATTENTION_COOLDOWN_MS - 1
    attention.handle({ type: 'agent-attention', kind: 'turn-end' })
    expect(notify).toHaveBeenCalledOnce()
    state.time += 1
    attention.handle({ type: 'agent-attention', kind: 'turn-end' })
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('holds one sleep blocker while agents run and releases it at zero', () => {
    const { attention, startSleepBlocker, stopSleepBlocker } = harness()
    attention.handle({ type: 'agent-activity', running: 1 })
    attention.handle({ type: 'agent-activity', running: 3 })
    expect(startSleepBlocker).toHaveBeenCalledOnce()
    attention.handle({ type: 'agent-activity', running: 0 })
    expect(stopSleepBlocker).toHaveBeenCalledExactlyOnceWith(7)
  })

  it('does not block sleep when keep-awake is off and follows later changes', () => {
    const { attention, state, startSleepBlocker, stopSleepBlocker } = harness({ keepAwake: false })
    attention.handle({ type: 'agent-activity', running: 1 })
    expect(startSleepBlocker).not.toHaveBeenCalled()
    state.settings = { ...state.settings, keepAwake: true }
    attention.settingsChanged()
    expect(startSleepBlocker).toHaveBeenCalledOnce()
    state.settings = { ...state.settings, keepAwake: false }
    attention.settingsChanged()
    expect(stopSleepBlocker).toHaveBeenCalledOnce()
  })

  it('releases the sleep blocker on dispose', () => {
    const { attention, stopSleepBlocker } = harness()
    attention.handle({ type: 'agent-activity', running: 1 })
    attention.dispose()
    expect(stopSleepBlocker).toHaveBeenCalledOnce()
  })
})
