/**
 * What the `artifacts` tab type IS: a right-Sidebar page listing every file the
 * Session's loaded Turns delivered or changed, newest Turn first. It claims no
 * address; the Session header's Artifacts button and the guide open it by kind.
 */
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { IconDeliverDocRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NS } from './locales.ts'

/** The tab kind the Artifacts page registers. */
export const ARTIFACTS_KIND = 'artifacts'

/** The Artifacts page's identity in the tab system, and the key its body and title register under. */
export const ARTIFACTS_ID = '@deepseek-ai/dsh-client-ui-deliverables/artifacts'

/**
 * The Artifacts page's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function artifactsDefinition(t: TranslateNS<typeof NS>): SidebarRightTabDefinition {
  return {
    id: ARTIFACTS_ID,
    kind: ARTIFACTS_KIND,
    priority: 'builtin',
    title: () => t('artifacts.title'),
    guide: [{
      id: 'session',
      order: 15,
      title: () => t('artifacts.title'),
      description: () => t('artifacts.description'),
      icon: IconDeliverDocRegular,
    }],
  }
}
