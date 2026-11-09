import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerTimedQuestion } from '../src/timed-question.ts'
import type { QuestionAnswerPort, QuestionRequestPort, RemotePort } from '../src/ports.ts'

type Frame = IteratorResult<{ readonly remainingMs: number }>

const request: QuestionRequestPort = { questions: [{ id: 'q', question: 'Sure?' }], wait: { callId: 'c1', timed: true } }
const answer: QuestionAnswerPort = { answers: [{ id: 'q', selected: ['Yes'] }] }
const fallback: QuestionAnswerPort = { answers: [] }

afterEach(() => { vi.useRealTimers() })

/** A Host claim the test opens and ends by hand; aborting its signal ends the stream like the Host does. */
function hostClaim(withDispose = true) {
  const waiting: { resolve: (frame: Frame) => void; reject: (error: Error) => void }[] = []
  const buffered: Frame[] = []
  const emit = (frame: Frame): void => {
    const reader = waiting.shift()
    if (reader === undefined) buffered.push(frame)
    else reader.resolve(frame)
  }
  const iterator = {
    next: () => {
      const frame = buffered.shift()
      return frame === undefined
        ? new Promise<Frame>((resolve, reject) => { waiting.push({ resolve, reject }) })
        : Promise.resolve(frame)
    },
  }
  const dispose = vi.fn()
  const signals: AbortSignal[] = []
  const remote: Pick<RemotePort, 'userQuestions'> = {
    userQuestions: {
      attachWait: (_sessionId, _callId, signal) => {
        signals.push(signal)
        signal.addEventListener('abort', () => { emit({ done: true, value: undefined }) }, { once: true })
        return { [Symbol.asyncIterator]: () => iterator, ...withDispose ? { dispose } : {} }
      },
    },
  }
  return {
    remote,
    dispose,
    signals,
    open: (remainingMs: number) => { emit({ done: false, value: { remainingMs } }) },
    end: () => { emit({ done: true, value: undefined }) },
    fail: (error: Error) => { waiting.shift()?.reject(error) },
  }
}

function start(claim: ReturnType<typeof hostClaim>, ask: (shown: QuestionRequestPort, remainingMs: number) => Promise<QuestionAnswerPort>,
  overrides: Partial<QuestionRequestPort> = {}) {
  const next = vi.fn(() => Promise.resolve(fallback))
  const result = answerTimedQuestion({
    remote: claim.remote, sessionId: 's1', callId: 'c1', request: { ...request, ...overrides }, ask, next,
  })
  return { result, next }
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('answerTimedQuestion', () => {
  it('returns the answer and releases the claim only after the Host has closed it', async () => {
    const claim = hostClaim()
    const ask = vi.fn(() => Promise.resolve(answer))
    const { result } = start(claim, ask)
    claim.open(30_000)
    await expect(result).resolves.toBe(answer)
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ questions: request.questions }), 30_000)
    await flush()
    expect(claim.signals[0]!.aborted).toBe(false)
    expect(claim.dispose).not.toHaveBeenCalled()
    claim.end()
    await flush()
    expect(claim.signals[0]!.aborted).toBe(true)
    expect(claim.dispose).toHaveBeenCalledOnce()
  })

  it('hands the question on when the Host has no wait to claim', async () => {
    const claim = hostClaim()
    const ask = vi.fn(() => Promise.resolve(answer))
    const { result, next } = start(claim, ask)
    claim.end()
    await expect(result).resolves.toBe(fallback)
    expect(ask).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
    expect(claim.signals[0]!.aborted).toBe(true)
    expect(claim.dispose).toHaveBeenCalledOnce()
  })

  it('rejects with ASK_TIMED_OUT when the countdown ends and withdraws the questions', async () => {
    vi.useFakeTimers()
    const claim = hostClaim()
    let shownSignal: AbortSignal | undefined
    const ask = vi.fn((shown: QuestionRequestPort) => {
      shownSignal = shown.signal
      return new Promise<QuestionAnswerPort>((_resolve, reject) => {
        shown.signal?.addEventListener('abort', () => { reject(new Error('withdrawn')) }, { once: true })
      })
    })
    const { result } = start(claim, ask)
    const outcome = expect(result).rejects.toMatchObject({ name: 'UserQuestionError', code: 'ASK_TIMED_OUT' })
    claim.open(5_000)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(shownSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await outcome
    expect(shownSignal?.aborted).toBe(true)
    expect(claim.signals[0]!.aborted).toBe(false)
    claim.end()
    await vi.advanceTimersByTimeAsync(0)
    expect(claim.signals[0]!.aborted).toBe(true)
  })

  it('rejects with ASK_ABORTED when the Host closes the wait first', async () => {
    const claim = hostClaim()
    const { result } = start(claim, () => new Promise<QuestionAnswerPort>(() => {}))
    claim.open(30_000)
    await flush()
    claim.end()
    await expect(result).rejects.toMatchObject({ name: 'UserQuestionError', code: 'ASK_ABORTED' })
  })

  it('withdraws the questions and releases the claim when the request is aborted', async () => {
    const claim = hostClaim()
    const turn = new AbortController()
    const { result } = start(claim, shown => new Promise<QuestionAnswerPort>((_resolve, reject) => {
      shown.signal?.addEventListener('abort', () => { reject(new Error('withdrawn')) }, { once: true })
    }), { signal: turn.signal })
    claim.open(30_000)
    await flush()
    turn.abort()
    await expect(result).rejects.toThrow('withdrawn')
    await flush()
    expect(claim.signals[0]!.aborted).toBe(true)
    expect(claim.dispose).toHaveBeenCalledOnce()
  })

  it('releases a claim without dispose', async () => {
    const claim = hostClaim(false)
    const { result } = start(claim, () => Promise.resolve(answer))
    claim.open(30_000)
    await expect(result).resolves.toBe(answer)
    claim.end()
    await flush()
    expect(claim.signals[0]!.aborted).toBe(true)
  })

  it('rejects and releases when the claim stream fails before its first frame', async () => {
    const claim = hostClaim()
    const ask = vi.fn(() => Promise.resolve(answer))
    const { result } = start(claim, ask)
    claim.fail(new Error('stream broke'))
    await expect(result).rejects.toThrow('stream broke')
    expect(ask).not.toHaveBeenCalled()
    expect(claim.signals[0]!.aborted).toBe(true)
    expect(claim.dispose).toHaveBeenCalledOnce()
  })

  it('rejects with the stream error when the claim fails while the person answers', async () => {
    const claim = hostClaim()
    const { result } = start(claim, () => new Promise<QuestionAnswerPort>(() => {}))
    claim.open(30_000)
    await flush()
    claim.fail(new Error('stream broke'))
    await expect(result).rejects.toThrow('stream broke')
    expect(claim.dispose).toHaveBeenCalledOnce()
  })
})
