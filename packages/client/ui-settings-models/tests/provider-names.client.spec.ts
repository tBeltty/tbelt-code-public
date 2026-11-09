import { expect, it } from 'vitest'
import { POPULAR_PROVIDERS, providerDisplayName } from '../src/client/provider-names.ts'

it('keeps a name that someone set', () => {
  expect(providerDisplayName('openai', 'My OpenAI')).toBe('My OpenAI')
})

it('names known routes by their product name', () => {
  expect(providerDisplayName('amazon-bedrock', 'amazon-bedrock')).toBe('Amazon Bedrock')
  expect(providerDisplayName('openai', 'openai')).toBe('OpenAI')
})

it('title-cases the id of a route without a known name', () => {
  expect(providerDisplayName('acme-labs', 'acme-labs')).toBe('Acme Labs')
})

it('names every popular route', () => {
  for (const provider of POPULAR_PROVIDERS) {
    expect(providerDisplayName(provider, provider)).toMatch(/^[A-Za-z]/)
  }
})
