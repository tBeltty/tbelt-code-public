// Keyless browser e2e: the shipped DeepSeek adapter stays mounted while its
// credential is absent, the first-run provider step is model-agnostic (it
// never names DeepSeek), and configuring DeepSeek's key through the ordinary
// Models surface lands in an isolated harness home without a reload or model call.
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { assertModelInputLayout } from './model-input-layout.ts'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { openSettings, EN_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/onboarding-deepseek-config', import.meta.url))
const ONBOARDING_EXPECTED = join(SNAPSHOT_DIR, 'onboarding.expected.md')
const MISSING_EXPECTED = join(SNAPSHOT_DIR, 'missing.expected.md')
const MODELS_EXPECTED = join(SNAPSHOT_DIR, 'models.expected.md')
const DEFAULT_MODELS_EXPECTED = join(SNAPSHOT_DIR, 'default-models.expected.md')
const ONBOARDING_STEP = 'Choose a model provider to get started'
const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record')('web e2e: first-run DeepSeek credential setup', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const browserConsole: string[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ deepSeekMissingCredential: true })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: EN_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    page.on('console', message => browserConsole.push(message.text()))
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('stores a key write-only and observes configured state without restarting', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-onboarding-deepseek-config'))
    const onboarding = page.getByRole('dialog', { name: ONBOARDING_STEP })
    await onboarding.waitFor({ timeout: 15_000 })
    expect(await page.locator('#root').evaluate(root => (root as HTMLElement).inert)).toBe(true)
    const onboardingAria = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(ONBOARDING_EXPECTED, onboardingAria, MODE)

    // The step never names DeepSeek specifically — it offers local-server
    // templates and a custom-provider form, none of which is the shipped
    // DeepSeek row. Deferring it is how a user reaches that row's own edit
    // form on the ordinary Models surface.
    await onboarding.getByRole('button', { name: 'Configure later' }).click()
    await onboarding.waitFor({ state: 'detached', timeout: 15_000 })
    expect(await page.locator('#root').evaluate(root => (root as HTMLElement).inert)).toBe(false)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.waitFor({ timeout: 10_000 })
    await settings.getByRole('button', { name: 'Models' }).click()
    const deepSeekRow = settings.getByText('DeepSeek', { exact: true }).first()
    await deepSeekRow.waitFor({ timeout: 10_000 })
    // Unconfigured, the row starts with its own edit form already open — no
    // separate Edit click, unlike a row that already has a stored key.
    const keyInput = settings.getByLabel('API key', { exact: true })
    await keyInput.waitFor({ timeout: 10_000 })
    const initial = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(MISSING_EXPECTED, initial, MODE)

    const secret = `dsh_onboarding_${randomBytes(12).toString('hex')}`
    await keyInput.fill(secret)
    await settings.getByRole('button', { name: 'Save', exact: true }).click()
    await keyInput.waitFor({ state: 'detached', timeout: 15_000 })

    const stored = await readFile(join(scaffold.harnessHome, '.credentials.yaml'), 'utf8')
    expect(stored.includes(`DEEPSEEK_API_KEY: ${secret}`)).toBe(true)
    expect((await page.content()).includes(secret)).toBe(false)
    expect((await page.locator('body').ariaSnapshot()).includes(secret)).toBe(false)
    expect(browserConsole.some(line => line.includes(secret))).toBe(false)

    // The ordinary Models surface reuses the refreshed join and exposes the
    // configured write-only placeholder without a reload.
    await deepSeekRow.locator('xpath=ancestor::li').getByRole('button', { name: 'Edit' }).click()
    const configuredInput = settings.getByLabel('API key', { exact: true })
    await configuredInput.waitFor({ timeout: 10_000 })
    await expect.poll(
      () => configuredInput.getAttribute('placeholder'),
      { timeout: 10_000 },
    ).toBe('已配置——输入新值可替换')

    const reloadWarnings = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, reloadWarnings)
    await page.waitForSelector('[class*="frame"]', { timeout: 15_000 })
    // A usable provider now exists, so the first-run step does not return.
    expect(await page.getByRole('dialog', { name: ONBOARDING_STEP }).count()).toBe(0)

    expect((await page.content()).includes(secret)).toBe(false)
    expect((await page.locator('body').ariaSnapshot()).includes(secret)).toBe(false)
    expect(browserConsole.some(line => line.includes(secret))).toBe(false)
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('never paints the takeover chrome on a configured reload, even with the settings join held open', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-onboarding-configured-reload'))
    // Regression pin for the reload flash: both steps are satisfied, yet each
    // must load private facts before deciding not to show. Dialog chrome lives
    // inside each visible branch, so the deciding window paints and blocks
    // nothing. Holding settings/describe widens that window from loopback
    // RTT scale to a deterministic hundreds of milliseconds, removing all
    // timing dependence from the sampler assertions below.
    //
    // The sampler init script persists across this shared page's later
    // navigations (init scripts re-run per navigation); that stays harmless
    // because no later scenario in this file legitimately shows the
    // takeover, and only this test reads __takeoverSightings.
    await page.addInitScript(() => {
      const sightings: string[] = []
      ;(window as unknown as { __takeoverSightings: string[] }).__takeoverSightings = sightings
      setInterval(() => {
        if (document.querySelector('[role="dialog"][aria-label="Choose a model provider to get started"]') !== null) {
          sightings.push('chrome')
        }
        if (document.getElementById('root')?.inert === true) sightings.push('inert')
      }, 8)
    })
    // EVERY settings/describe issued before the release is held — not just
    // the first — so the pin cannot silently collapse back to loopback
    // timing if a second boot-time consumer of the join ever appears.
    let released = false
    const heldRoutes: Array<() => void> = []
    const releaseDescribe = (): void => {
      released = true
      for (const resolve of heldRoutes.splice(0)) resolve()
    }
    await page.route('**/api/settings/describe', async (route) => {
      if (!released) await new Promise<void>((resolve) => { heldRoutes.push(resolve) })
      await route.continue()
    })
    const warningsBefore = tripwire.warnings.length
    await page.reload({ waitUntil: 'commit' })
    await page.waitForSelector('[class*="frame"]', { timeout: 15_000 })
    // The app is painted and interactive while the steps are still deciding.
    await page.waitForTimeout(600)
    releaseDescribe()
    await page.waitForTimeout(400)
    await page.unroute('**/api/settings/describe')
    acknowledgeReloadConnectionLoss(tripwire, warningsBefore)
    expect(await page.evaluate(() =>
      (window as unknown as { __takeoverSightings: string[] }).__takeoverSightings)).toEqual([])
    expect(await page.getByRole('dialog', { name: ONBOARDING_STEP }).count()).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('configures arbitrary DeepSeek models and prompts after the selected model is removed', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-onboarding-deepseek-models'))
    // Opened here rather than inherited: the credential test reloads the page
    // after configuring the key, so nothing carries an open dialog across.
    await openSettings(page)
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.waitFor({ timeout: 10_000 })
    await settings.getByRole('button', { name: 'Models', exact: true }).click()
    const deepSeek = settings.getByText('DeepSeek', { exact: true }).first()
    await deepSeek.waitFor({ timeout: 10_000 })
    await deepSeek.locator('xpath=ancestor::li').getByRole('button', { name: 'Edit' }).click()
    await settings.getByText('Customized settings').click()
    expect(await settings.getByLabel('Model ID 1').inputValue()).toBe('deepseek-flash')
    expect(await settings.getByLabel('Display name 1').inputValue()).toBe('DeepSeek-V4.1-Flash')
    expect(await settings.getByLabel('Model ID 2').inputValue()).toBe('deepseek-v4-pro')
    expect(await settings.getByRole('button', { name: /Delete model/ }).count()).toBe(2)
    await settings.getByRole('button', { name: 'Model options 1' }).click()
    expect(await settings.getByRole('group', { name: 'Input types 1' }).getByRole('checkbox', { name: 'Image' }).isChecked()).toBe(true)
    await assertModelInputLayout(page, settings)
    const defaultModels = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(DEFAULT_MODELS_EXPECTED, defaultModels, MODE)
    await settings.getByLabel('Display name 1').fill('Configured Flash')
    await settings.getByRole('group', { name: 'Input types 1' }).getByRole('checkbox', { name: 'Image' }).uncheck()
    await settings.getByRole('button', { name: 'Save', exact: true }).click()
    await settings.getByLabel('Model ID 1').waitFor({ state: 'detached', timeout: 15_000 })
    // The save notice settles the directory refresh before Edit clears it for the next draft.
    await settings.getByText('Saved DeepSeek (deepseek-official).', { exact: true }).waitFor({ timeout: 15_000 })
    const savedDefaults = await readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8')
    expect(savedDefaults).toContain('id: deepseek-flash')
    expect(savedDefaults).toContain('inputModalities:')
    expect(savedDefaults).toContain('- text')
    expect(savedDefaults).toContain('systemPromptUpdate: in-history')
    await expect(scaffold.ctx.llm.resolveModelInfo('deepseek-official', 'deepseek-flash')).resolves.toMatchObject({
      name: 'Configured Flash', inputModalities: ['text'], systemPromptUpdate: 'in-history',
    })
    await expect(scaffold.ctx.llm.resolveModelInfo('deepseek-official', 'deepseek-v4-pro')).resolves.toMatchObject({
      name: 'DeepSeek-V4-Pro', inputModalities: ['text'],
    })
    await deepSeek.locator('xpath=ancestor::li').getByRole('button', { name: 'Edit' }).click()
    await settings.getByText('Customized settings').click()
    for (let index = 0; index < 2; index++) {
      await settings.getByRole('button', { name: /Delete model/ }).first().click()
    }
    await settings.getByRole('button', { name: 'Add model', exact: true }).click()
    const customModelId = settings.getByLabel('Model ID 1')
    await customModelId.fill('private-preview')
    await settings.getByLabel('Display name 1').fill('Private Preview')
    await settings.getByRole('button', { name: 'Model options 1' }).click()
    await settings.getByLabel('Context window 1').fill('131072')
    await settings.getByLabel('Max output tokens 1').fill('64K')
    expect(await settings.getByRole('group', { name: 'Input types 1' }).getByRole('checkbox', { name: 'Image' }).isChecked()).toBe(false)
    await settings.getByRole('group', { name: 'Input types 1' }).getByRole('checkbox', { name: 'Image' }).check()

    await expect.poll(
      () => settings.getByLabel('API key', { exact: true }).getAttribute('placeholder'),
      { timeout: 10_000 },
    ).toBe('已配置——输入新值可替换')
    const modelEditor = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(MODELS_EXPECTED, modelEditor, MODE)
    await settings.getByRole('button', { name: 'Save', exact: true }).click()
    await customModelId.waitFor({ state: 'detached', timeout: 15_000 })
    await settings.getByText('Saved DeepSeek (deepseek-official).', { exact: true }).waitFor({ timeout: 15_000 })

    const document = await readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8')
    expect(document).toContain('id: private-preview')
    expect(document).toContain('name: Private Preview')
    expect(document).toContain('contextWindow: 131072')
    expect(document).toContain('maxTokens: 64000')
    expect(document).not.toContain('id: deepseek-flash')
    await expect(scaffold.ctx.llm.resolveModelInfo('deepseek-official', 'private-preview')).resolves.toMatchObject({
      inputModalities: ['text', 'image'],
    })
    await deepSeek.locator('xpath=ancestor::li').getByRole('button', { name: 'Edit' }).click()
    await settings.getByText('Customized settings').click()
    await settings.getByRole('button', { name: 'Model options 1' }).click()
    expect(await settings.getByRole('group', { name: 'Input types 1' }).getByRole('checkbox', { name: 'Image' }).isChecked()).toBe(true)
    await settings.getByRole('button', { name: 'Cancel', exact: true }).click()

    await page.keyboard.press('Escape')
    await settings.waitFor({ state: 'detached', timeout: 10_000 })
    // A connected Workspace is what puts a live composer — and its model
    // trigger — on the page; the scaffold boots without one. Deleting the
    // previously selected model just above leaves nothing selected, so the
    // composer's placeholder reads "select a model first" rather than the
    // ordinary hero text connectFreshWorkspace waits for; wait on the model
    // trigger itself instead, which is what this scenario actually needs.
    const workspaceName = 'model-fallback-e2e'
    mkdirSync(join(scaffold.workspaceCwd, workspaceName), { recursive: true })
    await page.getByRole('textbox', { name: 'Choose workspace' }).click()
    const workspaceDialog = page.getByRole('dialog', { name: 'Select Workspace Directory' })
    await workspaceDialog.waitFor({ timeout: 10_000 })
    await workspaceDialog.getByRole('button', { name: 'Edit path' }).click()
    const pathInput = workspaceDialog.getByRole('textbox', { name: 'Edit path' })
    await pathInput.fill(join(scaffold.workspaceCwd, workspaceName))
    await pathInput.press('Enter')
    await workspaceDialog.getByRole('button', { name: 'Open', exact: true }).click()

    const modelTrigger = page.getByRole('button', { name: /^(请)?选择模型|unconfigured\/none/ })
    await modelTrigger.waitFor({ timeout: 10_000 })
    await modelTrigger.click()
    expect(await page.getByText('Configured Flash', { exact: true }).count()).toBe(0)
    await page.getByRole('menuitemradio', { name: 'Private Preview' }).waitFor({ timeout: 10_000 })
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('shows an empty model list after removing the API key without replacing the saved default', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-model-catalog-empty'))
    await page.keyboard.press('Escape')
    const selection = scaffold.ctx.agentDefaultModel.currentSelection()
    await scaffold.ctx.credentials.unset(credentialRef('DEEPSEEK_API_KEY'))
    const seat = page.getByRole('button', { name: 'Select model', exact: true })
    await seat.waitFor()
    await seat.click()
    const picker = page.getByRole('group', { name: 'Model and reasoning effort' })
    await picker.getByText('No models available.', { exact: true }).waitFor()
    expect(await picker.getByRole('menuitemradio').count()).toBe(0)
    expect(scaffold.ctx.agentDefaultModel.currentSelection()).toEqual(selection)
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'empty.expected.md'), await picker.ariaSnapshot(), MODE)
    await seat.press('Escape')
    await picker.waitFor({ state: 'hidden' })
    expect(tripwire.pageErrors).toEqual([])
  })

  it('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(
      SNAPSHOT_DIR,
      ['onboarding.expected.md', 'missing.expected.md', 'models.expected.md', 'default-models.expected.md', 'empty.expected.md'],
    )
  })
})
