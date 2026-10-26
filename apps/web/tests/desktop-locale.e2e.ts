// Native initialization supplies system languages; the existing Host preference remains the only durable choice.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { openSettings, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/desktop-locale', import.meta.url))
const MODE = webSnapshotMode()
const { version } = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }
const versionCapture = { replacements: [[version, '{{version}}']] as const }

describe.skipIf(MODE === 'record')('web e2e: native and Client locale preferences', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const reported: string[] = []
  let languages = ['it-IT', 'es-ES', 'en-US']

  beforeAll(async () => {
    scaffold = await launchWebScaffold()
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'en-US' })
    tripwire = watchConsole(page)
    await page.exposeFunction('nativeLocaleRead', () => {
      const section = scaffold.ctx.settings.describe().find(row => row.ns === 'locale')!.value as { preference?: string }
      return { languages, preference: section.preference ?? null }
    })
    await page.exposeFunction('nativeLocaleChanged', (locale: string) => { reported.push(locale) })
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'dshDesktop', { value: { protocolVersion: 1 } })
      const bridge = globalThis as typeof globalThis & {
        nativeLocaleRead(): Promise<unknown>
        nativeLocaleChanged(locale: string): Promise<void>
        __DSH_LOCALE__: { read(): Promise<unknown>; onChange(locale: string): void }
      }
      bridge.__DSH_LOCALE__ = {
        read: () => bridge.nativeLocaleRead(),
        onChange: (locale) => { void bridge.nativeLocaleChanged(locale) },
      }
    })
  })

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('uses OS languages without saving them, then shares an explicit choice across reloads', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-desktop-locale'))
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
    const esDialog = page.getByRole('dialog', { name: 'Ajustes', exact: true })
    await esDialog.getByRole('button', { name: 'Automático', exact: true }).waitFor()
    await expect.poll(() => reported).toEqual(['es'])
    expect(scaffold.ctx.settings.describe().find(row => row.ns === 'locale')!.value).toEqual({})
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'automatic.expected.md'),
      await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd, versionCapture), MODE)
    languages = ['el-GR', 'es-ES', 'en-US']
    const automaticWarnings = tripwire.warnings.length
    reported.length = 0
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, automaticWarnings)
    await page.getByRole('button', { name: 'Ρυθμίσεις', exact: true }).click()
    const elDialog = page.getByRole('dialog', { name: 'Ρυθμίσεις', exact: true })
    await elDialog.getByRole('button', { name: 'Αυτόματα', exact: true }).waitFor()
    await expect.poll(() => reported).toEqual(['el'])
    expect(scaffold.ctx.settings.describe().find(row => row.ns === 'locale')!.value).toEqual({})
    await elDialog.getByRole('button', { name: 'Αυτόματα', exact: true }).click()
    await page.getByRole('menuitem', { name: 'English', exact: true }).click()
    const enDialog = page.getByRole('dialog', { name: 'Settings', exact: true })
    await enDialog.getByRole('button', { name: 'English', exact: true }).waitFor()
    await expect.poll(() => reported.at(-1)).toBe('en')
    await expect.poll(() => readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8'))
      .toContain('preference: en')
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'selected.expected.md'),
      await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd, versionCapture), MODE)
    const warningsBefore = tripwire.warnings.length
    reported.length = 0
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, warningsBefore)
    await openSettings(page)
    await enDialog.getByRole('button', { name: 'English', exact: true }).waitFor()
    await expect.poll(() => reported).toEqual(['en'])
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
    expect(await page.evaluate(() => localStorage.getItem('dsh.locale'))).toBeNull()
    await enDialog.getByRole('button', { name: 'English', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Ελληνικά', exact: true }).click()
    await elDialog.getByRole('button', { name: 'Ελληνικά', exact: true }).waitFor()
    await expect.poll(() => readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8'))
      .toContain('preference: el')
    const greekReloadWarnings = tripwire.warnings.length
    reported.length = 0
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, greekReloadWarnings)
    await page.getByRole('button', { name: 'Ρυθμίσεις', exact: true }).click()
    await elDialog.getByRole('button', { name: 'Ελληνικά', exact: true }).waitFor()
    await expect.poll(() => reported).toEqual(['el'])
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('el')
    await page.setViewportSize({ width: 390, height: 844 })
    const overflows = (): Promise<number> => elDialog.evaluate((dialog) => {
      // The narrow navigation strip scrolls horizontally by design; inspect the panel and section content.
      const options = dialog.lastElementChild!
      const containers = [dialog, options, ...options.querySelectorAll<HTMLElement>('*')]
        .filter(element => element === dialog || ['auto', 'scroll'].includes(getComputedStyle(element).overflowX))
      return containers.filter(element => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1).length
    })
    await expect.poll(overflows).toBe(0)
    await elDialog.evaluate((dialog) => {
      const options = dialog.lastElementChild!
      const probe = document.createElement('div')
      probe.dataset.localeOverflowProbe = ''
      probe.style.width = '2000px'
      probe.style.height = '1px'
      options.append(probe)
    })
    try {
      expect(await overflows()).toBeGreaterThan(0)
    } finally {
      await elDialog.locator('[data-locale-overflow-probe]').evaluate((element) => { element.remove() })
    }
    await expect.poll(overflows).toBe(0)

    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['automatic.expected.md', 'selected.expected.md'])
  })
})
