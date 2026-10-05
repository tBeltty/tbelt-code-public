/** Scoped tool that asks the Web client to show a file or a loopback server in the right Sidebar. */
import type { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'

/** Host names that address the user's own machine. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Parse a target that starts with `http://` or `https://` and require a loopback host.
 * @param target - the model-supplied URL.
 * @returns the normalized URL text.
 */
function loopbackUrl(target: string): string {
  let url: URL
  try { url = new URL(target) }
  catch { throw new Error(`Cannot preview ${target}: not a valid URL`) } // URL parse errors carry no detail the model can act on.
  if (url.username !== '' || url.password !== '') throw new Error(`Cannot preview ${target}: URLs with credentials are not supported`)
  if (!LOOPBACK_HOSTS.has(url.hostname) && !url.hostname.endsWith('.localhost')) {
    throw new Error(`Cannot preview ${target}: only local servers (localhost, 127.0.0.1, [::1]) can be previewed`)
  }
  return url.href
}

/**
 * Register `preview`. The tool result names the target; the Web client opens it from the recorded call.
 * @param ctx - agent-scoped services with `tools` and `fs`.
 */
export function registerPreview(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'preview',
    description: 'Show a file or a local web server to the user in the preview panel beside the conversation. '
      + 'The panel renders the page first and keeps its source one toggle away. '
      + 'Use it whenever the user should see a result: an HTML page, an image, a PDF, Markdown, or a dev server you started. '
      + 'For a dev server, start it in the background first, then call preview with its http://localhost URL. '
      + 'Never use open, xdg-open, start, or a browser command to show results; they leave the app.',
    parameters: {
      target: {
        type: 'string', required: true,
        description: 'Path of an existing file (relative paths use the Session working directory), or an http(s) URL on localhost, 127.0.0.1, or [::1].',
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string' },
          url: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Showing ${value.url ?? value.path} in the preview panel` }],
    },
    async execute(args, exec) {
      const target = args.target.trim()
      if (target.length === 0) throw new Error('preview requires a file path or a localhost URL')
      if (/^https?:\/\//i.test(target)) return { url: loopbackUrl(target) }
      const cwd = exec.agent?.session.header.cwd
      if (cwd === undefined) throw new Error('preview requires a workspace to resolve file paths')
      const resolved = await ctx.fs.resolve(target, { cwd, signal: exec.signal })
      const info = await ctx.fs.stat(resolved, exec.signal)
      if (info === undefined) throw new FsError(`Cannot preview ${target}: file not found. Check the path, create the file if needed, and retry.`, 'FS_NOT_FOUND')
      if (info.type !== 'file') throw new Error(`Cannot preview ${target}: not a regular file`)
      return { path: target }
    },
  }))
}
