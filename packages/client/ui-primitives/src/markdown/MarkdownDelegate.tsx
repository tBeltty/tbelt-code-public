/** Consumer-owned navigation for Markdown links and fenced-code actions. */
import { createContext, useContext, useMemo } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { ImageLightboxLabels } from '../ImageLightbox.tsx'

/**
 * Handle one sanitized absolute HTTP(S) URL selected from Markdown.
 * @param href - destination URL.
 */
export type MarkdownExternalLinkHandler = (href: string) => void

/** Navigation capabilities supplied by the nearest Markdown owner. */
export interface MarkdownDelegate {
  /** Image previews for decoded local paths in this owner's workspace. */
  readonly fileImages?: {
    resolve: (path: string) => string | undefined
    labels: ImageLightboxLabels & { open: string; loading: string; failed: string }
  } | undefined
  /** Ordinary HTTP(S) activation; absent handlers retain native anchor behavior. */
  readonly openExternalLink?: MarkdownExternalLinkHandler | undefined
  /**
   * Open a decoded local destination from settled Markdown; absent handlers leave plain text.
   * @param path - Absolute or workspace-relative file path.
   * @param options - First line to reveal when the destination specifies a line or range.
   */
  readonly openFile?: ((path: string, options?: { line?: number }) => void) | undefined
  /** Actions for settled fences; streaming fences and absent runners render plain code blocks. */
  readonly codeRunner?: MarkdownCodeRunner | undefined
}

/** Header actions and footer an owner adds to one fenced code block. */
export interface MarkdownCodeBlockSlots {
  readonly actions?: ReactNode
  readonly footer?: ReactNode
}

/** Props for an owner component that wraps one settled fenced code block. */
export interface MarkdownCodeRunnerProps {
  /** Fence source without its trailing newline. */
  readonly code: string
  /** Fence language id accepted by {@link MarkdownCodeRunner.accepts}. */
  readonly lang: string
  /**
   * Render the code block with owner slots.
   * @param slots - header actions and footer.
   * @returns the code block element.
   */
  readonly renderBlock: (slots: MarkdownCodeBlockSlots) => ReactNode
}

/** Owner behavior for settled fenced code blocks in selected languages. */
export interface MarkdownCodeRunner {
  /**
   * Select fences this owner handles.
   * @param lang - fence language id.
   * @returns whether {@link Component} wraps the fence.
   */
  readonly accepts: (lang: string) => boolean
  /** Stable component; a new identity remounts every wrapped fence. */
  readonly Component: ComponentType<MarkdownCodeRunnerProps>
}

const MarkdownDelegateContext = createContext<MarkdownDelegate>({})

/** Props for one Markdown navigation scope. */
export interface MarkdownDelegateProviderProps extends MarkdownDelegate {
  readonly children: ReactNode
}

/**
 * Scope Markdown navigation without threading callbacks through renderers.
 * Nested providers replace the enclosing capabilities. Handler changes reach cached links.
 * @param props - Child tree, its file and HTTP(S) link handlers, and its fenced-code runner.
 * @returns the scoped child tree.
 */
export function MarkdownDelegateProvider({
  children,
  openExternalLink,
  openFile,
  fileImages,
  codeRunner,
}: MarkdownDelegateProviderProps): ReactNode {
  const delegate = useMemo(
    () => ({ openExternalLink, openFile, fileImages, codeRunner }),
    [openExternalLink, openFile, fileImages, codeRunner],
  )
  return (
    <MarkdownDelegateContext.Provider value={delegate}>
      {children}
    </MarkdownDelegateContext.Provider>
  )
}

/**
 * Read the nearest Markdown navigation capabilities.
 * @returns Owner callbacks, or an empty delegate outside a provider.
 */
export function useMarkdownDelegate(): MarkdownDelegate {
  return useContext(MarkdownDelegateContext)
}
