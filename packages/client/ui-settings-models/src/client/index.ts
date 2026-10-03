/**
 * Models settings and product-onboarding plugin, browser half. It registers
 * the Models page, the Spending page while the Host serves the spend ledger,
 * plus a model-agnostic first-run provider dialog, whose UI
 * shares this package's modal wrapper. The Host settings and credential
 * contracts stay behind their existing wire APIs.
 * Export discipline:
 * packages/client/AGENTS.md.
 */
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge and the forwarded-event key face
// (settings/credentials invalidations ride the allowlist) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { ModelsSection } from './ModelsSection.tsx'
import type { ModelsSectionInjected } from './ModelsSection.tsx'
import { ProviderOnboardingDialog } from './ProviderOnboardingDialog.tsx'
import type { ProviderOnboardingInjected } from './ProviderOnboardingDialog.tsx'
import { ModelsSettingsStore } from './store.ts'
import { createModelsOperations } from './operations.ts'
import { createSettingsSchemaOperations } from './schema-operations.ts'
import { en, zh, type ModelsKey } from './locales.ts'
import { SpendingSection } from './SpendingSection.tsx'
import type { SpendingSectionInjected } from './SpendingSection.tsx'
import { SPEND_BUDGET_NS, SpendingLimitController } from './spending-controller.ts'

export type { ModelsSectionInjected, ModelsSectionProps } from './ModelsSection.tsx'
export type { SpendingSectionInjected } from './SpendingSection.tsx'
export type { SpendingLimitFace, SpendingLimitState, SpendingSettings } from './spending-controller.ts'
export type { ModelsFooterOwnerProps, ProviderCardExtrasOwnerProps } from './slot-contract.ts'
export type { ModelsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Models page + product-onboarding copy. */
    'settings.models': ModelsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.models'

export type {
  ModelsSettingsState, ProviderDirectoryEntry, ProviderRow,
} from './store.ts'
export type { ModelDiscoveryOutcome, ModelsOperations, SettingsWriteOutcome } from './operations.ts'

/**
 * Refetch the page snapshot only after its first load: an unopened Models
 * page must not fetch on background invalidations.
 * @param controller - the page store.
 */
export function refreshIfLoaded(controller: ModelsSettingsStore): void {
  if (controller.store.getSnapshot().status === 'idle') return
  void controller.load()
}

/**
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on each slot through `slots.inject()`.
 */
export const inject = [
  'slots', 'locale', 'remote', 'remote.credentials', 'remote.llm', 'remote.settings', 'remote.session',
  'configForms', 'settingsSchema',
]

/**
 * Register the Models section once the `settings.section` declaration is on
 * the ledger, wire its store to the connection, and keep it fresh on every
 * pushed invalidation (settings, credentials, or provider topology).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-models: copy dictionaries')

  const schema = createSettingsSchemaOperations(ctx.settingsSchema)
  // Bound once here, where the Remote namespaces are declared in this plugin's
  // own `inject`; the cards receive callbacks and never a context.
  const operations = createModelsOperations(ctx)
  const controller = new ModelsSettingsStore(ctx, schema, ctx.configForms.describe())
  // Registration-time text (the nav label thunk) and the inject faces share
  // one bound translate; copy freshness rides the locale revision.
  const t = ctx.locale.bind(NS) as ModelsSectionInjected['t']
  const injected = (): ModelsSectionInjected => ({
    controller,
    hooks: { snapshot: controller.store },
    operations,
    schema,
    t,
  })
  const providerOnboardingInjected = (): ProviderOnboardingInjected => ({
    controller,
    hooks: { models: controller.store },
    operations,
    schema,
    t,
  })
  // Pushed invalidations converge every open surface without polling. The
  // configForms injection makes ui-settings activate first, and remote
  // dispatch preserves listener order; its listener therefore starts the
  // mirror refresh before this store joins that refresh.
  ctx.effect(() => {
    const refreshModels = (): void => { refreshIfLoaded(controller) }
    const disposers = [
      ctx.remote.$on('settings/document-updated', () => { refreshModels() }),
      ctx.remote.$on('credentials/record-updated', refreshModels),
      ctx.remote.$on('credentials/reference-updated', refreshModels),
      ctx.remote.$on('llm/adapters-updated', refreshModels),
      ctx.on('connection/reset', refreshModels),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'ui-settings-models: pushed invalidations')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'models',
    order: 10,
    label: () => t('nav'),
    inject: injected,
    children: {
      'settings.models.provider-card': { kind: 'keyed', scope: 'root' },
      'settings.models.footer': { kind: 'list', scope: 'root' },
    },
  }, ModelsSection))
  // The Spending section, while the Host serves both the spend ledger's
  // Remote and its settings namespace.
  ctx.inject(['remote.spendBudget'], (scope: ClientContext) => {
    const limit = new SpendingLimitController(scope.configForms.get(SPEND_BUDGET_NS))
    scope.effect(() => () => { limit.dispose() }, 'ui-settings-models: spending form subscription')
    const spendingInjected = (): SpendingSectionInjected => ({
      ...limit.inject(),
      readMonth: async () => {
        try {
          const result = await scope.remote.spendBudget.month()
          return result.ok ? result.value : undefined
        } catch (error) {
          // The section keeps its last reading; the next mount or save retries.
          console.warn('[ui-settings-models] spend read failed:', error)
          return undefined
        }
      },
      t,
    })
    scope.effect(() => scope.configForms.whileServed([SPEND_BUDGET_NS], () => scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section',
      id: 'spending',
      order: 11,
      label: () => t('spendingNav'),
      inject: spendingInjected,
    }, SpendingSection))), 'ui-settings-models: spending section')
  })

  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'provider-onboarding',
    order: 0,
    inject: providerOnboardingInjected,
  }, ProviderOnboardingDialog))
}
