// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type {
  ComposerAttachment, ComposerAttachmentsOwnerProps, ComposerAttachmentsProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ComposerAttachments } from '../src/client/ComposerAttachments.tsx'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = ((key: string, params?: Readonly<Record<string, unknown>>): string => {
  const messages: Record<string, string> = {
    'attachment.pending': 'Adjuntos pendientes',
    'attachment.scrollLeft': 'Desplazar adjuntos a la izquierda',
    'attachment.scrollRight': 'Desplazar adjuntos a la derecha',
    'file.pending': 'Archivos pendientes',
    'file.uploading': 'Subiendo…',
    'file.uploadFailed': 'Falló la subida; haz clic para reintentar',
    'file.label': 'Archivo',
    'image.pending': 'Imágenes pendientes',
    'image.original': 'Imagen original',
    'image.preview': 'Vista previa de la imagen original',
    'image.closePreview': 'Cerrar vista previa de la imagen original',
    'image.openOriginal': 'Ver original',
    'attachment.dropBlocked': 'Ahora no se pueden añadir archivos ni imágenes',
    'attachment.dropTitle': 'Arrastra archivos o imágenes aquí para añadirlos',
  }
  if (key === 'file.remove') {
    const name = params?.name
    return `Quitar el archivo ${typeof name === 'string' ? name : ''}`
  }
  if (key === 'file.insertAsText') return 'Insertar como texto'
  if (key === 'file.insertAsTextNamed') {
    const name = params?.name
    return `Insertar ${typeof name === 'string' ? name : ''} en el borrador como texto`
  }
  if (key === 'file.retry') {
    const name = params?.name
    return `Reintentar la subida de ${typeof name === 'string' ? name : ''}`
  }
  if (key === 'image.remove') {
    const name = params?.name
    return `Quitar la imagen ${typeof name === 'string' ? name : ''}`
  }
  if (key === 'attachment.dropDesc') {
    const count = params?.count
    const size = params?.size
    return `Límite de imágenes: hasta ${typeof count === 'number' ? String(count) : ''}, de ${typeof size === 'string' ? size : ''} cada una`
  }
  return messages[key] ?? key
}) as ComposerAttachmentsProps['t']

function attachment(id: string, name = `${id}.png`): ComposerAttachment {
  return {
    kind: 'image',
    id: id as ComposerAttachment['id'],
    file: new File([Uint8Array.of(1)], name, { type: 'image/png' }),
    previewUrl: `blob:${id}`,
  }
}

function fileDraft(id: string, name = `${id}.pdf`): ComposerAttachment {
  return {
    kind: 'file',
    id: id as ComposerAttachment['id'],
    file: new File([Uint8Array.of(1, 2, 3)], name, { type: 'application/pdf' }),
  }
}

function props(overrides: Partial<ComposerAttachmentsOwnerProps> = {}): ComposerAttachmentsProps {
  return {
    attachments: [],
    canAcceptDrop: true,
    onAddFiles: () => {},
    onRemoveAttachment: () => {},
    uploads: {},
    onRetryFile: () => {},
    pastedPreview: () => undefined,
    onReinsertPastedText: () => {},
    t,
    ...overrides,
  } as unknown as ComposerAttachmentsProps
}

