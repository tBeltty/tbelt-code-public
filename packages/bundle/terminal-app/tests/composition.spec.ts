/**
 * The composed `terminal` profile: the entry list the Loader mounts after the
 * base, web and terminal layers apply in order.
 */
import { fileURLToPath } from 'node:url'
import { composeEntries, loadOverlayPatches, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-app-boot'
import { describe, expect, it } from 'vitest'

const layer = (bundle: string) => loadOverlayPatches('terminal-test', fileURLToPath(new URL(`../../${bundle}/cordis.patch.yml`, import.meta.url)))
const entries = composeEntries([layer('base'), layer('web-app'), layer('terminal-app')])
const byId = (id: string) => entries.find(entry => entry.id === id)

describe('terminal profile', () => {
  it('layers the terminal bundle over the web bundle, which keeps the Host half of the Remote API', () => {
    expect(PROFILE_TEMPLATES['terminal']!.bundles).toEqual([
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-terminal-app',
    ])
    for (const id of ['connection', 'typert-gateway', 'session-controller']) {
      expect(byId(id), id).toBeDefined()
      expect(byId(id)!.disabled, id).not.toBe(true)
    }
  })

  it('mounts the terminal client with its command line and no web server', () => {
    expect(byId('terminal-startup')).toMatchObject({ name: '@deepseek-ai/dsh-terminal-app' })
    expect(byId('terminal-client')).toMatchObject({ name: '@deepseek-ai/dsh-terminal-client', inject: ['terminalStartup'] })
    expect(byId('terminal-client')!.disabled).not.toBe(true)
    for (const id of ['web-startup', 'webserver', 'web-runtime', 'modules', 'client-hmr', 'directory-picker']) {
      expect(byId(id)?.disabled, id).toBe(true)
    }
  })

  it('mounts no browser view', () => {
    const views = entries.filter(entry => entry.id?.startsWith('ui-'))
    expect(views.length).toBeGreaterThan(0)
    expect(views.filter(entry => entry.disabled !== true).map(entry => entry.id)).toEqual([])
  })

  it('mounts no analytics or telemetry plugin', () => {
    const telemetry = entries.filter(entry => /analytics|telemetry/iu.test(`${entry.id ?? ''} ${String(entry.name)}`))
    expect(telemetry.map(entry => entry.id)).toEqual(expect.arrayContaining(['desktop-product-telemetry', 'product-analytics', 'session-telemetry-otel']))
    expect(telemetry.filter(entry => entry.disabled !== true).map(entry => entry.id)).toEqual([])
  })
})
