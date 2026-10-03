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
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/onboarding-deepseek-config', import.meta.url))
const ONBOARDING_EXPECTED = join(SNAPSHOT_DIR, 'onboarding.expected.md')
const MISSING_EXPECTED = join(SNAPSHOT_DIR, 'missing.expected.md')
const MODELS_EXPECTED = join(SNAPSHOT_DIR, 'models.expected.md')
const DEFAULT_MODELS_EXPECTED = join(SNAPSHOT_DIR, 'default-models.expected.md')
const ONBOARDING_STEP = '选择一个模型提供方开始使用'
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
    // The scenario asserts the shipped Chinese copy, so the browser asks for it.
    page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: ZH_BROWSER_LOCALE })
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
    await onboarding.getByRole('button', { name: '稍后配置' }).click()
    await onboarding.waitFor({ state: 'detached', timeout: 15_000 })
    expect(await page.locator('#root').evaluate(root => (root as HTMLElement).inert)).toBe(false)

    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.waitFor({ timeout: 10_000 })
    await settings.getByRole('button', { name: '模型' }).click()
    const deepSeekRow = settings.getByText('DeepSeek', { exact: true }).first()
    await deepSeekRow.waitFor({ timeout: 10_000 })
    // Unconfigured, the row starts with its own edit form already open — no
    // separate Edit click, unlike a row that already has a stored key.
    const keyInput = settings.getByLabel('API 密钥', { exact: true })
    await keyInput.waitFor({ timeout: 10_000 })
    const initial = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(MISSING_EXPECTED, initial, MODE)

    const secret = `dsh_onboarding_${randomBytes(12).toString('hex')}`
    await keyInput.fill(secret)
    await settings.getByRole('button', { name: '保存', exact: true }).click()
    await keyInput.waitFor({ state: 'detached', timeout: 15_000 })

    const stored = await readFile(join(scaffold.harnessHome, '.credentials.yaml'), 'utf8')
    expect(stored.includes(`DEEPSEEK_API_KEY: ${secret}`)).toBe(true)
    expect((await page.content()).includes(secret)).toBe(false)
    expect((await page.locator('body').ariaSnapshot()).includes(secret)).toBe(false)
    expect(browserConsole.some(line => line.includes(secret))).toBe(false)

    // The ordinary Models surface reuses the refreshed join and exposes the
    // configured write-only placeholder without a reload.
    await deepSeekRow.locator('xpath=ancestor::li').getByRole('button', { name: '编辑' }).click()
    const configuredInput = settings.getByLabel('API 密钥', { exact: true })
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
        if (document.querySelector('[role="dialog"][aria-label="选择一个模型提供方开始使用"]') !== null) {
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
    await openSettings(page, 'zh')
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.waitFor({ timeout: 10_000 })
    await settings.getByRole('button', { name: '模型', exact: true }).click()
    const deepSeek = settings.getByText('DeepSeek', { exact: true }).first()
    await deepSeek.waitFor({ timeout: 10_000 })
    await deepSeek.locator('xpath=ancestor::li').getByRole('button', { name: '编辑' }).click()
    await settings.getByText('自定义设置').click()
    expect(await settings.getByLabel('模型 ID 1').inputValue()).toBe('deepseek-flash')
    expect(await settings.getByLabel('显示名称 1').inputValue()).toBe('DeepSeek-V41-Flash')
    expect(await settings.getByLabel('模型 ID 2').inputValue()).toBe('deepseek-v4-pro')
    expect(await settings.getByRole('button', { name: /删除模型/ }).count()).toBe(2)
    await settings.getByRole('button', { name: '模型选项 1' }).click()
    expect(await settings.getByRole('group', { name: '输入类型 1' }).getByRole('checkbox', { name: '图片' }).isChecked()).toBe(true)
    await assertModelInputLayout(page, settings)
    const defaultModels = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(DEFAULT_MODELS_EXPECTED, defaultModels, MODE)
    await settings.getByLabel('显示名称 1').fill('Configured Flash')
    await settings.getByRole('group', { name: '输入类型 1' }).getByRole('checkbox', { name: '图片' }).uncheck()
    await settings.getByRole('button', { name: '保存', exact: true }).click()
    await settings.getByLabel('模型 ID 1').waitFor({ state: 'detached', timeout: 15_000 })
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
    await deepSeek.locator('xpath=ancestor::li').getByRole('button', { name: '编辑' }).click()
    await settings.getByText('自定义设置').click()
    for (let index = 0; index < 2; index++) {
      await settings.getByRole('button', { name: /删除模型/ }).first().click()
    }
    await settings.getByRole('button', { name: '添加模型', exact: true }).click()
    const customModelId = settings.getByLabel('模型 ID 1')
    await customModelId.fill('private-preview')
    await settings.getByLabel('显示名称 1').fill('Private Preview')
    await settings.getByRole('button', { name: '模型选项 1' }).click()
    await settings.getByLabel('上下文窗口 1').fill('131072')
    await settings.getByLabel('最大输出 token 数 1').fill('64K')
    expect(await settings.getByRole('group', { name: '输入类型 1' }).getByRole('checkbox', { name: '图片' }).isChecked()).toBe(false)
    await settings.getByRole('group', { name: '输入类型 1' }).getByRole('checkbox', { name: '图片' }).check()

    await expect.poll(
      () => settings.getByLabel('API 密钥', { exact: true }).getAttribute('placeholder'),
      { timeout: 10_000 },
    ).toBe('已配置——输入新值可替换')
    const modelEditor = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(MODELS_EXPECTED, modelEditor, MODE)
    await settings.getByRole('button', { name: '保存', exact: true }).click()
    await customModelId.waitFor({ state: 'detached', timeout: 15_000 })

    const document = await readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8')
    expect(document).toContain('id: private-preview')
    expect(document).toContain('name: Private Preview')
    expect(document).toContain('contextWindow: 131072')
    expect(document).toContain('maxTokens: 64000')
    expect(document).not.toContain('id: deepseek-flash')
    await expect(scaffold.ctx.llm.resolveModelInfo('deepseek-official', 'private-preview')).resolves.toMatchObject({
      inputModalities: ['text', 'image'],
    })
    await deepSeek.locator('xpath=ancestor::li').getByRole('button', { name: '编辑' }).click()
    await settings.getByText('自定义设置').click()
    await settings.getByRole('button', { name: '模型选项 1' }).click()
    expect(await settings.getByRole('group', { name: '输入类型 1' }).getByRole('checkbox', { name: '图片' }).isChecked()).toBe(true)
    await settings.getByRole('button', { name: '取消', exact: true }).click()

    await page.keyboard.press('Escape')
    await settings.waitFor({ state: 'detached', timeout: 10_000 })
    // A connected Workspace is what puts a live composer — and its model
    // trigger — on the page; the scaffold boots without one. Deleting the
    // previously selected model just above leaves nothing selected, so the
    // composer's placeholder reads "select a model first" rather than the
    // ordinary hero text connectFreshWorkspaceZh waits for; wait on the model
    // trigger itself instead, which is what this scenario actually needs.
    const workspaceName = 'model-fallback-e2e'
    mkdirSync(join(scaffold.workspaceCwd, workspaceName), { recursive: true })
    await page.getByRole('textbox', { name: '选择工作区' }).click()
    const workspaceDialog = page.getByRole('dialog', { name: '选择工作区目录' })
    await workspaceDialog.waitFor({ timeout: 10_000 })
    await workspaceDialog.getByRole('button', { name: '编辑路径' }).click()
    const pathInput = workspaceDialog.getByRole('textbox', { name: '编辑路径' })
    await pathInput.fill(join(scaffold.workspaceCwd, workspaceName))
    await pathInput.press('Enter')
    await workspaceDialog.getByRole('button', { name: '打开', exact: true }).click()

    const modelTrigger = page.getByRole('button', { name: /^选择模型|unconfigured\/none/ })
    await modelTrigger.waitFor({ timeout: 10_000 })
    await modelTrigger.click()
    await page.getByRole('menuitem', { name: /^模型/ }).click()
    expect(await page.getByText('Configured Flash', { exact: true }).count()).toBe(0)
    await page.getByRole('menuitemradio', { name: 'Private Preview' }).waitFor({ timeout: 10_000 })
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(
      SNAPSHOT_DIR,
      ['onboarding.expected.md', 'missing.expected.md', 'models.expected.md', 'default-models.expected.md'],
    )
  })
})