describe('ComposerAttachments', () => {
  it('accepts file drops anywhere on the document and keeps non-file drags native', () => {
    const onAddFiles = vi.fn()
    const view = render(<ComposerAttachments {...props({
      onAddFiles,
      dropLimits: { count: 20, size: '5MB' },
    })} />)

    expect(fireEvent.dragEnter(document.body, { dataTransfer: null })).toBe(true)
    const textTransfer = { types: ['text/plain'], files: [], dropEffect: 'none' }
    expect(fireEvent.dragEnter(document.body, { dataTransfer: textTransfer })).toBe(true)
    expect(fireEvent.dragOver(document.body, { dataTransfer: textTransfer })).toBe(true)
    expect(fireEvent.drop(document.body, { dataTransfer: textTransfer })).toBe(true)
    expect(view.queryByRole('status')).toBeNull()

    const image = attachment('dropped').file
    const dataTransfer = { types: ['Files'], files: [image], items: [], dropEffect: 'none' }
    expect(fireEvent.dragEnter(document.body, { dataTransfer })).toBe(false)
    expect(view.getByRole('status').textContent).toContain('Arrastra archivos o imágenes aquí para añadirlos')
    expect(view.getByRole('status').textContent).toContain('Límite de imágenes: hasta 20, de 5MB cada una')
    expect(fireEvent.dragOver(document.body, { dataTransfer })).toBe(false)
    expect(dataTransfer.dropEffect).toBe('copy')
    expect(fireEvent.drop(document.body, { dataTransfer })).toBe(false)
    expect(onAddFiles).toHaveBeenCalledWith([image], new Set())
    expect(view.queryByRole('status')).toBeNull()
  })

  it('reports dropped directories from the entry API beside the dropped files', () => {
    const onAddFiles = vi.fn()
    render(<ComposerAttachments {...props({ onAddFiles })} />)
    const folder = new File([], 'project')
    const note = new File([Uint8Array.of(1)], 'notes.md', { type: 'text/markdown' })
    const entry = (isDirectory: boolean | null, file: File) => ({
      kind: 'file', getAsFile: () => new File([], file.name), webkitGetAsEntry: () => (isDirectory === null ? null : { isDirectory }),
    })
    fireEvent.drop(document.body, {
      dataTransfer: {
        types: ['Files'],
        files: [folder, note],
        items: [entry(true, folder), entry(false, note), { kind: 'string', getAsFile: () => null }],
        dropEffect: 'none',
      },
    })
    expect(onAddFiles).toHaveBeenCalledWith([folder, note], new Set([folder]))
    // An entry API that answers nothing, or a browser without it, reports no directories.
    fireEvent.drop(document.body, {
      dataTransfer: {
        types: ['Files'],
        files: [note],
        items: [entry(null, note), { kind: 'file', getAsFile: () => note }, entry(true, folder)],
        dropEffect: 'none',
      },
    })
    expect(onAddFiles).toHaveBeenLastCalledWith([note], new Set())
  })

  it('tracks nested file drags and clears an aborted drag', () => {
    const view = render(<ComposerAttachments {...props()} />)
    const dataTransfer = { types: ['Files'], files: [], items: [], dropEffect: 'none' }
    fireEvent.dragLeave(document.body, {
      dataTransfer: { types: ['text/plain'], files: [], dropEffect: 'none' },
    })
    fireEvent.dragEnter(document.body, { dataTransfer })
    fireEvent.dragEnter(document.body, { dataTransfer })
    fireEvent.dragLeave(document.body, { dataTransfer, clientX: 5, clientY: 5 })
    expect(view.getByRole('status')).toBeTruthy()
    fireEvent.dragLeave(document.body, { dataTransfer, clientX: 5, clientY: 5 })
    expect(view.queryByRole('status')).toBeNull()
    fireEvent.dragEnter(document.documentElement, { dataTransfer })
    const leftViewport = new Event('dragleave', { bubbles: true, cancelable: true })
    Object.defineProperties(leftViewport, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: -1 },
      clientY: { value: 5 },
    })
    fireEvent(document.documentElement, leftViewport)
    expect(view.queryByRole('status')).toBeNull()
    fireEvent.dragEnter(document.body, { dataTransfer })
    fireEvent.dragEnd(window, { dataTransfer })
    expect(view.queryByRole('status')).toBeNull()
  })

  it('shows a blocked drop without forwarding its files', () => {
    const onAddFiles = vi.fn()
    const view = render(<ComposerAttachments {...props({ canAcceptDrop: false, onAddFiles })} />)
    const image = attachment('blocked').file
    const dataTransfer = { types: ['Files'], files: [image], items: [], dropEffect: 'copy' }
    fireEvent.dragEnter(document.body, { dataTransfer })
    expect(view.getByRole('status').textContent).toBe('Ahora no se pueden añadir archivos ni imágenes')
    fireEvent.dragOver(document.body, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('none')
    fireEvent.drop(document.body, { dataTransfer })
    expect(onAddFiles).not.toHaveBeenCalled()
    expect(view.queryByRole('status')).toBeNull()
  })

  it('routes rail removal and closes previews on Escape or attachment removal', () => {
    const onRemoveAttachment = vi.fn()
    const image = attachment('draft-1', 'pixel.png')
    const initial = props({ attachments: [image], onRemoveAttachment })
    const view = render(<ComposerAttachments {...initial} />)

    fireEvent.click(view.getByRole('button', { name: 'Quitar la imagen pixel.png' }))
    expect(onRemoveAttachment).toHaveBeenCalledWith(image.id)
    fireEvent.click(view.getByTitle('Ver original'))
    expect(view.getByRole('dialog', { name: 'Vista previa de la imagen original' })).toBeTruthy()
    view.rerender(<ComposerAttachments {...props({ attachments: [], onRemoveAttachment })} />)
    expect(view.queryByRole('dialog', { name: 'Vista previa de la imagen original' })).toBeNull()

    view.rerender(<ComposerAttachments {...initial} />)
    fireEvent.click(view.getByTitle('Ver original'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(view.queryByRole('dialog', { name: 'Vista previa de la imagen original' })).toBeNull()
  })

  it('keeps images and files in pick order inside one attachment rail', () => {
    const view = render(<ComposerAttachments {...props({
      attachments: [attachment('first'), fileDraft('middle'), attachment('last')],
      uploads: {
        middle: {
          status: 'ready', receiptId: 'receipt-middle' as never,
          file: { attachmentId: 'file-middle' as never, name: 'middle.pdf', bytes: 3 },
        },
      },
    })} />)
    const rail = view.getByRole('group', { name: 'Adjuntos pendientes' })
    expect([...rail.children].map((child) => {
      const image = child.querySelector('img')
      return image?.getAttribute('alt') ?? child.querySelector('[title]')?.getAttribute('title')
    })).toEqual(['first.png', 'middle.pdf', 'last.png'])
    expect(view.queryByRole('group', { name: 'Archivos pendientes' })).toBeNull()
  })

  it('labels an unnamed attachment and its original-image preview', () => {
    const image = attachment('unnamed', '')
    const view = render(<ComposerAttachments {...props({ attachments: [image] })} />)
    expect(view.getByAltText('Imágenes pendientes')).toBeTruthy()
    fireEvent.click(view.getByTitle('Ver original'))
    expect(view.getByAltText('Imagen original')).toBeTruthy()
  })
})

describe('ComposerAttachments file drafts', () => {
  it('renders uploading, ready, and failed cards with remove and retry affordances', () => {
    const onRemoveAttachment = vi.fn()
    const onRetryFile = vi.fn()
    const view = render(<ComposerAttachments {...props({
      attachments: [fileDraft('up'), fileDraft('ok'), fileDraft('bad')],
      uploads: {
        up: { status: 'uploading', loaded: 1, total: 4 },
        ok: {
          status: 'ready', receiptId: 'receipt-ok' as never,
          file: { attachmentId: 'file-ok' as never, name: 'ok.pdf', bytes: 3 },
        },
        bad: { status: 'error', message: 'boom' },
      },
      onRemoveAttachment,
      onRetryFile,
    })} />)
    const group = view.getByRole('group', { name: 'Adjuntos pendientes' })
    expect(group.textContent).toContain('Subiendo…')
    expect(view.container.querySelector('[style="width: 25%;"]')).toBeTruthy()
    expect(group.textContent).toContain('ok.pdf')
    expect(group.textContent).toContain('PDF 3B')
    expect(group.textContent).toContain('Falló la subida; haz clic para reintentar')
    fireEvent.click(view.getByRole('button', { name: 'Reintentar la subida de bad.pdf' }))
    expect(onRetryFile).toHaveBeenCalledWith('bad')
    fireEvent.click(view.getByRole('button', { name: 'Quitar el archivo ok.pdf' }))
    expect(onRemoveAttachment).toHaveBeenCalledWith('ok')
  })

  it('shows the preview of a pasted-text file and reinserts it on request', () => {
    const onReinsertPastedText = vi.fn()
    const view = render(<ComposerAttachments {...props({
      attachments: [fileDraft('plain'), fileDraft('long', 'pasted-text-1.md')],
      uploads: {
        plain: { status: 'uploading', loaded: 0 },
        long: { status: 'uploading', loaded: 0 },
      },
      pastedPreview: id => id === 'long' ? 'Primera línea\nSegunda línea' : undefined,
      onReinsertPastedText,
    })} />)
    expect(view.container.querySelectorAll('pre')).toHaveLength(1)
    expect(view.container.querySelector('pre')!.textContent).toBe('Primera línea\nSegunda línea')
    fireEvent.click(view.getByRole('button', { name: 'Insertar pasted-text-1.md en el borrador como texto' }))
    expect(onReinsertPastedText).toHaveBeenCalledWith('long')
  })

  it('treats a draft without upload state as uploading and keeps retry separate from remove', () => {
    const onRetryFile = vi.fn()
    const onRemoveAttachment = vi.fn()
    const view = render(<ComposerAttachments {...props({
      attachments: [fileDraft('pending'), fileDraft('bad')],
      uploads: { bad: { status: 'error', message: 'boom' } },
      onRetryFile,
      onRemoveAttachment,
    })} />)
    expect(view.getByRole('group', { name: 'Adjuntos pendientes' }).textContent).toContain('Subiendo…')
    const retry = view.getByRole('button', { name: 'Reintentar la subida de bad.pdf' })
    const remove = view.getByRole('button', { name: 'Quitar el archivo bad.pdf' })
    expect(retry.contains(remove)).toBe(false)
    fireEvent.click(remove)
    expect(onRemoveAttachment).toHaveBeenCalledWith('bad')
    expect(onRetryFile).not.toHaveBeenCalled()
    fireEvent.click(retry)
    expect(onRetryFile).toHaveBeenCalledWith('bad')
  })

  it('uses the localized file label when the browser supplies no name', () => {
    const view = render(<ComposerAttachments {...props({
      attachments: [fileDraft('unnamed', '')],
      uploads: {
        unnamed: {
          status: 'ready', receiptId: 'receipt-unnamed' as never,
          file: { attachmentId: 'file-unnamed' as never, name: 'file', bytes: 3 },
        },
      },
    })} />)
    const group = view.getByRole('group', { name: 'Adjuntos pendientes' })
    expect(group.textContent).toContain('Archivo')
    expect(group.textContent).toContain('3B')
  })

  it('uses the shared leading-dot suffix in ready-file metadata', () => {
    const view = render(<ComposerAttachments {...props({
      attachments: [fileDraft('env', '.env')],
      uploads: {
        env: {
          status: 'ready', receiptId: 'receipt-env' as never,
          file: { attachmentId: 'file-env' as never, name: '.env', bytes: 3 },
        },
      },
    })} />)
    expect(view.getByTitle('.env').textContent).toContain('ENV 3B')
  })
})
