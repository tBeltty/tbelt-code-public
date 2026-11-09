/** Host companion for the interactive terminal Client plugin: guidance for commands the user runs from the conversation. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** The system-prompt registry receives the user-run command guidance. */
export const inject = ['systemPrompt']

/** Guidance for shell fences that the Client renders with a Run action. */
export const USER_RUN_COMMANDS_PROMPT = 'When a command needs the user\'s own permissions, such as one your sandbox or approval policy blocked, one that needs sudo or the user\'s credentials, or one that must change files outside the workspace, write it in a ```bash fenced block and ask the user to run it. '
  + 'The user can run each bash, sh, zsh, or shell block from the conversation: it runs in their default shell in a terminal beside the conversation, where they can answer prompts such as a password, and its exit status and final output arrive as the user\'s next message. '
  + 'Put one complete command or script in each block. Run commands yourself whenever your tools allow it.'

/**
 * Register the user-run command guidance.
 * @param ctx - Host context carrying the system-prompt registry.
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'ui:user-run-commands',
    order: ctx.systemPrompt.getSectionOrder('USER_RUN_COMMANDS'),
    text: USER_RUN_COMMANDS_PROMPT,
  })
}
