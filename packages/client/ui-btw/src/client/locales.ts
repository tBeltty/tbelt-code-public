/** `btw` namespace dictionaries. */

/** The btw namespace key union. */
export type BtwKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The side-conversation dialog's copy: its heading, thread, actions, and failures. */
    btw: BtwKey
  }
}

/** English dictionary and key-set source of truth. */
export const en = {
  'dialog.title': 'Side question',
  'dialog.description': 'Ask while the agent keeps working. Nothing here interrupts it.',
  'thread.label': 'Side conversation',
  'thread.empty': 'Ask anything about the current work. The agent is not interrupted.',
  'thread.you': 'You',
  'thread.assistant': 'Answer',
  'thread.pending': 'Thinking…',
  'thread.sent': 'Sent to chat',
  'input.label': 'Your question',
  'input.placeholder': 'Ask a side question',
  'action.ask': 'Ask',
  'action.asking': 'Asking…',
  'action.send': 'Send context to chat',
  'action.sending': 'Sending…',
  'action.clear': 'Clear',
  'close': 'Close',
  'toast.sent': 'Context sent to chat',
  'error.busy': 'The previous question is still being answered',
  'error.noRoute': 'Choose a model in the main chat first',
  'error.model': 'The model could not answer. Try again',
  'error.generic': 'The side conversation failed. Try again',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'dialog.title': 'Pregunta aparte',
  'dialog.description': 'Pregunta mientras el agente sigue trabajando. Nada de esto lo interrumpe.',
  'thread.label': 'Conversación aparte',
  'thread.empty': 'Pregunta lo que quieras sobre el trabajo en curso. El agente no se interrumpe.',
  'thread.you': 'Tú',
  'thread.assistant': 'Respuesta',
  'thread.pending': 'Pensando…',
  'thread.sent': 'Enviado al chat',
  'input.label': 'Tu pregunta',
  'input.placeholder': 'Haz una pregunta aparte',
  'action.ask': 'Preguntar',
  'action.asking': 'Preguntando…',
  'action.send': 'Enviar contexto a chat',
  'action.sending': 'Enviando…',
  'action.clear': 'Limpiar',
  'close': 'Cerrar',
  'toast.sent': 'Contexto enviado al chat',
  'error.busy': 'La pregunta anterior aún se está respondiendo',
  'error.noRoute': 'Elige primero un modelo en el chat principal',
  'error.model': 'El modelo no pudo responder. Inténtalo de nuevo',
  'error.generic': 'Falló la conversación aparte. Inténtalo de nuevo',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'dialog.title': 'Παράπλευρη ερώτηση',
  'dialog.description': 'Ρωτήστε ενώ ο πράκτορας συνεχίζει να εργάζεται. Τίποτα εδώ δεν τον διακόπτει.',
  'thread.label': 'Παράπλευρη συζήτηση',
  'thread.empty': 'Ρωτήστε οτιδήποτε για την τρέχουσα εργασία. Ο πράκτορας δεν διακόπτεται.',
  'thread.you': 'Εσείς',
  'thread.assistant': 'Απάντηση',
  'thread.pending': 'Σκέφτεται…',
  'thread.sent': 'Στάλθηκε στη συνομιλία',
  'input.label': 'Η ερώτησή σας',
  'input.placeholder': 'Κάντε μια παράπλευρη ερώτηση',
  'action.ask': 'Ερώτηση',
  'action.asking': 'Αποστολή ερώτησης…',
  'action.send': 'Αποστολή πλαισίου στη συνομιλία',
  'action.sending': 'Αποστολή…',
  'action.clear': 'Εκκαθάριση',
  'close': 'Κλείσιμο',
  'toast.sent': 'Το πλαίσιο στάλθηκε στη συνομιλία',
  'error.busy': 'Η προηγούμενη ερώτηση εξακολουθεί να απαντάται',
  'error.noRoute': 'Επιλέξτε πρώτα ένα μοντέλο στην κύρια συνομιλία',
  'error.model': 'Το μοντέλο δεν μπόρεσε να απαντήσει. Δοκιμάστε ξανά',
  'error.generic': 'Η παράπλευρη συζήτηση απέτυχε. Δοκιμάστε ξανά',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'dialog.title': 'Question à part',
  'dialog.description': 'Posez votre question pendant que l’agent continue de travailler. Rien ici ne l’interrompt.',
  'thread.label': 'Conversation à part',
  'thread.empty': 'Posez n’importe quelle question sur le travail en cours. L’agent n’est pas interrompu.',
  'thread.you': 'Vous',
  'thread.assistant': 'Réponse',
  'thread.pending': 'Réflexion…',
  'thread.sent': 'Envoyé dans la discussion',
  'input.label': 'Votre question',
  'input.placeholder': 'Posez une question à part',
  'action.ask': 'Demander',
  'action.asking': 'Envoi de la question…',
  'action.send': 'Envoyer le contexte dans la discussion',
  'action.sending': 'Envoi…',
  'action.clear': 'Effacer',
  'close': 'Fermer',
  'toast.sent': 'Contexte envoyé dans la discussion',
  'error.busy': 'La question précédente attend encore sa réponse',
  'error.noRoute': 'Choisissez d’abord un modèle dans la discussion principale',
  'error.model': 'Le modèle n’a pas pu répondre. Réessayez',
  'error.generic': 'La conversation à part a échoué. Réessayez',
} satisfies Record<keyof typeof en, string>
