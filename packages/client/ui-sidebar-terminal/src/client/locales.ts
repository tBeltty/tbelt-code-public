/** Copy owned by the sidebar terminal feature. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    sidebarTerminal: SidebarTerminalKey
  }
}

/** Keys of the sidebar terminal copy. */
export type SidebarTerminalKey = keyof typeof zh

/** Simplified Chinese terminal copy. */
export const zh = {
  'shortcut.noSession': '请先选择会话',
  recoveryFailed: '恢复终端失败：{message}', retryRecovery: '重试恢复终端',
  shell: '选择 Shell', shellLoading: '正在读取 Shell…', shellEmpty: '没有可用的 Shell', description: '在会话工作区运行命令',
  title: '终端', new: '新建终端', loading: '正在读取终端环境…', creating: '正在启动…',
  connecting: '正在连接…', disconnected: '连接已断开。', reconnect: '重新连接',
  readonly: '此页面当前只读。', control: '接管输入',
  closed: '终端已关闭。', exited: '进程已退出（{code}）', failed: '终端错误：{message}',
  rename: '终端名称', unavailable: '不可用', retry: '重试',
  cleanupFailed: '终端「{title}」未能结束：{message}',
  missingTerminal: '此终端已不存在，请新建终端。',
  inputFull: '输入缓冲区已满，请重新连接后重试。',
  attachmentEnded: '终端连接已结束，请重新连接。',
  invalidOutput: '终端画面传输异常，请重新连接。',
  terminalLimit: '终端数量已达上限，请关闭不用的终端后重试。已退出的终端也计入数量。',
  'run.action': '在终端中运行', 'run.again': '再次运行', 'run.show': '查看终端',
  'run.running': '正在终端中运行…', 'run.stopped': '进程已停止', 'run.reported': '输出已发送到对话',
  'run.failed': '无法运行：{message}',
  'run.report.intro': '我在终端中运行了这个命令：', 'run.report.exit': '退出码：{code}',
  'run.report.stopped': '命令在结束前被停止。', 'run.report.failed': '终端出错：{message}',
  'run.report.empty': '没有输出。', 'run.report.truncated': '（较早的输出已省略）',
} satisfies Record<string, string>

/** English terminal copy. */
export const en = {
  'shortcut.noSession': 'Select a session first',
  recoveryFailed: 'Terminal recovery failed: {message}', retryRecovery: 'Retry terminal recovery',
  shell: 'Choose shell', shellLoading: 'Loading shells…', shellEmpty: 'No shells available', description: 'Run commands in the Session workspace',
  title: 'Terminal', new: 'New terminal', loading: 'Reading terminal environment…', creating: 'Starting…',
  connecting: 'Connecting…', disconnected: 'Disconnected.', reconnect: 'Reconnect',
  readonly: 'This view is read-only.', control: 'Take control',
  closed: 'Terminal closed.', exited: 'Process exited ({code})', failed: 'Terminal error: {message}',
  rename: 'Terminal name', unavailable: 'Unavailable', retry: 'Retry',
  cleanupFailed: 'Terminal “{title}” could not be ended: {message}',
  missingTerminal: 'This terminal no longer exists. Open a new terminal.',
  inputFull: 'The input buffer is full. Reconnect and try again.',
  attachmentEnded: 'The terminal connection ended. Reconnect to continue.',
  invalidOutput: 'The terminal screen could not be received. Reconnect to recover it.',
  terminalLimit: 'The terminal limit has been reached. Close unused terminals and try again. Exited terminals also count toward the limit.',
  'run.action': 'Run in terminal', 'run.again': 'Run again', 'run.show': 'Show terminal',
  'run.running': 'Running in the terminal…', 'run.stopped': 'Process stopped', 'run.reported': 'Output sent to the chat',
  'run.failed': 'Could not run: {message}',
  'run.report.intro': 'I ran this command in the terminal:', 'run.report.exit': 'Exit code: {code}',
  'run.report.stopped': 'The command was stopped before it finished.', 'run.report.failed': 'The terminal failed: {message}',
  'run.report.empty': 'No output.', 'run.report.truncated': '(Earlier output omitted)',
} satisfies Record<keyof typeof zh, string>
