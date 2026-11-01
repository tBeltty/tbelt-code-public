// Renders CHANGELOG.md as the HTML page served at /changelog.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/**
 * Escapes text for HTML content and attribute values.
 * @param {string} text Raw text.
 * @returns {string} Text safe to embed in HTML.
 */
export function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (char) => ESCAPES[char])
}

function inline(text) {
  const parts = text.split(/(`[^`]+`|\[[^\]]+\]\(https:\/\/[^)\s]+\))/)
  return parts
    .map((part) => {
      const code = /^`([^`]+)`$/.exec(part)
      if (code !== null) return `<code>${escapeHtml(code[1])}</code>`
      const link = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/.exec(part)
      if (link !== null) return `<a href="${escapeHtml(link[2])}">${escapeHtml(link[1])}</a>`
      return escapeHtml(part)
    })
    .join('')
}

/**
 * Parses the released sections of a Keep a Changelog file, newest first.
 * An empty or absent Unreleased section is skipped.
 * @param {string} markdown Contents of CHANGELOG.md.
 * @returns {{version: string, date: string, url: string | null, groups: {title: string, items: string[]}[]}[]} Releases.
 */
export function parseChangelog(markdown) {
  const links = new Map()
  const releases = []
  let release = null
  let group = null
  for (const line of markdown.split('\n')) {
    const reference = /^\[([^\]]+)\]:\s*(https:\/\/\S+)$/.exec(line)
    if (reference !== null) {
      links.set(reference[1], reference[2])
      continue
    }
    const heading = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?$/.exec(line)
    if (heading !== null) {
      release = { version: heading[1], date: heading[2] ?? '', url: null, groups: [] }
      group = null
      releases.push(release)
      continue
    }
    if (release === null) continue
    const title = /^### (.+)$/.exec(line)
    if (title !== null) {
      group = { title: title[1], items: [] }
      release.groups.push(group)
      continue
    }
    const item = /^- (.+)$/.exec(line)
    if (item !== null && group !== null) group.items.push(item[1])
  }
  for (const entry of releases) entry.url = links.get(entry.version) ?? null
  return releases.filter((entry) => entry.date !== '' && entry.groups.length > 0)
}

function formatDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`)
  return parsed.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function renderRelease(entry) {
  const version = entry.url === null ? escapeHtml(entry.version) : `<a href="${escapeHtml(entry.url)}">${escapeHtml(entry.version)}</a>`
  const groups = entry.groups
    .map((group) => `<h3>${escapeHtml(group.title)}</h3>\n<ul>\n${group.items.map((item) => `<li>${inline(item)}</li>`).join('\n')}\n</ul>`)
    .join('\n')
  return `<section class="release" id="v${escapeHtml(entry.version)}">\n<h2>${version}</h2>\n<time datetime="${entry.date}">${formatDate(entry.date)}</time>\n${groups}\n</section>`
}

/**
 * Builds the complete /changelog page.
 * @param {string} markdown Contents of CHANGELOG.md.
 * @returns {string} HTML document.
 */
export function renderChangelogPage(markdown) {
  const releases = parseChangelog(markdown).map(renderRelease).join('\n')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Changelog, tBelt Code</title>
  <meta name="description" content="What changed in each version of tBelt Code.">
  <meta name="theme-color" content="#101010">
  <meta name="color-scheme" content="dark">
  <link rel="canonical" href="https://code.tbelt.online/changelog">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&family=Roboto+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>

  <header class="top">
    <a class="wordmark" href="/">
      <img src="/assets/logo.png" alt="" width="26" height="28">
      <span>tBelt <span class="accent">Code</span></span>
    </a>
    <a class="top-link" href="/#download">Download</a>
  </header>

  <main class="legal changelog" id="content">
    <h1>Changelog</h1>
    <p class="lead">What changed in each version of tBelt Code, newest first.</p>
${releases}
  </main>

  <footer class="bottom">
    <div class="bottom-inner">
    <span>© <span data-year>2026</span> tBelt</span>
    <span class="bottom-links"><a href="https://github.com/tBeltty/tbelt-code-public/issues/new/choose">Report a problem</a> <a href="/changelog">Changelog</a> <a href="/privacy">Privacy</a></span>
    </div>
  </footer>
</body>
</html>
`
}
