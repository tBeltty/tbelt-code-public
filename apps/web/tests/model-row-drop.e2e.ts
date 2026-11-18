/** Native model reordering accepts the midpoint between adjacent rows. */
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'
import { openSettings, EN_BROWSER_LOCALE } from './support.ts'

it('drops a model directly into the middle of an inactive row gap', async () => {
  const scaffold = await launchWebScaffold()
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: EN_BROWSER_LOCALE })
  await page.goto(scaffold.authenticatedUrl)
  await openSettings(page)
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('button', { name: 'Models', exact: true }).click()
  await dialog.getByRole('button', { name: 'Add provider' }).click()
  await dialog.getByLabel('Provider', { exact: true }).selectOption('minimax-cn')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.getByRole('button', { name: 'Edit minimax-cn' }).click()
  await dialog.getByText('Customized settings', { exact: true }).click()
  for (let position = 1; position <= 3; position++) {
    await dialog.getByRole('button', { name: 'Add model', exact: true }).click()
    await dialog.getByLabel(`Model ID ${String(position)}`, { exact: true }).fill(`gap-model-${String(position)}`)
  }
  const source = dialog.getByRole('button', { name: 'Reorder model 1', exact: true })
  await source.scrollIntoViewIfNeeded()
  const point = await dialog.locator('[data-row-key]').evaluateAll((rows) => {
    const a = rows[1]!.getBoundingClientRect()
    const b = rows[2]!.getBoundingClientRect()
    const x = a.left + 20
    const y = (a.bottom + b.top) / 2
    return { x, y, outside: a.right + 20, gap: b.top - a.bottom,
      hitsRow: document.elementFromPoint(x, y)?.closest('[data-row-key]') != null }
  })
  expect(point.gap).toBeGreaterThan(0)
  expect(point.hitsRow).toBe(true)
  await source.hover()
  const from = await source.boundingBox()
  if (from === null) throw new Error('Model drag handle is not visible')
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 3 })
  await page.mouse.move(point.outside, point.y)
  await page.mouse.move(point.x, point.y)
  await page.mouse.up()
  await expect.poll(() => dialog.getByLabel('Model ID 2', { exact: true }).inputValue()).toBe('gap-model-1')
})
