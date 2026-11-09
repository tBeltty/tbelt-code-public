/** First-party command identities and input spellings shared by Host and Client adapters. */
import type { CommandDescriptor } from './types.ts'

const BUILTINS = {
  goal: '@deepseek-ai/dsh-command-goal',
  plan: '@deepseek-ai/dsh-plan-mode',
  btw: '@deepseek-ai/dsh-command-btw',
  feedback: '@deepseek-ai/dsh-command-feedback',
  compact: '@deepseek-ai/dsh-command-compact',
  permission: '@deepseek-ai/dsh-permission-presets',
  export: '@deepseek-ai/dsh-session-log-export',
} as const

/** Stable first-party capabilities, independent of their registered command names. */
export type BuiltinCommandName = keyof typeof BUILTINS

/** Spellings recognized by command input in each supported locale. */
export const builtinCommandTokens = {
  en: { goal: 'goal', plan: 'plan', btw: 'btw', feedback: 'feedback', compact: 'compact', permission: 'permission', export: 'export' },
  es: { goal: 'objetivo', plan: 'plan', btw: 'btw', feedback: 'comentarios', compact: 'compactar', permission: 'permisos', export: 'exportar' },
  el: { goal: 'στόχος', plan: 'σχέδιο', btw: 'btw', feedback: 'σχόλια', compact: 'συμπύκνωση', permission: 'άδεια', export: 'εξαγωγή' },
  fr: { goal: 'objectif', plan: 'plan', btw: 'btw', feedback: 'avis', compact: 'compacter', permission: 'autorisation', export: 'exporter' },
} as const satisfies Record<'en' | 'es' | 'el' | 'fr', Record<BuiltinCommandName, string>>

/**
 * Identify a first-party definition after scoped shadowing.
 * @param descriptor - effective descriptor from the receiving Agent's catalog.
 * @returns its capability name, or undefined for another definition.
 */
export function builtinCommandName(descriptor: CommandDescriptor): BuiltinCommandName | undefined {
  return (Object.keys(BUILTINS) as BuiltinCommandName[])
    .find(name => descriptor.definitionId === BUILTINS[name])
}

const TOKEN_ALIASES = new Map<string, BuiltinCommandName>(
  (Object.keys(BUILTINS) as BuiltinCommandName[]).flatMap(name =>
    Object.values(builtinCommandTokens).map(tokens => [tokens[name], name] as const)),
)

/**
 * Resolve typed spelling without overriding an exact scoped command name.
 * @param token - typed name without its leading slash.
 * @param descriptors - effective descriptors in the receiving Agent's catalog.
 * @returns the matching descriptor; aliases only select their first-party definition.
 */
export function resolveCommand(token: string, descriptors: readonly CommandDescriptor[]): CommandDescriptor | undefined {
  const exact = descriptors.find(descriptor => descriptor.name === token)
  if (exact !== undefined) return exact
  const name = TOKEN_ALIASES.get(token)
  if (name === undefined) return undefined
  return descriptors.find(descriptor => descriptor.definitionId === BUILTINS[name])
}
