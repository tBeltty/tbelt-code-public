import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { es as commonEs } from '@deepseek-ai/dsh-client-locale/src/locales/es.ts'
import { attachmentErrorText, imageSizeText } from '../src/client/image-labels.ts'
import { en, es } from '../src/client/locales.ts'

const t = makeTranslate(es, commonEs)
const enT = makeTranslate(en, commonEs)

describe('attachment rejection copy', () => {
  const limits = {
    maxImageBytes: 5 * 1024 * 1024,
    maxImagesPerMessage: 20,
    maxMessageImageBytes: 100 * 1024 * 1024,
    maxImagePixels: 40_000_000,
    maxImageDimension: 2000,
    mediaTypes: ['image/png'] as const,
  }

  it('renders megabytes without a trailing fraction unless one exists', () => {
    expect(imageSizeText(10 * 1024 * 1024)).toBe('10MB')
    expect(imageSizeText(2.5 * 1024 * 1024)).toBe('2.5MB')
  })

  it('maps user-solvable reasons to limit-naming copy', () => {
    expect(attachmentErrorText(t, 'MODEL_DOES_NOT_SUPPORT_IMAGES')).toBe('El modelo actual no admite imágenes; cambia a uno que sí')
    expect(attachmentErrorText(t, 'IMAGE_TOO_MANY_PIXELS')).toBe('La resolución de la imagen es demasiado alta; comprímela e inténtalo de nuevo')
    expect(attachmentErrorText(t, 'INVALID_IMAGE')).toBe('Solo se admiten imágenes PNG, JPG, WebP y GIF')
    expect(attachmentErrorText(t, 'IMAGE_TYPE_MISMATCH')).toBe('Solo se admiten imágenes PNG, JPG, WebP y GIF')
    expect(attachmentErrorText(t, 'TOO_MANY_IMAGES', limits)).toBe('Un mensaje puede incluir hasta 20 imágenes')
    expect(attachmentErrorText(t, 'IMAGE_TOO_LARGE', limits)).toBe('Cada imagen debe pesar menos de 5MB')
    expect(attachmentErrorText(t, 'IMAGES_TOO_LARGE', limits)).toBe('Las imágenes superan 100MB en total; quita algunas e inténtalo de nuevo')
    expect(attachmentErrorText(t, 'IMAGE_DIMENSION_TOO_LARGE', limits)).toBe('Los lados de la imagen deben medir como máximo 2000px; reduce su tamaño e inténtalo de nuevo')
    expect(attachmentErrorText(enT, 'TOO_MANY_IMAGES', limits)).toBe('A message can include up to 20 images')
  })

  it('folds unknown reasons and limit reasons without projected limits into the send-failed line', () => {
    expect(attachmentErrorText(t, 'INVALID_IMAGE_BASE64')).toBe('No se pudieron enviar las imágenes (INVALID_IMAGE_BASE64); vuelve a añadirlas e inténtalo de nuevo')
    expect(attachmentErrorText(t, 'TOO_MANY_IMAGES')).toBe('No se pudieron enviar las imágenes (TOO_MANY_IMAGES); vuelve a añadirlas e inténtalo de nuevo')
    expect(attachmentErrorText(t, 'IMAGE_TOO_LARGE')).toBe('No se pudieron enviar las imágenes (IMAGE_TOO_LARGE); vuelve a añadirlas e inténtalo de nuevo')
    expect(attachmentErrorText(t, 'IMAGES_TOO_LARGE')).toBe('No se pudieron enviar las imágenes (IMAGES_TOO_LARGE); vuelve a añadirlas e inténtalo de nuevo')
    expect(attachmentErrorText(t, 'IMAGE_DIMENSION_TOO_LARGE')).toBe('No se pudieron enviar las imágenes (IMAGE_DIMENSION_TOO_LARGE); vuelve a añadirlas e inténtalo de nuevo')
  })
})
