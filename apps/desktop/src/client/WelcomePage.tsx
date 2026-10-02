/** Desktop welcome presentation; provider setup happens in the workspace, where every provider is offered alike. */
import { useEffect, useRef, useState } from 'react'
import type { WelcomeApi } from '../welcome-api.ts'

/**
 * Render the standalone welcome entry using shell-owned operations and localized copy.
 * Continuing opens the workspace, whose first-run step configures any model provider.
 * @param props.api - isolated preload API.
 * @returns the welcome entry with a fixed bottom action.
 */
export function Welcome({ api }: { api: WelcomeApi }) {
  const { messages: m } = api
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    document.documentElement.lang = api.id
    document.title = m.welcomeTitle
    return () => { mounted.current = false }
  }, [api, m.welcomeTitle])

  async function start() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await api.skip()
    } catch {
      if (mounted.current) setError(m.welcomeContinueFailed)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return <>
    <div className="titlebar" aria-hidden="true" />
    <main className="welcome" aria-labelledby="welcome-heading">
      <img className="brand" src="assets/welcome-brand.svg" alt={m.welcomeBrand} width="64" height="64" />
      <div id="tagline" className="tagline">
        <h1 id="welcome-heading"><span>{m.welcomeTaglineBefore}</span><em>{m.welcomeTaglineBrand}</em><span>{m.welcomeTaglineAfter}</span></h1>
        <p id="welcome-description">{m.welcomeDescription}</p>
        <p id="start-error" className="key-error" role="alert" hidden={error === ''}>{error}</p>
      </div>
      <div id="entry-actions" className="actions">
        <button id="get-started" className="primary" type="button" disabled={busy} onClick={() => { void start() }}>{m.welcomeStart}</button>
      </div>
    </main>
  </>
}
