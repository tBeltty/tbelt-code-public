/** English labels for the NodeJS Inspector bottom panel and command; key-set source of truth. */
export const en = {
  title: 'NodeJS Inspector',
  toggle: 'Toggle NodeJS Inspector',
  close: 'Collapse',
  resize: 'Resize NodeJS Inspector panel',
  frameTitle: 'NodeJS Inspector',
}

/** Spanish labels, checked complete against the English key set. */
export const es: Record<keyof typeof en, string> = {
  title: 'Inspector de NodeJS',
  toggle: 'Mostrar u ocultar el Inspector de NodeJS',
  close: 'Contraer',
  resize: 'Cambiar el tamaño del panel del Inspector de NodeJS',
  frameTitle: 'Inspector de NodeJS',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shared Inspector frontend copy. */
    inspectorPanel: keyof typeof en
  }
}
