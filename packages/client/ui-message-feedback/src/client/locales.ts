/** `feedback` namespace dictionaries. */

/** The feedback namespace key union. */
export type MessageFeedbackKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The feedback surface's copy: the message controls, the dialog, and the acknowledgement. */
    feedback: MessageFeedbackKey
  }
}

/** English dictionary and key-set source of truth. */
export const en = {
  'action.like': 'Good response',
  'action.likeActive': 'Remove rating',
  'action.dislike': 'Bad response',
  'action.dislikeActive': 'Remove rating',
  'dialog.title': 'Submit feedback',
  'dialog.categories': 'Feedback category',
  'dialog.detail': 'Feedback details',
  'dialog.hint': 'Add details to help us improve. Your submission will include the current conversation log.',
  'category.task-result': 'Task result',
  'category.instruction-following': 'Instruction understanding and following',
  'category.product-interaction': 'Product features and interaction',
  'category.service-stability': 'Stability and speed',
  'category.resource-cost': 'Resource usage and cost',
  'category.security-privacy-permission': 'Security, privacy, and permissions',
  'category.other': 'Other',
  'toast.recorded': 'Thanks for your feedback',
  'error.conflict': 'This feedback changed elsewhere; the latest state is shown',
  'error.load': 'Could not load feedback',
  'error.generic': 'Could not save feedback',
  'error.noteTooLarge': 'The description is too long; shorten it and submit again',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'action.like': 'Buena respuesta',
  'action.likeActive': 'Quitar valoración',
  'action.dislike': 'Mala respuesta',
  'action.dislikeActive': 'Quitar valoración',
  'dialog.title': 'Enviar comentarios',
  'dialog.categories': 'Categoría del comentario',
  'dialog.detail': 'Detalles del comentario',
  'dialog.hint': 'Añade detalles para ayudarnos a mejorar. El envío incluirá el registro de la conversación actual.',
  'category.task-result': 'Resultado de la tarea',
  'category.instruction-following': 'Comprensión y seguimiento de instrucciones',
  'category.product-interaction': 'Funciones del producto e interacción',
  'category.service-stability': 'Estabilidad y velocidad',
  'category.resource-cost': 'Uso de recursos y coste',
  'category.security-privacy-permission': 'Seguridad, privacidad y permisos',
  'category.other': 'Otro',
  'toast.recorded': 'Gracias por tus comentarios',
  'error.conflict': 'Este comentario cambió en otro lugar; se muestra el estado más reciente',
  'error.load': 'No se pudieron cargar los comentarios',
  'error.generic': 'No se pudieron guardar los comentarios',
  'error.noteTooLarge': 'La descripción es demasiado larga; acórtala y envía de nuevo',
} satisfies Record<keyof typeof en, string>
