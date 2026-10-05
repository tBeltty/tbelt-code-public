/**
 * Package entry point. Re-exports the pure classifier only — no Cordis
 * `name`/`inject`/`apply` wiring yet. Hooking `tools/pre-execute` through
 * `ctx.approval` is a separate task (P3-T2) so classification correctness can
 * be reviewed and tested in isolation from plumbing.
 *
 * @module @deepseek-ai/dsh-destructive-command-policy
 */

export * from './classify.ts'
