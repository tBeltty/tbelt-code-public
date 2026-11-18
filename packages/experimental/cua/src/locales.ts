/** Locale-owned application-access approval messages. */

/** English application-access messages. */
export const en = {
  question: 'Allow computer use to launch, read, capture and control this application?',
  detail: 'Session access lasts until tBelt Code restarts or computer use is disabled.',
  approve: 'Allow for this session',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  question: '¿Permitir que Computer Use inicie, lea, capture y controle esta aplicación?',
  detail: 'El acceso de esta sesión dura hasta que se reinicie tBelt Code o se desactive Computer Use.',
  approve: 'Permitir durante esta sesión',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked against the English keys. */
export const el = {
  question: 'Να επιτραπεί στη χρήση υπολογιστή να εκκινήσει, να διαβάσει, να καταγράψει και να ελέγξει αυτήν την εφαρμογή;',
  detail: 'Η πρόσβαση συνεδρίας διαρκεί έως ότου γίνει επανεκκίνηση του tBelt Code ή απενεργοποιηθεί η χρήση υπολογιστή.',
  approve: 'Να επιτρέπεται για αυτήν τη συνεδρία',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  question: 'Autoriser Computer Use à lancer, lire, capturer et contrôler cette application ?',
  detail: 'L’autorisation de cette session reste valable jusqu’au redémarrage de tBelt Code ou à la désactivation de Computer Use.',
  approve: 'Autoriser pour cette session',
} satisfies Record<keyof typeof en, string>

/** Display translations resolved by the Client; wire choices stay unchanged. */
export const applicationAccessDisplay = {
  question: { en: en.question, es: es.question, el: el.question, fr: fr.question },
  detail: { en: en.detail, es: es.detail, el: el.detail, fr: fr.detail },
  approve: { en: en.approve, es: es.approve, el: el.approve, fr: fr.approve },
}

/** Window consent never grants access to sibling windows or application launch. */
export const windowAccessQuestion = {
  en: 'Allow computer use to read, capture and control this window?',
  zh: '允许电脑操作读取、截图并控制这个窗口吗？',
  ja: 'このウィンドウの読み取り、撮影、操作を許可しますか？',
  es: '¿Permitir leer, capturar y controlar esta ventana?',
  fr: 'Autoriser la lecture, la capture et le contrôle de cette fenêtre ?',
  de: 'Lesen, Aufnehmen und Steuern dieses Fensters erlauben?',
  ru: 'Разрешить чтение, снимки и управление этим окном?',
  pt: 'Permitir ler, capturar e controlar esta janela?',
}
/** Launch consent does not grant access to resulting windows. */
export const launchAccessQuestion = {
  en: 'Allow computer use to launch this entry? Window access is requested separately.',
  zh: '允许电脑操作启动这个入口吗？窗口访问将单独请求授权。',
  ja: 'この項目の起動を許可しますか？ウィンドウへのアクセスは別途確認します。',
  es: '¿Permitir iniciar esta entrada? El acceso a ventanas se solicita por separado.',
  fr: 'Autoriser le lancement de cette entrée ? L’accès aux fenêtres sera demandé séparément.',
  de: 'Diesen Eintrag starten? Fensterzugriff wird separat angefragt.',
  ru: 'Разрешить запуск? Доступ к окнам запрашивается отдельно.',
  pt: 'Permitir iniciar esta entrada? O acesso às janelas é solicitado separadamente.',
}
