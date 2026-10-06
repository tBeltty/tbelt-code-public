// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PICK_CANCEL_SCRIPT, PICK_GUEST_SCRIPT } from '../src/client/grab/guest-script.ts'
import { clampPick, formatPick, formatPicks, type ElementPick } from '../src/client/grab/payload.ts'
import { ElementPickStore } from '../src/client/grab/picks.ts'
import { electronFixture } from './electron-harness.client.ts'

const target = { kind: 'https' as const, url: 'https://example.test/', title: 'Example' }

/** Run the guest script in this jsdom window; hit-testing is stubbed because jsdom has no layout. */
function startPick(under: Element | null): Promise<unknown> {
  document.elementFromPoint = () => under
  return (0, eval)(PICK_GUEST_SCRIPT) as Promise<unknown>
}

function overlay(): HTMLElement {
  const host = [...document.documentElement.children].find(el => (el as HTMLElement).style.zIndex === '2147483647')
  if (host === undefined) throw new Error('overlay missing')
  return host as HTMLElement
}

afterEach(() => {
  document.body.innerHTML = ''
  for (const el of document.documentElement.querySelectorAll('div[style*="2147483647"]')) el.remove()
})

describe('guest script', () => {
  it('settles with the clicked element, redacting secrets and stripping scripts and URL queries', async () => {
    document.body.innerHTML = `<main><section class="card"><button id="buy" class="btn primary" data-token="x"
      aria-label="Buy now" href="https://shop.test/p?token=abc#frag" title="csrf-123">Buy <b>now</b><script>alert(1)</script></button></section></main>`
    const button = document.getElementById('buy')!
    const result = startPick(button)
    overlay().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }))
    const { picked } = await result as { picked: ElementPick }
    expect(picked.target).toMatchObject({
      tagName: 'button', selector: 'button#buy', textSnippet: expect.stringContaining('Buy now') as string,
      accessibility: { accessibleName: 'Buy now' },
      attributes: { id: 'buy', 'aria-label': 'Buy now', title: '[redacted]', href: 'https://shop.test/p' },
    })
    expect(picked.target.attributes['data-token']).toBeUndefined()
    expect(picked.target.htmlSnippet).not.toContain('<script')
    expect(document.documentElement.querySelector('div[style*="2147483647"]')).toBeNull()
  })

  it('cancels with Escape, with the cancel script, and when a newer pick starts', async () => {
    document.body.innerHTML = '<p id="a">a</p>'
    const first = startPick(document.getElementById('a'))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await expect(first).resolves.toEqual({ cancelled: true })
    const second = startPick(document.getElementById('a'))
    ;(0, eval)(PICK_CANCEL_SCRIPT)
    await expect(second).resolves.toEqual({ cancelled: true })
    const third = startPick(document.getElementById('a'))
    const fourth = startPick(document.getElementById('a'))
    await expect(third).resolves.toEqual({ cancelled: true })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await expect(fourth).resolves.toEqual({ cancelled: true })
  })

  it('cancels when the click lands on nothing', async () => {
    const result = startPick(null)
    overlay().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await expect(result).resolves.toEqual({ cancelled: true })
  })

  it('replaces a global the page predefined', async () => {
    const cancel = vi.fn(() => { throw new Error('hostile') })
    ;(window as unknown as Record<string, unknown>).__tbeltElementPick = { cancel }
    document.body.innerHTML = '<p id="a">a</p>'
    const result = startPick(document.getElementById('a'))
    expect(cancel).toHaveBeenCalledOnce()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await expect(result).resolves.toEqual({ cancelled: true })
  })
})

describe('clampPick', () => {
  const hostile = {
    page: { url: 'javascript:alert(1)', title: 't'.repeat(900), viewportWidth: Infinity, viewportHeight: '5' },
    target: {
      tagName: 'div', selector: 's'.repeat(2000), elementPath: 'a > password', cssClasses: 'x',
      htmlSnippet: 'h'.repeat(9000), textSnippet: 'hello',
      attributes: { onclick: 'steal()', href: 'https://a.test/x?token=1', 'aria-label': 'ok', src: 'data:text/html,x', id: 'csrf_token' },
      accessibility: { role: 'button', accessibleName: 'api_key=1' },
      rect: { x: 1, y: 'a', width: 3, height: 4 },
      computedStyles: { display: 'block', evil: 'x' },
    },
    nearbyText: Array.from({ length: 30 }, () => 'n'), ancestorPath: Array.from({ length: 30 }, () => 'div'),
  }

  it('clamps sizes, drops unsafe attributes, and redacts credentials from a hostile page', () => {
    const pick = clampPick(hostile)!
    expect(pick.page).toEqual({ url: '', title: `${'t'.repeat(500)} (truncated)`, viewportWidth: 0, viewportHeight: 0 })
    expect(pick.target.selector.length).toBeLessThan(720)
    expect(pick.target.htmlSnippet.length).toBeLessThan(4120)
    expect(pick.target.elementPath).toBe('[redacted]')
    expect(pick.target.attributes).toEqual({ href: 'https://a.test/x', 'aria-label': 'ok', src: '', id: '[redacted]' })
    expect(pick.target.accessibility.accessibleName).toBe('[redacted]')
    expect(pick.target.rect).toEqual({ x: 1, y: 0, width: 3, height: 4 })
    expect(Object.keys(pick.target.computedStyles)).not.toContain('evil')
    expect(pick.nearbyText).toHaveLength(10)
    expect(pick.ancestorPath).toHaveLength(10)
  })

  it('rejects values without page or target', () => {
    expect(clampPick(undefined)).toBeUndefined()
    expect(clampPick({ page: {} })).toBeUndefined()
    expect(clampPick({ page: null, target: {} })).toBeUndefined()
    expect(clampPick({ page: {}, target: {} })).toBeDefined()
  })
})

