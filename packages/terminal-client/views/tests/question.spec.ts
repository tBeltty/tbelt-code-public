import { describe, expect, it } from 'vitest'
import { createStyle, stripAnsi } from '../src/ansi.ts'
import type { Key, KeyName } from '../src/keys.ts'
import { answerLine, questionLines, QUESTION_OTHER, reduceQuestions, renderQuestions, startQuestions } from '../src/question.ts'
import type { QuestionFacts, QuestionFlow, QuestionStepResult } from '../src/question.ts'

const style = createStyle(false)
const key = (name: KeyName): Key => ({ type: 'key', name })
const text = (value: string): Key => ({ type: 'text', text: value })

/** Apply keys in order, keeping the last result. */
function press(flow: QuestionFlow, ...keys: Key[]): QuestionStepResult {
  let result: QuestionStepResult = { flow }
  for (const next of keys) result = reduceQuestions(result.flow, next)
  return result
}

const mode: QuestionFacts = {
  id: 'mode',
  question: 'Which mode?',
  options: [{ label: 'Fast', description: 'Skip the checks' }, { label: 'Careful' }],
}
const tags: QuestionFacts = { id: 'tags', question: 'Which tags?', options: [{ label: 'a' }, { label: 'b' }], multiSelect: true }
const name: QuestionFacts = { id: 'name', question: 'What name?' }

describe('question flow', () => {
  it('answers a single choice with the label of the chosen row', () => {
    const result = press(startQuestions([mode]), key('down'), key('enter'))
    expect(result.effect).toEqual({ type: 'answered', answer: { id: 'mode', selected: ['Careful'] }, done: true })
    expect(result.flow.answers).toEqual([{ id: 'mode', selected: ['Careful'] }])
  })

  it('moves to the next question and keeps the answers in order', () => {
    const first = press(startQuestions([mode, name]), key('enter'))
    expect(first.effect).toEqual({ type: 'answered', answer: { id: 'mode', selected: ['Fast'] }, done: false })
    expect(first.flow.index).toBe(1)
    const second = press(first.flow, text('Ana'), key('enter'))
    expect(second.effect).toEqual({ type: 'answered', answer: { id: 'name', selected: [], custom: 'Ana' }, done: true })
    expect(second.flow.answers.map(answer => answer.id)).toEqual(['mode', 'name'])
  })

  it('types a custom answer from the last row, and Esc returns to the list', () => {
    const typing = press(startQuestions([mode]), key('up'), key('enter'))
    expect(typing.flow.step.kind).toBe('type')
    expect(press(typing.flow, key('escape')).flow.step.kind).toBe('pick')
    const answered = press(typing.flow, text('Neither'), key('enter'))
    expect(answered.effect).toEqual({ type: 'answered', answer: { id: 'mode', selected: [], custom: 'Neither' }, done: true })
  })

  it('does not send an empty typed answer', () => {
    const typing = press(startQuestions([name]), key('enter'))
    expect(typing.effect).toBeUndefined()
    expect(typing.flow.step.kind).toBe('type')
  })

  it('ticks several options and confirms them', () => {
    const start = startQuestions([tags])
    expect(start.step.kind === 'pick' && start.step.state.checks !== undefined).toBe(true)
    const result = press(start, key('down'), key('enter'), key('down'), key('enter'), key('up'), key('up'), key('enter'))
    expect(result.effect).toEqual({ type: 'answered', answer: { id: 'tags', selected: ['a', 'b'] }, done: true })
  })

  it('adds typed text to the ticked options', () => {
    const start = press(startQuestions([tags]), key('down'), key('enter'))
    const other = press(start.flow, key('down'), key('down'), key('enter'), key('up'), key('up'), key('up'), key('enter'))
    expect(other.flow.step).toMatchObject({ kind: 'type', selected: ['a'] })
    const answered = press(other.flow, text('c'), key('enter'))
    expect(answered.effect).toEqual({ type: 'answered', answer: { id: 'tags', selected: ['a'], custom: 'c' }, done: true })
  })

  it('keeps the ticked options when the typed answer is left empty', () => {
    const ticked = press(startQuestions([tags]), key('down'), key('enter'), key('down'), key('down'), key('enter'), key('up'), key('up'), key('up'), key('enter'))
    expect(ticked.flow.step).toMatchObject({ kind: 'type', selected: ['a'] })
    expect(press(ticked.flow, key('enter')).effect).toEqual({ type: 'answered', answer: { id: 'tags', selected: ['a'] }, done: true })
  })

  it('accepts a multiple choice with nothing ticked', () => {
    const result = press(startQuestions([tags]), key('enter'))
    expect(result.effect).toEqual({ type: 'answered', answer: { id: 'tags', selected: [] }, done: true })
  })

  it('gives up the whole batch with Escape in the list or in a question without options', () => {
    expect(press(startQuestions([mode, name]), key('escape')).effect).toEqual({ type: 'cancel' })
    expect(press(startQuestions([name]), key('escape')).effect).toEqual({ type: 'cancel' })
  })

  it('keeps filtering and cursor keys inside the list', () => {
    const result = press(startQuestions([mode]), text('car'))
    expect(result.effect).toBeUndefined()
    expect(press(result.flow, key('enter')).effect).toMatchObject({ answer: { selected: ['Careful'] } })
  })

  it('names the row that types an answer with a value no option can have', () => {
    expect(QUESTION_OTHER.startsWith('\u0000')).toBe(true)
  })
})

describe('question drawing', () => {
  it('draws the list with the option descriptions', () => {
    const frame = renderQuestions(style, startQuestions([mode]), 60)
    const lines = frame.lines.map(stripAnsi)
    expect(lines[0]).toBe('Which mode?')
    expect(lines.join('\n')).toContain('Fast  Skip the checks')
    expect(lines.join('\n')).toContain('Type another answer…')
  })

  it('draws the typed answer', () => {
    const typing = press(startQuestions([name]), text('An'))
    expect(renderQuestions(style, typing.flow, 60).lines.map(stripAnsi)).toContain('› An')
  })

  it('prints the heading, the position in a batch and the supporting text', () => {
    const plan: QuestionFacts = { id: 'p', question: 'Approve?', header: 'Plan review', detail: '# Plan\n\n- step one', options: [{ label: 'Approve' }] }
    expect(questionLines(style, startQuestions([plan])).map(stripAnsi)).toEqual(['? Plan review', '', '  # Plan', '  ', '  - step one', ''])
    expect(questionLines(style, startQuestions([mode, name])).map(stripAnsi)).toEqual(['? The agent has a question (question 1 of 2)'])
  })

  it('summarizes an answer on one line', () => {
    expect(stripAnsi(answerLine(style, { id: 'x', selected: ['a', 'b'], custom: 'c' }))).toBe('  → a, b, c')
    expect(stripAnsi(answerLine(style, { id: 'x', selected: ['a'] }))).toBe('  → a')
  })
})
