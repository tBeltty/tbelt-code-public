/**
 * Provider setup presenter: the rules the GUI Models page and the terminal
 * `/providers` screen share for listing providers, naming their credential
 * references, storing models and judging a typed key.
 * @module @deepseek-ai/dsh-presentation-settings
 */
export { apiKeyFailure } from './api-key.ts'
export type { ApiKeyFailureKey } from './api-key.ts'
export { deriveKeyRef, joinProviderDirectory, providerKeyRef } from './provider-directory.ts'
export type { ConfigurableProvider, ProviderDirectoryEntry, RegisteredProvider } from './provider-directory.ts'
export {
  cleartextRemote, customProfile, isHttpUrl, modelEntry, profileOps, ROUTE_PATTERN, setupOps,
} from './provider-profile.ts'
export type { CustomProviderDraft, DiscoveredModel, ModelEntry, ModelPricing, ProfileOp } from './provider-profile.ts'
export { LOCAL_PROVIDER_TEMPLATES } from './provider-templates.ts'
export type { ProviderTemplate } from './provider-templates.ts'
