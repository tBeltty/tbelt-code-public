// Fills the download rows from /api/releases, points the hero button at the visitor's platform,
// and plays the example session once.
(() => {
  const NAMES = { windows: 'Windows', mac: 'macOS', linux: 'Linux' }
  // Browsers report every Mac as Intel, so the note names the supported chip instead of detecting it.
  const NOTES = { mac: ' (Apple silicon: M1 or newer)' }

  function detectPlatform() {
    const source = `${navigator.userAgentData?.platform ?? ''} ${navigator.platform ?? ''} ${navigator.userAgent}`.toLowerCase()
    if (/android|iphone|ipad|ipod/.test(source)) return null
    if (source.includes('win')) return 'windows'
    if (source.includes('mac')) return 'mac'
    if (source.includes('linux') || source.includes('x11')) return 'linux'
    return null
  }

  function describe(release) {
    const parts = [`Version ${release.version}`]
    if (release.size !== null) parts.push(`${Math.round(release.size / 1024 / 1024)} MB`)
    const date = release.releaseDate === null ? null : new Date(release.releaseDate)
    if (date !== null && !Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }))
    }
    return parts.join(', ')
  }

  function playSession() {
    const session = document.querySelector('.session')
    if (!session || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const steps = session.querySelectorAll('[data-step]')
    session.classList.add('is-playing')
    steps.forEach((step, index) => {
      setTimeout(() => step.classList.add('is-shown'), 300 + index * 420)
    })
  }

  const year = document.querySelector('[data-year]')
  if (year) year.textContent = String(new Date().getFullYear())
  playSession()

  const platform = detectPlatform()
  const heroButton = document.getElementById('hero-download')
  const heroNote = document.querySelector('[data-hero-note]')
  if (platform !== null) {
    heroButton.href = `/download/${platform}`
    heroButton.textContent = `Download for ${NAMES[platform]}`
    document.querySelector(`[data-platform="${platform}"]`)?.classList.add('is-current')
  }

  const pending = new URLSearchParams(location.search).get('pending')
  if (pending in NAMES) {
    const notice = document.querySelector('[data-pending]')
    notice.textContent = `The ${NAMES[pending]} version is not published yet.`
    notice.hidden = false
  }

  function markUnavailable(card) {
    card.querySelector('[data-version]').textContent = 'Not available yet'
    const button = card.querySelector('[data-download]')
    button.setAttribute('aria-disabled', 'true')
    button.removeAttribute('href')
  }

  fetch('/api/releases', { headers: { accept: 'application/json' } })
    .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then(releases => {
      for (const card of document.querySelectorAll('[data-platform]')) {
        const release = releases[card.dataset.platform]
        if (release) card.querySelector('[data-version]').textContent = describe(release)
        else markUnavailable(card)
      }
      const current = platform === null ? null : releases[platform]
      if (current) heroNote.textContent = `Version ${current.version} for ${NAMES[platform]}${NOTES[platform] ?? ''}, free to download.`
      else if (platform !== null) {
        heroButton.href = '#download'
        heroButton.textContent = `See downloads`
        heroNote.textContent = `The ${NAMES[platform]} version is not published yet.`
      }
    })
    .catch(() => {
      for (const node of document.querySelectorAll('[data-version]')) node.textContent = 'Latest version'
    })
})()
