/** Carrier-neutral page navigation and observable state. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ElementPick } from '../grab/payload.ts'
import type { BrowserTarget } from './url.ts'

/** A loading failure, optionally carrying the underlying browser's diagnostic. */
export interface BrowserLoadError {
  readonly code: number | undefined
  readonly description: string | undefined
}

/** State consumed by common browser chrome, without DOM or carrier identifiers. */
export interface BrowserFrameState {
  readonly target: BrowserTarget | undefined
  readonly address: 'empty' | 'requested' | 'observed' | 'unknown'
  readonly loading: boolean
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly error: BrowserLoadError | undefined
  /** Undefined when this provider does not expose a sandbox control. */
  readonly sandboxEnabled: boolean | undefined
  /** True while the user is choosing an element to point at. */
  readonly picking: boolean
}

/** Optional iframe policy control, not an Electron process-sandbox switch. */
export interface BrowserSandboxControl {
  /** @param enabled - whether the provider's embedding sandbox is enforced. */
  setEnabled(enabled: boolean): void
}

/** Optional control that lets the user click one element of the page. */
export interface BrowserElementPicker {
  /**
   * @returns the element the user clicked, or undefined when the pick was cancelled, the page navigated, or reading it failed.
   * A second call while one pick runs returns undefined.
   */
  pick(): Promise<ElementPick | undefined>
  /** End the active pick, if any; its `pick()` call settles with undefined. */
  cancel(): void
}

/** Navigation owns page lifetime; mounting and hiding belong to BrowserPresentation. */
export interface BrowserFrame extends HostObservable<BrowserFrameState> {
  readonly sandbox?: BrowserSandboxControl
  /** Absent when the provider cannot reach into the page. */
  readonly picker?: BrowserElementPicker
  /** @param target - validated HTTP(S) address; loading failures are published in state. */
  loadUrl(target: BrowserTarget): void
  /** Move backward when the provider reports an available entry. */
  goBack(): void
  /** Move forward when the provider reports an available entry. */
  goForward(): void
  /** Reload the current address without creating a new history entry. */
  reload(): void
  /** @returns after the page, listeners and pending initialization have been released; repeated calls join disposal. */
  dispose(): Promise<void>
}

/**
 * Create idle navigation state without a page target.
 * @returns state before any page has been requested.
 */
export function emptyBrowserFrame(): BrowserFrameState {
  return { target: undefined, address: 'empty', loading: false, canGoBack: false, canGoForward: false,
    error: undefined, sandboxEnabled: undefined, picking: false }
}
