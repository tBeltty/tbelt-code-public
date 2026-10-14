// Real Git reaches a controlled proxy failure or stall; the browser
// offers a mirror for a replacement spec, or another way once the install
// already asks the mirror, without retrying the failed address.
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, captureStableAria, compareOrRefreshGolden, webSnapshotMode, watchConsole } from './scaffold.ts'
import { EN_BROWSER_LOCALE } from './support.ts'

it.each(['network', 'timeout'] as const)('offers a mirror after a GitHub %s, then another way on the mirror, and waits for replacement input', async (failure) => {
  const scratch = await mkdtemp(join(tmpdir(), 'dsh-install-github-'))
  onTestFinished(() => rm(scratch, { recursive: true, force: true }))
  const sockets = new Set<Socket>()
  let connections = 0
  const proxy = createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => { sockets.delete(socket) })
    socket.once('data', () => { connections++; if (failure === 'network') socket.destroy() })
  })
  onTestFinished(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve, reject) => { proxy.close((error) => { if (error) reject(error); else resolve() }) })
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  const address = proxy.address()
  if (address === null || typeof address === 'string') throw new Error('proxy did not bind a TCP port')
  const gitConfig = join(scratch, 'git.config')
  await writeFile(gitConfig, `[http "https://github.com/"]\n proxy = http://127.0.0.1:${String(address.port)}\n`)
  const overlay = join(scratch, 'cordis.patch.yml')
  await writeFile(overlay, '- id: ui-plugin-manager\n  config: { registryProbeEnabled: false }\n')
  const scaffold = await launchWebScaffold({
    profile: { packages: [], packageManager: { command: process.execPath, args: [], env: { GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' } } },
    extraOverlayPath: overlay,
  })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const profile = join(scaffold.harnessHome, 'profiles', 'scaffold')
  const manifestPath = join(profile, 'package.json')
  const manifestBefore = await readFile(manifestPath, 'utf8')
  await writeFile(join(profile, 'config'), 'console.log("https://registry.npmjs.org/")\n')
  await writeFile(join(profile, '.attempts'), '')
  await writeFile(join(profile, 'add'), `
    const fs = require('node:fs');
    fs.appendFileSync('.attempts', JSON.stringify(process.argv) + '\\n');
    console.error('pnpm must not start after the GitHub connection check fails');
    process.exitCode = 1;
  `)
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: EN_BROWSER_LOCALE })
  const tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl)
  await page.waitForSelector('[class*="frame"]')
  if (await page.getByRole('dialog', { name: 'Settings' }).count() > 0) await page.keyboard.press('Escape')
  await page.getByRole('navigation', { name: 'Global panels' }).getByRole('button', { name: 'Plugins', exact: true }).click()
  await page.getByRole('button', { name: 'Add plugin', exact: true }).click()
  const spec = 'https://github.com/example/dsh-plugin.git'
  const title = failure === 'timeout' ? 'GitHub connection timed out' : 'Cannot access GitHub'
  let dialog = page.getByRole('dialog', { name: 'Add plugin', exact: true })
  await dialog.getByRole('button', { name: 'Registry Official npm registry', exact: true }).waitFor()
  await dialog.getByRole('textbox', { name: 'Package name or address' }).fill(spec)
  expect(await page.getByText(title, { exact: true }).count()).toBe(0)
  await dialog.getByRole('button', { name: 'Install', exact: true }).click()
  dialog = page.getByRole('dialog', { name: title, exact: true })
  await dialog.waitFor()
  expect(await page.getByRole('dialog').count()).toBe(1)
  expect(await dialog.getByText('Try another installation source.', { exact: true }).count()).toBe(1)
  await compareOrRefreshGolden(
    fileURLToPath(new URL(`./expected/plugin-install-github/${failure === 'timeout' ? 'timeout' : 'failed'}.expected.md`, import.meta.url)),
    await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), webSnapshotMode(),
  )
  const attempts = await readFile(join(profile, '.attempts'), 'utf8')
  expect(attempts).toBe('')
  expect(connections).toBeGreaterThan(0)
  await expect.poll(() => sockets.size).toBe(0)
  const checked = connections
  await dialog.getByRole('button', { name: 'Use mainland China mirror', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Add plugin', exact: true })
  const input = dialog.getByRole('textbox', { name: 'Plugin package name', exact: true })
  await input.waitFor()
  expect(await input.inputValue()).toBe('')
  expect(await input.evaluate(element => element === document.activeElement)).toBe(true)
  expect(await dialog.getByRole('button', { name: 'Install', exact: true }).isDisabled()).toBe(true)
  await dialog.getByRole('button', { name: 'Registry Mainland China mirror', exact: true }).waitFor()
  await compareOrRefreshGolden(
    fileURLToPath(new URL('./expected/plugin-install-github/mirror.expected.md', import.meta.url)),
    await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), webSnapshotMode(),
  )
  expect(await readFile(join(profile, '.attempts'), 'utf8')).toBe(attempts)
  expect(connections).toBe(checked)
  expect(await readFile(manifestPath, 'utf8')).toBe(manifestBefore)
  await input.fill(spec)
  await dialog.getByRole('button', { name: 'Install', exact: true }).click()
  dialog = page.getByRole('dialog', { name: title, exact: true })
  await dialog.waitFor()
  await compareOrRefreshGolden(
    fileURLToPath(new URL(`./expected/plugin-install-github/${failure === 'timeout' ? 'timeout' : 'failed'}-on-mirror.expected.md`, import.meta.url)),
    await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), webSnapshotMode(),
  )
  await dialog.getByRole('button', { name: 'Try another way', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Add plugin', exact: true })
  await dialog.getByRole('button', { name: 'Hide the guide', exact: true }).waitFor()
  expect(await input.inputValue()).toBe('')
  expect(await input.evaluate(element => element === document.activeElement)).toBe(true)
  await compareOrRefreshGolden(
    fileURLToPath(new URL('./expected/plugin-install-github/another-way.expected.md', import.meta.url)),
    await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), webSnapshotMode(),
  )
  await input.fill(spec)
  await dialog.getByRole('button', { name: 'Install', exact: true }).click()
  dialog = page.getByRole('dialog', { name: title, exact: true })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  expect(await readFile(join(profile, '.attempts'), 'utf8')).toBe('')
  expect(connections).toBeGreaterThan(checked)
  expect(tripwire.pageErrors).toEqual([])
})
