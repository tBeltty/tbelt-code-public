/** Render a complete persistence documentation artifact without Git or file mutation. */

/** One repository-relative generated file and its complete UTF-8 content. */
export interface PersistenceArtifact {
  readonly path: string
  readonly content: string
}

/**
 * Render one persistence document as a generated artifact.
 * @param source - repository-relative document path.
 * @param en - complete authored or generated Markdown.
 * @returns the single document, without writing files.
 */
export function renderPersistenceArtifact(source: string, en: string): PersistenceArtifact[] {
  return [{ path: source, content: en }]
}
