import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hostTitle } from '../src/host-title.ts'

/** Checkout of Orca (https://github.com/stablyai/orca) read by this opt-in contract check; the suite is skipped without it. */
const ORCA_SRC = process.env['ORCA_SRC'] ?? ''

/** What Orca concludes from one title. */
interface OrcaReading {
  readonly agent: string | null
  readonly status: string | null
}

/** Script run under tsx: Orca imports without file extensions, which only tsx resolves. */
const READER = `
const shared = async name => {
  const loaded = await import(new URL('src/shared/' + name, 'file://' + process.argv[1] + '/').href)
  return loaded.default ?? loaded
}
const { resolveTerminalTitleAgentType } = await shared('terminal-title-agent-type.ts')
const { detectAgentStatusFromTitle } = await shared('agent-detection.ts')
const titles = JSON.parse(process.argv[2])
console.log(JSON.stringify(titles.map(title => ({ agent: resolveTerminalTitleAgentType(title), status: detectAgentStatusFromTitle(title) }))))
`

/** Ask Orca's own title detection what it reads from each title. */
function readInOrca(titles: readonly string[]): OrcaReading[] {
  const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', READER, resolve(ORCA_SRC), JSON.stringify(titles)], { encoding: 'utf8' })
  return JSON.parse(out) as OrcaReading[]
}

describe.skipIf(ORCA_SRC === '')('host title as Orca reads it', () => {
  it('names the pane dsh in every state and reads the spinner as working', () => {
    const titles = [['idle', 0], ['working', 0], ['working', 1], ['waiting', 0]] as const
    const readings = readInOrca(titles.map(([activity, frame]) => hostTitle({ activity, frame, label: 'proj', marker: true })))
    expect(readings).toEqual([
      { agent: 'dsh', status: null },
      { agent: 'dsh', status: 'working' },
      { agent: 'dsh', status: 'working' },
      { agent: 'dsh', status: null },
    ])
  })

  it('needs the marker: an unmarked resting title reads as a working Gemini', () => {
    expect(readInOrca([hostTitle({ activity: 'idle', frame: 0, label: 'proj', marker: false })])).toEqual([{ agent: 'gemini', status: 'working' }])
  })
})
