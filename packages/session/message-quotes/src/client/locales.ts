/** Copy owned by the Quote interaction plugin. */

/** Quote plugin dictionary namespace. */
export const NS = 'messageQuotes'

/** Supported Quote interaction copy keys. */
export type MessageQuotesKey = keyof typeof en

/** English dictionary. */
export const en = {
  'quote.add': 'Quote text',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'quote.add': 'Texto de cotización',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked against the English keys. */
export const el = {
  'quote.add': 'Παράθεση κειμένου',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'quote.add': 'Texte de citation',
} satisfies Record<keyof typeof en, string>
