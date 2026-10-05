/**
 * Package entry point. Re-exports the pure classifier only — no Cordis
 * `name`/`inject`/`apply` wiring here. `packages/memory/memory-storage`'s
 * write path calls {@link redactMemoryContent} directly; wiring it as the
 * mandatory pre-write step is that later task's responsibility, not this
 * package's.
 *
 * @module @deepseek-ai/dsh-memory-redact
 */

export * from './classify.ts'
