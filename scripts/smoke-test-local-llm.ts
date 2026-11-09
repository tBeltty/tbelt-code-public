/**
 * Manual local-verification tool — NOT part of the automated suite, and not
 * wired into any CI or test-runner script.
 *
 * Boots `llm-pi-ai` against a local OpenAI-compatible server (Ollama or LM
 * Studio) and sends one non-tool completion, to prove the adapter actually
 * round-trips against a live local model server. CI has no such server and
 * should not need one; this script exists so a developer can check that by
 * hand. See docs/guides/LOCAL_MODELS.md for the settings.yaml route shape
 * this mirrors, and packages/llm/llm-pi-ai/tests/adapter.e2e.ts for the
 * test-boot/Cordis-context pattern this script follows.
 *
 * Usage:
 *   npx tsx scripts/smoke-test-local-llm.ts [baseURL] [model]
 *   LOCAL_LLM_BASE_URL=http://localhost:1234/v1 npx tsx scripts/smoke-test-local-llm.ts
 *
 * Defaults: baseURL http://localhost:11434/v1 (Ollama), model deepseek8b-lite.
 */

import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'

const DEFAULT_BASE_URL = 'http://localhost:11434/v1'
const DEFAULT_MODEL = 'deepseek8b-lite'
const PROVIDER = 'local-smoke'
// Ollama and LM Studio don't check this value for a local, unauthenticated
// server, but `llm-pi-ai`'s openai-completions route still requires some
// non-empty credential to be present on the request (see LOCAL_MODELS.md).
const PLACEHOLDER_API_KEY_ENV = 'LOCAL_LLM_SMOKE_API_KEY'

const baseURL = process.argv[2] ?? process.env.LOCAL_LLM_BASE_URL ?? DEFAULT_BASE_URL
const model = process.argv[3] ?? process.env.LOCAL_LLM_MODEL ?? DEFAULT_MODEL

process.env[PLACEHOLDER_API_KEY_ENV] ??= 'local-smoke-placeholder'

async function main(): Promise<void> {
  console.log(`smoke-test-local-llm: provider=${PROVIDER} baseURL=${baseURL} model=${model}`)

  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmPiAi, {
    providers: {
      [PROVIDER]: {
        api: 'openai-completions',
        baseURL,
        apiKeyEnv: PLACEHOLDER_API_KEY_ENV,
        models: [{ id: model, name: model, contextWindow: 8192 }],
      },
    },
  })

  try {
    const assembler = new BlockAssembler()
    const request = {
      provider: PROVIDER,
      model,
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'Reply with exactly the word: pong' }],
        source: { kind: 'user' },
      })],
      maxTokens: 50,
    }
    for await (const chunk of ctx.llm.stream(request)) assembler.push(chunk)

    const message = assembler.message({ provider: PROVIDER, model })
    const text = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')

    console.log(`smoke-test-local-llm: finish=${JSON.stringify(assembler.finish)}`)
    console.log(`smoke-test-local-llm: response text: ${text}`)
    console.log('smoke-test-local-llm: OK — local server round-trip succeeded.')
  } catch (error) {
    console.error('smoke-test-local-llm: FAILED to reach or complete against the local server.')
    console.error(`smoke-test-local-llm: is a server running at ${baseURL}? (e.g. \`ollama serve\`)`)
    console.error(error)
    process.exitCode = 1
  } finally {
    await ctx.fiber.dispose()
  }
}

await main()
