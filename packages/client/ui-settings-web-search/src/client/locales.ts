/** Locale bundles for the web-search settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type WebSearchSettingsLocaleKey =
  | 'title' | 'description'
  | 'provider' | 'providerHint' | 'noProviders'
  | 'providerExa' | 'providerPerplexity' | 'providerBrave' | 'providerTavily'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'checking' | 'keyMissing' | 'keyRejected' | 'keyQuota' | 'keyError'
  | 'readOnly' | 'unavailable' | 'save' | 'saving' | 'saveFailed'

/** English copy. */
export const en: Record<WebSearchSettingsLocaleKey, string> = {
  title: 'Web search',
  description: 'Choose the search provider the agent uses for current information.',
  provider: 'Search provider',
  providerHint: 'The agent searches only through the provider chosen here. Your key is sent to that provider and nowhere else.',
  noProviders: 'No search provider is installed.',
  providerExa: 'Exa',
  providerPerplexity: 'Perplexity',
  providerBrave: 'Brave',
  providerTavily: 'Tavily',
  apiKey: 'API key',
  apiKeyHint: 'Stored outside the settings file and checked with the provider before saving. Leave blank to keep the current key.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured.',
  checking: 'Checking the key with the provider…',
  keyMissing: 'Add this provider’s API key before saving.',
  keyRejected: 'The provider rejected this key. Nothing was saved.',
  keyQuota: 'The key works, but the provider reports no quota or credit left. It was saved; searches fail until the quota renews.',
  keyError: 'The key could not be checked. Nothing was saved.',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'Web search is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
}

/** Simplified Chinese copy. */
export const zh: Record<WebSearchSettingsLocaleKey, string> = {
  title: '网页搜索',
  description: '选择智能体获取最新信息时使用的搜索提供方。',
  provider: '搜索提供方',
  providerHint: '智能体只通过这里选择的提供方搜索。你的密钥只会发送给该提供方。',
  noProviders: '未安装任何搜索提供方。',
  providerExa: 'Exa',
  providerPerplexity: 'Perplexity',
  providerBrave: 'Brave',
  providerTavily: 'Tavily',
  apiKey: 'API Key',
  apiKeyHint: '不写入设置文件，保存前会先向提供方验证。留空表示保持当前密钥。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥。',
  checking: '正在向提供方验证密钥…',
  keyMissing: '保存前请先填写该提供方的 API Key。',
  keyRejected: '提供方拒绝了该密钥，未保存任何内容。',
  keyQuota: '密钥有效，但提供方表示额度或余额已用完。已保存；额度恢复前搜索会失败。',
  keyError: '无法验证该密钥，未保存任何内容。',
  readOnly: '本部署的设置为只读。',
  unavailable: '网页搜索当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
}

/** Locale key naming each shipped provider; another id renders as itself. */
export const PROVIDER_NAMES: Readonly<Record<string, WebSearchSettingsLocaleKey>> = {
  exa: 'providerExa',
  perplexity: 'providerPerplexity',
  brave: 'providerBrave',
  tavily: 'providerTavily',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: WebSearchSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
