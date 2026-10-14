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

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'action.like': 'Καλή απάντηση',
  'action.likeActive': 'Αφαίρεση βαθμολογίας',
  'action.dislike': 'Κακή απάντηση',
  'action.dislikeActive': 'Αφαίρεση βαθμολογίας',
  'dialog.title': 'Υποβολή σχολίων',
  'dialog.categories': 'Κατηγορία σχολίων',
  'dialog.detail': 'Λεπτομέρειες σχολίων',
  'dialog.hint': 'Προσθέστε λεπτομέρειες για να μας βοηθήσετε να βελτιωθούμε. Η υποβολή σας θα περιλαμβάνει το αρχείο καταγραφής της τρέχουσας συζήτησης.',
  'category.task-result': 'Αποτέλεσμα εργασίας',
  'category.instruction-following': 'Κατανόηση και τήρηση οδηγιών',
  'category.product-interaction': 'Λειτουργίες και αλληλεπίδραση με το προϊόν',
  'category.service-stability': 'Σταθερότητα και ταχύτητα',
  'category.resource-cost': 'Χρήση πόρων και κόστος',
  'category.security-privacy-permission': 'Ασφάλεια, απόρρητο και άδειες',
  'category.other': 'Άλλο',
  'toast.recorded': 'Ευχαριστούμε για τα σχόλιά σας',
  'error.conflict': 'Αυτά τα σχόλια άλλαξαν αλλού· εμφανίζεται η τελευταία κατάσταση',
  'error.load': 'Δεν ήταν δυνατή η φόρτωση των σχολίων',
  'error.generic': 'Δεν ήταν δυνατή η αποθήκευση των σχολίων',
  'error.noteTooLarge': 'Η περιγραφή είναι πολύ μεγάλη· συντομεύστε την και υποβάλετέ την ξανά',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'action.like': 'Bonne réponse',
  'action.likeActive': 'Retirer la note',
  'action.dislike': 'Mauvaise réponse',
  'action.dislikeActive': 'Retirer la note',
  'dialog.title': 'Envoyer un avis',
  'dialog.categories': 'Catégorie de l’avis',
  'dialog.detail': 'Détails de l’avis',
  'dialog.hint': 'Ajoutez des détails pour nous aider à nous améliorer. Votre envoi inclura le journal de la conversation en cours.',
  'category.task-result': 'Résultat de la tâche',
  'category.instruction-following': 'Compréhension et respect des consignes',
  'category.product-interaction': 'Fonctionnalités et interaction avec le produit',
  'category.service-stability': 'Stabilité et rapidité',
  'category.resource-cost': 'Consommation de ressources et coût',
  'category.security-privacy-permission': 'Sécurité, confidentialité et autorisations',
  'category.other': 'Autre',
  'toast.recorded': 'Merci pour votre avis',
  'error.conflict': 'Cet avis a été modifié ailleurs\u00a0; l’état le plus récent est affiché',
  'error.load': 'Impossible de charger l’avis',
  'error.generic': 'Impossible d’enregistrer l’avis',
  'error.noteTooLarge': 'La description est trop longue\u00a0; raccourcissez-la et renvoyez-la',
} satisfies Record<keyof typeof en, string>