describe('message text and memory', () => {
  const pick = clampPick({
    page: { url: 'https://example.test/', title: 'Example' },
    target: { tagName: 'button', selector: 'button#buy', elementPath: '#buy', textSnippet: 'Buy now', htmlSnippet: '<button>```</button>',
      attributes: { id: 'buy' }, rect: { x: 10.4, y: 20, width: 80, height: 32 } },
  })!

  it('formats a pick as labeled lines with a fenced HTML snippet', () => {
    expect(formatPick(pick)).toBe([
      'Browser element:', 'Page: Example (https://example.test/)', 'Element: <button> at 10,20 80x32', 'Selector: button#buy',
      'Path: #buy', 'Text: Buy now', 'Attributes: id="buy"', 'HTML:', '```html', '<button>` ` `</button>', '```',
    ].join('\n'))
    expect(formatPicks([pick, pick]).split('\n\n')).toHaveLength(2)
  })

  it('keeps unsent picks per session until a message removes them', () => {
    const store = new ElementPickStore()
    const a = 'session-a' as never
    const b = 'session-b' as never
    store.add(a, pick)
    store.add(a, pick)
    store.add(b, pick)
    const [first, second] = store.unsent(a)
    store.remove(a, [first!.id])
    expect(store.unsent(a)).toEqual([second])
    store.remove(a, [second!.id])
    expect(store.unsent(a)).toEqual([])
    expect(store.unsent(b)).toHaveLength(1)
    store.remove('missing' as never, [1])
  })
})

describe('Electron picker', () => {
  const fixtures: ReturnType<typeof electronFixture>[] = []
  afterEach(async () => { for (const h of fixtures.splice(0)) await h.dispose() })

  async function ready() {
    const h = electronFixture()
    fixtures.push(h)
    h.frame.loadUrl(target)
    h.mount()
    const guest = await h.guest()
    guest.emit('dom-ready')
    return { h, guest, picker: h.frame.picker! }
  }

  it('returns the clamped element and publishes picking while it runs', async () => {
    const { h, guest, picker } = await ready()
    guest.executeJavaScript.mockResolvedValueOnce({ picked: { page: {}, target: { tagName: 'a', selector: 'a' } } })
    const pending = picker.pick()
    expect(h.frame.getSnapshot().picking).toBe(true)
    expect(guest.executeJavaScript).toHaveBeenCalledWith(PICK_GUEST_SCRIPT)
    await expect(pending).resolves.toMatchObject({ target: { tagName: 'a' } })
    expect(h.frame.getSnapshot().picking).toBe(false)
  })

  it('settles undefined on cancel, navigation, a second call, a page error, and a cancelled result', async () => {
    const { h, guest, picker } = await ready()
    guest.executeJavaScript.mockImplementation(() => new Promise(() => {}))
    const cancelled = picker.pick()
    await expect(picker.pick()).resolves.toBeUndefined()
    picker.cancel()
    await expect(cancelled).resolves.toBeUndefined()
    expect(guest.executeJavaScript).toHaveBeenLastCalledWith(PICK_CANCEL_SCRIPT)

    const navigated = picker.pick()
    guest.emit('did-start-navigation', { isMainFrame: true })
    await expect(navigated).resolves.toBeUndefined()
    expect(h.frame.getSnapshot().picking).toBe(false)

    vi.spyOn(console, 'error').mockImplementation(() => {})
    guest.executeJavaScript.mockRejectedValueOnce(new Error('gone'))
    await expect(picker.pick()).resolves.toBeUndefined()
    guest.executeJavaScript.mockResolvedValueOnce({ cancelled: true })
    await expect(picker.pick()).resolves.toBeUndefined()
    guest.executeJavaScript.mockResolvedValueOnce('nonsense')
    await expect(picker.pick()).resolves.toBeUndefined()
    picker.cancel()
  })

  it('does nothing before the page is ready', async () => {
    const h = electronFixture()
    fixtures.push(h)
    await expect(h.frame.picker!.pick()).resolves.toBeUndefined()
  })

  it('survives a webview that throws when the cancel script is sent', async () => {
    const { guest, picker } = await ready()
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    guest.executeJavaScript.mockImplementationOnce(() => new Promise(() => {}))
    void picker.pick()
    guest.executeJavaScript.mockImplementationOnce(() => { throw new Error('not attached') })
    picker.cancel()
    guest.executeJavaScript.mockImplementationOnce(() => new Promise(() => {}))
    void picker.pick()
    guest.executeJavaScript.mockRejectedValueOnce(new Error('late'))
    picker.cancel()
    await Promise.resolve()
  })
})
