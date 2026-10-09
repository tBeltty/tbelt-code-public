/** `approval` namespace dictionaries. */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  waiting: '等待审批',
  'detail.aria': '审批详情',
  'need.shell': '我需要权限来运行一条命令',
  'need.edit': '我需要权限来修改你项目中的文件',
  'need.read': '我需要权限来读取你的文件或网页',
  'need.search': '我需要权限来搜索你的项目或网络',
  'need.code': '我需要权限来运行一段程序',
  'need.generic': '我需要权限来执行一项操作',
  because: '原因：{reason}',
  technical: '技术详情',
  'technical.tool': '工具：{toolName}',
  reject: '拒绝',
  allowOnce: '允许一次',
  allowSession: '本次会话中允许',
  allowMenu: '更多允许选项',
} satisfies Record<string, string>

/** Approval dictionary key union. */
export type ApprovalKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  waiting: 'Waiting for approval',
  'detail.aria': 'Approval details',
  'need.shell': 'I need permission to run a command',
  'need.edit': 'I need permission to change files in your project',
  'need.read': 'I need permission to read your files or a web page',
  'need.search': 'I need permission to search your project or the web',
  'need.code': 'I need permission to run a program',
  'need.generic': 'I need permission to take an action',
  because: 'Because: {reason}',
  technical: 'Technical details',
  'technical.tool': 'Tool: {toolName}',
  reject: 'Reject',
  allowOnce: 'Allow once',
  allowSession: 'Allow for this session',
  allowMenu: 'More ways to allow',
} satisfies Record<ApprovalKey, string>
