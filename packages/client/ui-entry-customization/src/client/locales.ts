/** Copy for the More menu rows: navigation actions, and Creator draft prompts per region. */
export const en = {
  install: 'Browse other plugins',
  create: 'Create your plugin',
  'createPrompt.sidebar': 'Create a tBelt Code plugin with a left sidebar entry.',
  'createPrompt.conversation': 'Create a tBelt Code conversation view plugin.',
  'createPrompt.rightbar': 'Create a tBelt Code plugin with a right sidebar entry.',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  install: 'Explorar otros complementos',
  create: 'Crea tu complemento',
  'createPrompt.sidebar': 'Cree un complemento tBelt Code con una entrada en la barra lateral izquierda.',
  'createPrompt.conversation': 'Cree un complemento de vista de conversación tBelt Code.',
  'createPrompt.rightbar': 'Cree un complemento tBelt Code con una entrada en la barra lateral derecha.',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked against the English keys. */
export const el = {
  install: 'Περιήγηση σε άλλα πρόσθετα',
  create: 'Δημιουργήστε το πρόσθετό σας',
  'createPrompt.sidebar': 'Δημιουργία ενός προσθέτου tBelt Code με καταχώριση στην αριστερή πλαϊνή στήλη.',
  'createPrompt.conversation': 'Δημιουργία ενός προσθέτου tBelt Code για προβολή συνομιλίας.',
  'createPrompt.rightbar': 'Δημιουργία ενός προσθέτου tBelt Code με καταχώριση στη δεξιά πλαϊνή στήλη.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  install: "Parcourir d'autres plugins",
  create: 'Créez votre plugin',
  'createPrompt.sidebar': 'Créez un plugin tBelt Code avec une entrée dans la barre latérale gauche.',
  'createPrompt.conversation': "Créez un plugin d'affichage de conversation tBelt Code.",
  'createPrompt.rightbar': 'Créez un plugin tBelt Code avec une entrée dans la barre latérale droite.',
} satisfies Record<keyof typeof en, string>
