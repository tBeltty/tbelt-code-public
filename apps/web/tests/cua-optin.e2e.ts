/** CUA selects each Agent's tool form and changes the default only from its detail page. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { readProfileManifest } from '@deepseek-ai/dsh-app-boot'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-ptc-runtime'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { parseEntryYaml } from '@deepseek-ai/cordis-plugin-include'
import { expect, it, vi } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, EN_BROWSER_LOCALE } from './support.ts'
import { brandString } from '@deepseek-ai/dsh-brand'

// This fixture exercises the macOS provider’s permission setup.
it.skipIf(process.platform !== 'darwin').each([
  { selectedDefault: undefined, codingTools: false, script: false },
  { selectedDefault: undefined, codingTools: true, script: false },
  { selectedDefault: 'minimal', codingTools: true, script: false },
  { selectedDefault: undefined, codingTools: true, script: true },
] as const)('preserves Coding Tools=$codingTools and default=$selectedDefault and Script=$script across CUA toggles', async ({ selectedDefault, codingTools, script }) => {
  const directory = await mkdtemp(join(tmpdir(), 'cua-optin-web-'))
  let ownedScaffold: WebScaffold | undefined
  let browser: Browser | undefined
  try {
    const patch = join(directory, 'native-fixture.yml')
    // Permission inspection fails against this non-helper executable; activation still permits dismissing setup.
    await writeFile(patch, JSON.stringify([{ id: 'cua-macos', config: { helperPath: process.execPath } }]))
    const defaults = join(directory, 'script-defaults')
    if (script) {
      await mkdir(defaults)
      await writeFile(join(defaults, 'package.json'), JSON.stringify({ name: 'cua-script-defaults', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
      await writeFile(join(defaults, 'cordis.patch.yml'), '- id: ptc-runtime\n  config:\n    executionMode: vm-script\n    scriptPersistence: false\n')
    }
    const harnessHome = join(directory, 'home')
    const scaffold = ownedScaffold = await launchWebScaffold({
      profile: { packages: script ? [{ dir: defaults, enabled: true }] : [] },
      harnessHome, extraOverlayPath: [
        fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)), patch,
      ] })
    const initialDefault = selectedDefault ?? 'standard'
    if (selectedDefault !== undefined) await scaffold.ctx.settings.update('agent-preset-registry', { selectedDefault })
    await scaffold.ctx.settings.update('ui-settings', { enabled: codingTools })
    const settingsPath = join(harnessHome, 'profiles/scaffold/cordis.patch.yml')
    const beforeEnable = await readFile(settingsPath, 'utf8')
    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: EN_BROWSER_LOCALE })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    await page.getByRole('navigation', { name: 'Global panels' }).getByRole('button', { name: 'Plugins', exact: true }).click()
    const plugins = page.locator('[data-plugin-panel]')
    await plugins.getByRole('button', { name: 'More', exact: true }).waitFor()
    expect(await page.locator('[data-plugin-package="@deepseek-ai/dsh-cua-bundle"]').count()).toBe(0)
    await plugins.getByRole('button', { name: 'More', exact: true }).click()
    // The installation ships the bundle off; the Experimental plugins list offers it without an installation step.
    const card = page.locator('[data-plugin-package="@deepseek-ai/dsh-cua-bundle"]')
    await plugins.locator('[data-plugin-group="more"] [data-plugin-package="@deepseek-ai/dsh-cua-bundle"]').waitFor()
    const listed = (await scaffold.ctx.pluginManager.listBundles()).find(bundle => bundle.name === '@deepseek-ai/dsh-cua-bundle')
    expect(listed).toMatchObject({ availability: 'installation', optional: true, enabled: false, installed: false })
    expect(listed).not.toHaveProperty('listedByDefault')
    let toggle = card.getByRole('switch', { name: 'Enable Computer use', exact: true })
    const originalAgent = scaffold.ctx.agents.list()[0]!
    const ptcAgent = (await scaffold.ctx.agents.create({
      sessionId: brandString<SessionId>('cua-existing-ptc'),
      setup: async (ctx) => { await scaffold.ctx.agentPresets.mount(ctx, 'ptc') },
    })).agent
    expect(scaffold.ctx.tools.schemas(ptcAgent).some(tool => tool.name === 'cua')).toBe(false)
    const runtimeFiber = () => [...scaffold.ctx.loader.entries()].find(entry => entry.options.id === 'ptc-runtime')?.fiber
    const originalRuntimeFiber = runtimeFiber()
    expect(originalRuntimeFiber).toBeDefined()
    const originalRuntime = scaffold.ctx.ptcRuntime
    expect(scaffold.ctx.agentPresets.defaultId).toBe(initialDefault)
    expect(originalRuntime.programFormat).toBe(script ? 'script' : 'function-body')
    expect(scaffold.ctx.get('computerUse')).toBeUndefined()
    const profileManifest = () => readProfileManifest('scaffold', join(scaffold.harnessHome, 'profiles/scaffold'))
    const selected = () => profileManifest().dsh?.profile?.bundles
    const dependencies = profileManifest().dependencies
    expect(selected()).not.toContain('@deepseek-ai/dsh-cua-bundle')

    const enabling = Promise.withResolvers<undefined>()
    const setEnabled = scaffold.ctx.pluginManager.setBundleEnabled.bind(scaffold.ctx.pluginManager)
    let applying: ReturnType<typeof setEnabled> | undefined
    // Hold the Host request so the pending UI does not depend on machine speed; release into the real operation.
    const enableCall = vi.spyOn(scaffold.ctx.pluginManager, 'setBundleEnabled').mockImplementationOnce((name, enabled) => {
      applying = enabling.promise.then(() => setEnabled(name, enabled))
      return applying
    })
    try {
      await toggle.click()
      await card.getByRole('status').getByText('Applying changes to Computer use', { exact: true }).waitFor()
      await compareOrRefreshGolden(fileURLToPath(new URL('./expected/cua-permissions/enabling.expected.md', import.meta.url)),
        await captureStableAria(page, '[data-plugin-package="@deepseek-ai/dsh-cua-bundle"] [role="status"]', scaffold.workspaceCwd), webSnapshotMode())
    } finally {
      enabling.resolve(undefined)
      enableCall.mockRestore()
      await applying
    }
    // Bundle transitions await native cleanup under the browser action deadline.
    await toggle.and(page.locator('[aria-checked="true"]')).waitFor({ state: 'visible' })
    await card.getByRole('status').getByText('Applying changes to Computer use', { exact: true }).waitFor({ state: 'hidden' })
    const setup = page.getByRole('dialog', { name: 'Set up computer use before use', exact: true })
    await setup.waitFor()
    expect(await setup.getByText('Computer use is enabled, but system permissions could not be checked. Open the plugin details to see the error and retry.', { exact: true }).count()).toBe(1)
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/cua-permissions/setup.expected.md', import.meta.url)),
      await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), webSnapshotMode())
    expect(await setup.getByRole('button', { name: 'Set to PTC', exact: true }).count()).toBe(0)
    expect(scaffold.ctx.agentPresets.defaultId).toBe(initialDefault)
    expect(selected()).toContain('@deepseek-ai/dsh-cua-bundle')
    expect(profileManifest().dependencies).toEqual(dependencies)
    expect(await card.getByText('Experimental', { exact: true }).count()).toBe(1)
    expect(await card.textContent()).not.toContain('Make PTC mode persistent')
    expect(await card.textContent()).not.toContain('Switch to PTC mode')
    expect(await card.textContent()).toContain('Allow the agent to directly control applications on your computer.')
    expect(await card.textContent()).not.toContain('helper')
    expect(await card.textContent()).not.toContain('Swift')
    const description = await card.getByRole('button', { name: 'View Computer use', exact: true }).evaluate((button) => {
      const element = document.getElementById(button.getAttribute('aria-describedby')!)!
      const style = getComputedStyle(element)
      return { lines: style.webkitLineClamp, height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(style.lineHeight) }
    })
    expect(description.lines).toBe('1')
    expect(description.height).toBeLessThanOrEqual(description.lineHeight + 1)
    expect(scaffold.ctx.get('computerUse')).toBeDefined()
    expect(scaffold.ctx.agents.get(originalAgent.id) === originalAgent).toBe(true)
    expect(scaffold.ctx.agents.get(ptcAgent.id) === ptcAgent).toBe(true)
    expect(scaffold.ctx.agentPresets.composedPreset(originalAgent.ctx)).toBe(initialDefault)
    expect(scaffold.ctx.tools.schemas(originalAgent).some(tool => tool.name === 'cua')).toBe(false)
    expect(scaffold.ctx.tools.schemas(originalAgent).some(tool => tool.name === 'cua_run_code')).toBe(true)
    expect(scaffold.ctx.tools.schemas(ptcAgent).some(tool => tool.name === 'cua_run_code')).toBe(false)
    expect(scaffold.ctx.tools.schemas(ptcAgent).some(tool => tool.name === 'cua')).toBe(true)
    expect((await scaffold.ctx.systemPrompt.assemble({ scope: ptcAgent })).tools.map(tool => tool.name)).toEqual(['run_code'])
    for (const preset of ['ptc', 'standard', 'ptc', initialDefault]) {
      await scaffold.ctx.agentPresets.select(originalAgent, preset)
      expect(scaffold.ctx.tools.schemas(originalAgent).some(tool => tool.name === 'cua')).toBe(preset === 'ptc')
      expect(scaffold.ctx.tools.schemas(originalAgent).some(tool => tool.name === 'cua_run_code')).toBe(preset !== 'ptc')
    }
    const child = await scaffold.ctx.agents.create({
      sessionId: brandString<SessionId>('cua-child'),
      setup: (ctx) => { scaffold.ctx.agentPresets.composeFrom(ctx, ptcAgent.ctx) },
    })
    expect(scaffold.ctx.tools.schemas(child.agent).some(tool => tool.name === 'cua')).toBe(true)
    await child.dispose()
    expect(scaffold.ctx.tools.schemas(child.agent).some(tool => tool.name === 'cua')).toBe(false)
    expect(scaffold.ctx.agentPresets.defaultId).toBe(initialDefault)
    expect(runtimeFiber() === originalRuntimeFiber).toBe(true)
    expect(scaffold.ctx.ptcRuntime.programFormat).toBe(script ? 'script' : 'function-body')
    await setup.waitFor()
    expect(await setup.getByText('Computer use is enabled, but system permissions could not be checked. Open the plugin details to see the error and retry.', { exact: true }).count()).toBe(1)
    await setup.getByRole('button', { name: 'Later', exact: true }).click()
    await setup.waitFor({ state: 'hidden' })
    let saved = await readFile(settingsPath, 'utf8')
    expect(saved).toBe(beforeEnable)
    expect(scaffold.ctx.settings.describe().find(row => row.ns === 'ui-settings')?.value).toMatchObject({ enabled: codingTools })
    expect(saved).not.toContain('executionMode:')
    if (selectedDefault === undefined) {
      expect(parseEntryYaml(saved)).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'agent-preset-registry' })]))
    } else {
      expect(parseEntryYaml(saved)).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'agent-preset-registry', config: { default: 'standard', selectedDefault } }),
      ]))
    }
    const freshDefault = (await scaffold.ctx.agents.create({
      sessionId: brandString<SessionId>('cua-new-default'),
      setup: async (ctx) => { await scaffold.ctx.agentPresets.mount(ctx) },
    })).agent
    expect(scaffold.ctx.agentPresets.composedPreset(freshDefault.ctx)).toBe(initialDefault)
    expect(scaffold.ctx.tools.schemas(freshDefault).some(tool => tool.name === 'cua')).toBe(false)
    expect(scaffold.ctx.tools.schemas(freshDefault).some(tool => tool.name === 'cua_run_code')).toBe(true)
    const fresh = (await scaffold.ctx.agents.create({
      sessionId: brandString<SessionId>('cua-new-ptc'),
      setup: async (ctx) => { await scaffold.ctx.agentPresets.mount(ctx, 'ptc') },
    })).agent
    expect(scaffold.ctx.agentPresets.composedPreset(fresh.ctx)).toBe('ptc')
    expect(scaffold.ctx.tools.schemas(fresh).some(tool => tool.name === 'cua')).toBe(true)
    await card.getByRole('button', { name: 'View Computer use', exact: true }).click()
    const detail = plugins.locator('[data-detail-document]')
    await detail.getByRole('img', { name: 'A request to add meeting notes and the resulting text in Notes' }).waitFor()
    const guidance = plugins.locator('[data-cua-guidance]')
    await guidance.getByText(/Use caution in production environments/).waitFor()
    expect(await guidance.textContent()).not.toContain('helperPath')
    expect(await detail.textContent()).not.toContain('PTC')
    toggle = page.locator('[data-plugin-panel]').getByRole('switch', { name: 'Enable Computer use', exact: true })
    const persistent = page.getByRole('group', { name: 'PTC execution mode', exact: true })
    if (!codingTools) {
      const panel = page.locator('[data-cua-settings]')
      await expect.poll(() => panel.getAttribute('aria-busy')).toBe('false')
      expect(await panel.textContent()).toContain('Computer use is available in Standard, Creator, and PTC modes')
      expect(await persistent.textContent()).toContain('Other modes always keep their computer use state separately')
      for (const width of [1680, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        for (const colorScheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme })
          await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(colorScheme === 'dark')
          await expect.poll(() => panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
          if (webSnapshotMode() === 'refresh') {
            const directory = fileURLToPath(new URL('../../../.playwright-mcp/cua-run-code-ui', import.meta.url))
            await mkdir(directory, { recursive: true })
            await panel.screenshot({ path: join(directory, `details-en-${width}-${colorScheme}.png`), animations: 'disabled' })
          }
        }
      }
      await page.emulateMedia({ colorScheme: null })
      await page.setViewportSize({ width: 1680, height: 1000 })
    }
    const beforePersistent = scaffold.ctx.ptcRuntime
    await persistent.getByRole('button', { name: 'Use persistent mode', exact: true }).click()
    await persistent.getByRole('button', { name: 'Persistent mode enabled', exact: true }).waitFor()
    expect(scaffold.ctx.ptcRuntime.programFormat).toBe(script ? 'script' : 'scoped-repl')
    expect(scaffold.ctx.ptcRuntime.retainsState).toBe(true)
    expect(scaffold.ctx.ptcRuntime === beforePersistent).toBe(false)
    saved = await readFile(settingsPath, 'utf8')
    expect(saved).toContain(`executionMode: ${script ? 'vm-script' : 'persistent-in-memory'}`)
    expect(saved).toContain(`scriptPersistence: ${script}`)
    expect(saved).toContain(`replScoped: ${!script}`)
    const runtime = scaffold.ctx.ptcRuntime
    const persistentRuntimeFiber = runtimeFiber()
    const owner = {}
    const program = 'globalThis.counter = (globalThis.counter ?? 0) + 1'
    expect((await runtime.run(runtime.resolve({ program, bindings: [], stateOwner: owner }))).value).toBe(1)
    await toggle.click()
    await toggle.and(page.locator('[aria-checked="false"]')).waitFor({ state: 'visible' })
    expect(scaffold.ctx.get('computerUse')).toBeUndefined()
    expect(runtimeFiber() === persistentRuntimeFiber).toBe(true)
    expect(scaffold.ctx.agentPresets.defaultId).toBe(initialDefault)
    expect(scaffold.ctx.agents.get(ptcAgent.id) === ptcAgent).toBe(true)
    for (const agent of [originalAgent, freshDefault, ptcAgent, fresh]) {
      expect(scaffold.ctx.tools.schemas(agent).some(tool => tool.name === 'cua_run_code')).toBe(false)
    }
    for (const agent of [ptcAgent, fresh]) {
      expect(scaffold.ctx.tools.schemas(agent).some(tool => tool.name === 'cua')).toBe(false)
      expect((await scaffold.ctx.systemPrompt.assemble({ scope: agent })).tools.map(tool => tool.name)).toEqual(['run_code'])
    }
    expect((await runtime.run(runtime.resolve({ program, bindings: [], stateOwner: owner }))).value).toBe(2)
    expect(await readFile(settingsPath, 'utf8')).toBe(saved)
    await toggle.click()
    await toggle.and(page.locator('[aria-checked="true"]')).waitFor({ state: 'visible' })
    await setup.waitFor()
    expect(await setup.getByText('Computer use is enabled, but system permissions could not be checked. Open the plugin details to see the error and retry.', { exact: true }).count()).toBe(1)
    expect(scaffold.ctx.agentPresets.defaultId).toBe(initialDefault)
    await setup.getByRole('button', { name: 'Open settings', exact: true }).click()
    await setup.waitFor({ state: 'hidden' })
    await page.getByRole('region', { name: 'Authorize computer use', exact: true }).getByRole('alert').waitFor()
    if (!codingTools) {
      expect(await readFile(settingsPath, 'utf8')).toBe(saved)
      expect(scaffold.ctx.settings.describe().find(row => row.ns === 'ui-settings')?.value).toMatchObject({ enabled: false })
      expect(scaffold.ctx.agentPresets.defaultId).toBe(initialDefault)
      expect((await runtime.run(runtime.resolve({ program, bindings: [], stateOwner: owner }))).value).toBe(3)
      await runtime.release(owner)
      return
    }
    const defaultSetting = page.getByRole('group', { name: 'Default mode for new sessions', exact: true })
    await expect.poll(() => defaultSetting.getByRole('button', { name: 'Set to PTC', exact: true }).isEnabled()).toBe(true)
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/cua-permissions/default-mode.expected.md', import.meta.url)),
      await captureStableAria(page, '[role="group"][aria-label="Default mode for new sessions"]', scaffold.workspaceCwd), webSnapshotMode())
    await defaultSetting.getByRole('button', { name: 'Set to PTC', exact: true }).click()
    await expect.poll(() => scaffold.ctx.agentPresets.defaultId).toBe('ptc')
    expect(scaffold.ctx.agentPresets.composedPreset(originalAgent.ctx)).toBe(initialDefault)
    expect(scaffold.ctx.agentPresets.composedPreset(freshDefault.ctx)).toBe(initialDefault)
    const confirmed = (await scaffold.ctx.agents.create({
      sessionId: brandString<SessionId>('cua-confirmed-default'),
      setup: async (ctx) => { await scaffold.ctx.agentPresets.mount(ctx) },
    })).agent
    expect(scaffold.ctx.agentPresets.composedPreset(confirmed.ctx)).toBe('ptc')
    expect(scaffold.ctx.tools.schemas(confirmed).some(tool => tool.name === 'cua')).toBe(true)
    expect(runtimeFiber() === persistentRuntimeFiber).toBe(true)
    expect(scaffold.ctx.tools.schemas(ptcAgent).some(tool => tool.name === 'cua')).toBe(true)
    expect((await runtime.run(runtime.resolve({ program, bindings: [], stateOwner: owner }))).value).toBe(3)
    const confirmedSettings = await readFile(settingsPath, 'utf8')
    expect(parseEntryYaml(confirmedSettings)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'agent-preset-registry', config: { default: 'standard', selectedDefault: 'ptc' } }),
    ]))
    await toggle.click()
    await toggle.and(page.locator('[aria-checked="false"]')).waitFor({ state: 'visible' })
    await toggle.click()
    await toggle.and(page.locator('[aria-checked="true"]')).waitFor({ state: 'visible' })
    await setup.waitFor()
    expect(await setup.getByText('Computer use is enabled, but system permissions could not be checked. Open the plugin details to see the error and retry.', { exact: true }).count()).toBe(1)
    expect(await setup.getByRole('button', { name: 'Set to PTC', exact: true }).count()).toBe(0)
    expect(await readFile(settingsPath, 'utf8')).toBe(confirmedSettings)
    expect(scaffold.ctx.settings.describe().find(row => row.ns === 'ui-settings')?.value).toMatchObject({ enabled: codingTools })
    await runtime.release(owner)
  } finally {
    try { await browser?.close() } finally {
      try { await ownedScaffold?.close() } finally { await rm(directory, { recursive: true, force: true }) }
    }
  }
})
