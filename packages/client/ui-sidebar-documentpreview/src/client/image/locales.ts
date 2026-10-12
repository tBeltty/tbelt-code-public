import { zoomEn, zoomEs } from '../zoom/locales.ts'

/** Image renderer dictionary keys. */
export type ImagePreviewKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  ...zoomEn,
  title: 'Image',
  preview: 'Image preview: {name}',
  loading: 'Rendering document...',
  failed: 'This image could not be displayed.',
  unsupported: 'Image preview requires the complete file contents.',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  ...zoomEs,
  title: 'Imagen',
  preview: 'Vista previa de imagen: {name}',
  loading: 'Renderizando documento...',
  failed: 'No se pudo mostrar esta imagen.',
  unsupported: 'La vista previa de imágenes necesita el contenido completo del archivo.',
} satisfies Record<keyof typeof en, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Image preview selection, accessible name, and status text. */
    sidebarImage: ImagePreviewKey
  }
}
