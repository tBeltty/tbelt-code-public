/** Locale-owned terminal card copy for the Web client. @module */
import type { TerminalBlockLabels, TerminalBlockProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { TerminalCardModel } from '@deepseek-ai/dsh-presentation-tool-card'

/**
 * Build the TerminalBlock display copy from the conversation locale seat —
 * the one place the primitive's label surface pairs with this package's
 * dictionary, shared by every terminal render site (chat row, bash row,
 * details panel).
 * @param t - the render site's conversation locale seat.
 * @returns the full label set for {@link TerminalBlockProps}'s `labels`.
 */
export function terminalBlockLabels(t: TranslateNS<'conversation'>): TerminalBlockLabels {
  return {
    signal: signal => t('terminal.signal', { signal }),
    exitCode: code => t('terminal.exitCode', { code }),
    noExitCode: t('terminal.noExitCode'),
    running: t('terminal.running'),
    failed: t('terminal.failed'),
    done: t('terminal.done'),
    copy: t('copy'),
    copied: t('copied'),
    noOutput: t('terminal.noOutput'),
    collapseAria: t('terminal.collapseAria'),
    collapse: t('collapse'),
    expandAria: hidden => t('terminal.expandAria', { n: hidden }),
    expand: hidden => t('terminal.expandRest', { n: hidden }),
  }
}

interface LocalizedTerminalCardModel {
  readonly card: Pick<TerminalBlockProps, 'command' | 'cwd' | 'output' | 'exitCode' | 'signal' | 'running'>
  readonly description: string | undefined
}

/**
 * Resolve locale-owned `terminal_send` copy while preserving Tool-authored
 * shell commands and descriptions verbatim.
 * @param model - locale-neutral terminal card data.
 * @param t - the render site's conversation locale seat.
 * @returns terminal props and description ready for rendering.
 */
export function localizeTerminalCardModel(
  model: TerminalCardModel,
  t: TranslateNS<'conversation'>,
): LocalizedTerminalCardModel {
  if (model.copy.kind === 'shell') {
    return {
      card: { command: model.copy.command, ...model.card },
      description: model.copy.description,
    }
  }
  return {
    card: {
      command: model.copy.text === '' ? t('terminal.sendInput') : model.copy.text,
      ...model.card,
    },
    description: t('terminal.session', { sessionId: model.copy.sessionId }),
  }
}
