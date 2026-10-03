/** Staged monthly spend limit backed by the Host's `spend-budget` settings section. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsNumberField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Settings namespace of the spend ledger: its profile entry id. Spelled here
 * rather than imported, because a client package must not depend on a Host package.
 */
export const SPEND_BUDGET_NS = 'spend-budget'

/** The Host-owned spend-budget fields this page edits. */
export interface SpendingSettings {
  monthlyLimitUsd: number | undefined
}

/** Effective value and draft presented by the Spending section. */
export interface SpendingLimitState extends SettingsFormShell {
  monthlyLimitUsd: SettingsFieldState
}

/** Actions and observable state bound by the slot renderer. */
export interface SpendingLimitFace extends SettingsFormActions {
  hooks: {
    spendingLimit: SnapshotStore<SpendingLimitState>
  }
}

/** Bind the monthly limit to one staged settings form; an empty draft removes the limit. */
export class SpendingLimitController {
  private readonly form: SettingsFormModel<SpendingSettings>
  private readonly store: SnapshotStore<SpendingLimitState>

  /** @param scope - The Host's `spend-budget` settings section. */
  constructor(scope: SettingsFormScope<SpendingSettings>) {
    const numeric = settingsNumberField('monthlyLimitUsd')
    this.form = new SettingsFormModel(scope, [{
      ...numeric,
      parse: (text) => {
        const write = numeric.parse(text.trim().replace(/^\$/, ''))
        return write?.kind === 'set' && (write.value as number) < 0 ? undefined : write
      },
    }])
    this.store = this.form.bind(() => ({ ...this.form.shell(), monthlyLimitUsd: this.form.field('monthlyLimitUsd') }))
  }

  /**
   * Bind the limit editor to the slot renderer.
   * @returns The limit snapshot and staged write actions.
   */
  inject(): SpendingLimitFace {
    return { hooks: { spendingLimit: this.store }, ...this.form.actions() }
  }

  /** Release accepted-value subscriptions. */
  dispose(): void { this.form.dispose() }
}
