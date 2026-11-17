/** MCP resource-listing diagnostics keep the shipped ACP profile's stdout JSON-RPC only. */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { launchAcpTestAgent, type LaunchedAcpTestAgent } from '@deepseek-ai/dsh-session-snapshot'
import { expect, it } from 'vitest'
import { cleanupAcpExampleTest } from './cleanup.ts'

const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))
const binScript = join(repoRoot, 'apps/cli/src/bin.ts')
const tsconfigPath = join(repoRoot, 'tsconfig.json')

/** Parse every stdout line as a JSON-RPC frame; a diagnostic line fails the parse with its leading text. */
function jsonRpcFrames(launched: LaunchedAcpTestAgent): Record<string, unknown>[] {
  const frames = launched.rawStdout().trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
  for (const frame of frames) expect(frame).toMatchObject({ jsonrpc: '2.0' })
  return frames
}

it('keeps MCP resource-listing diagnostics off stdout for a tools-only client server', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-acp-stdout-'))
  const llm = await startMockLlmServer({
    sequence: ['tool_call_success', 'success'],
    toolName: 'list_mcp_resources',
    toolArguments: JSON.stringify({ server: 'fixture' }),
  })
  let launched: LaunchedAcpTestAgent | undefined
  try {
    const configPath = join(cwd, 'mcp.patch.yml')
    await writeFile(configPath, JSON.stringify([
      { id: 'llm-deepseek', config: { baseURL: llm.baseURL, models: [{ id: 'fixture-api-key-model' }] } },
      { id: 'acp', config: { provider: 'deepseek-official', model: 'fixture-api-key-model' } },
      { id: 'session-persistence-jsonl', config: { root: join(cwd, 'sessions'), compression: 'none' } },
    ]) + '\n')
    launched = launchAcpTestAgent({
      agent: { binScript, configPath, profile: 'acp', tsconfigPath },
      cwd,
      env: { DEEPSEEK_API_KEY: 'acp-fixture-api-key', DEEPSEEK_BASE_URL: llm.baseURL, DSH_TELEMETRY_DISABLED: '1' },
    })
    await launched.client.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
    // The fixture server advertises only the tools capability.
    const mcpServer = join(repoRoot, 'packages/mcp/mcp-client/tests/fixture-server.ts')
    const created = await launched.client.newSession({
      cwd, mcpServers: [{ name: 'fixture', command: process.execPath, args: [mcpServer], env: [] }],
    })
    await expect(launched.client.prompt({
      sessionId: created.sessionId,
      prompt: [{ type: 'text', text: 'list the fixture resources' }],
    })).resolves.toEqual({ stopReason: 'end_turn' })
    expect(launched.updates).toContainEqual(expect.objectContaining({ sessionUpdate: 'tool_call_update', status: 'completed' }))
    await launched.client.closeSession({ sessionId: created.sessionId })
    await launched.close()

    expect(launched.child.exitCode).toBe(0)
    expect(llm.requests.map(request => request.behavior)).toEqual(['tool_call_success', 'success'])
    expect(jsonRpcFrames(launched).length).toBeGreaterThanOrEqual(5)
  } finally {
    const cleanup = await Promise.allSettled([cleanupAcpExampleTest(launched, cwd), llm.close()])
    const failures: unknown[] = []
    for (const result of cleanup) if (result.status === 'rejected') failures.push(result.reason)
    if (failures.length > 0) throw new AggregateError(failures, 'ACP MCP test cleanup failed')
  }
})
