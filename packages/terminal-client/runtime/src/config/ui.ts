/**
 * What a configuration flow asks of the terminal: a choice, several choices, a
 * typed answer and a line of feedback. {@link TerminalSession} answers them in
 * place of the composer; tests answer them from a script.
 * @module @deepseek-ai/dsh-terminal-client/config/ui
 */
import { t } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem, PromptOptions } from '@deepseek-ai/dsh-terminal-views'
import type { RemoteResultPort } from '../ports.ts'

/** The questions and messages of a configuration flow. */
export interface FlowUi {
  /**
   * Ask the person to choose one item.
   * @param title - heading of the list.
   * @param items - the choices.
   * @returns the chosen item, or undefined when the person left the list.
   */
  pick(title: string, items: readonly PickerItem[]): Promise<PickerItem | undefined>
  /**
   * Ask the person to tick any number of items.
   * @param title - heading of the list.
   * @param items - the choices.
   * @param options - the items ticked at the start.
   * @returns the values ticked, in list order, or undefined when the person left the list.
   */
  pickMany(title: string, items: readonly PickerItem[], options: { readonly checked: readonly string[] }): Promise<string[] | undefined>
  /**
   * Ask for one line of text.
   * @param label - what is being asked.
   * @param options - hint, masking and the starting text.
   * @returns the trimmed answer, possibly empty, or undefined when the person left the question.
   */
  ask(label: string, options?: PromptOptions): Promise<string | undefined>
  /** Print a dim line. */
  info(text: string): void
  /** Print a red line. */
  warn(text: string): void
}

/**
 * Run a Remote call and report its failure.
 * @param ui - where a failure is printed.
 * @param failedText - the line that introduces the failure, given the Host's message.
 * @param call - the Remote call.
 * @returns the value, or undefined after the failure was printed.
 */
export async function remoteValue<T>(
  ui: FlowUi,
  failedText: (message: string) => string,
  call: () => Promise<RemoteResultPort<T>>,
): Promise<T | undefined> {
  let result: RemoteResultPort<T>
  try {
    result = await call()
  } catch (error) {
    ui.warn(failedText(error instanceof Error ? error.message : String(error)))
    return undefined
  }
  if (result.ok) return result.value
  ui.warn(failedText(result.error.message))
  return undefined
}

/**
 * Run a Remote call whose success carries no value and report its failure.
 * @param ui - where a failure is printed.
 * @param failedText - the line that introduces the failure, given the Host's message.
 * @param call - the Remote call.
 * @returns whether the call succeeded.
 */
export async function remoteDone(
  ui: FlowUi,
  failedText: (message: string) => string,
  call: () => Promise<RemoteResultPort<unknown>>,
): Promise<boolean> {
  let result: RemoteResultPort<unknown>
  try {
    result = await call()
  } catch (error) {
    ui.warn(failedText(error instanceof Error ? error.message : String(error)))
    return false
  }
  if (!result.ok) ui.warn(failedText(result.error.message))
  return result.ok
}

/**
 * Ask a yes or no question.
 * @param ui - where the question is shown.
 * @param question - the heading.
 * @param yes - the label of the confirming choice.
 * @returns true only when the person chose the confirming choice.
 */
export async function confirm(ui: FlowUi, question: string, yes: string): Promise<boolean> {
  const answer = await ui.pick(question, [
    { value: 'no', label: t('confirm.no') },
    { value: 'yes', label: yes },
  ])
  return answer?.value === 'yes'
}
