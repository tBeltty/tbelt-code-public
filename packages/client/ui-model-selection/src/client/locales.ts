/**
 * `model` namespace dictionaries.
 *
 * `trigger.selectAria` intentionally matches `trigger.fallback` but remains a
 * separate key: the visible fallback label and the accessible name of
 * an unset trigger are free to diverge per locale, and folding it into
 * `trigger.aria` would announce the degenerate "Select model, current Select
 * model".
 */

/** The model namespace key union. */
export type ModelKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'provider.account': 'DeepSeek Account',
  'command.label': 'Model',
  'command.description': 'Select the model for this conversation',
  'option.loadError': 'Catalog failed to load: {message}',
  'trigger.fallback': 'Select model',
  'trigger.loading': 'Loading models…',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
  'menu.aria': 'Model and reasoning effort',
  'menu.model': 'Model',
  'menu.effort': 'Effort',
  'effort.providerDefault': 'Default',
  'status.loading': 'Refreshing model list…',
  'error.action': 'Model operation failed: {message}',
  'error.sessionInUse': 'This session is already in use, possibly by another running tBelt Code instance (such as the terminal or the desktop app). Quit other running tBelt Code instances and try again.',
  'action.reload': 'Reload',
  'action.addModel': 'Add model…',
  'spend.ofLimit': '{spent} / {limit}',
  'spend.session': 'This session {reading}',
  'spend.month': 'This month {reading}',
  'spend.unpriced': '{count} calls used a model with no price and are not counted',
  'spend.nearSession': 'This session is close to its spend limit',
  'spend.nearMonth': 'This month is close to its spend limit',
  'warning.groupLoad': '{name} failed to load: {message}',
  'search.placeholder': 'Search models…',
  'search.clear': 'Clear search',
  'search.empty': 'No matching models.',
  'empty.models': 'No models available.',
  'empty.efforts': 'This model provides no reasoning effort levels.',
  'price.short': '{input} / {output}',
  'price.title': 'Per million tokens: input {input}, output {output}',
  'price.titleCache': 'Per million tokens: input {input}, output {output}, cache read {cacheRead}',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'provider.account': 'Cuenta de DeepSeek',
  'command.label': 'Modelo',
  'command.description': 'Elige el modelo de esta conversación',
  'option.loadError': 'No se pudo cargar el catálogo: {message}',
  'trigger.fallback': 'Elegir modelo',
  'trigger.loading': 'Cargando modelos…',
  'trigger.selectAria': 'Elegir modelo',
  'trigger.aria': 'Elegir modelo, actual: {model}',
  'trigger.ariaEffort': 'Elegir modelo, actual: {model}, esfuerzo de razonamiento {effort}',
  'menu.aria': 'Modelo y esfuerzo de razonamiento',
  'menu.model': 'Modelo',
  'menu.effort': 'Esfuerzo',
  'effort.providerDefault': 'Predeterminado',
  'status.loading': 'Actualizando la lista de modelos…',
  'error.action': 'Falló la operación del modelo: {message}',
  'error.sessionInUse': 'Esta sesión ya está en uso, quizá por otra instancia de tBelt Code en ejecución (como el terminal o la aplicación de escritorio). Cierra las demás instancias de tBelt Code e inténtalo de nuevo.',
  'action.reload': 'Recargar',
  'action.addModel': 'Añadir modelo…',
  'spend.ofLimit': '{spent} de {limit}',
  'spend.session': 'Esta sesión {reading}',
  'spend.month': 'Este mes {reading}',
  'spend.unpriced': '{count} llamadas usaron un modelo sin precio y no se cuentan',
  'spend.nearSession': 'Esta sesión está cerca de su límite de gasto',
  'spend.nearMonth': 'Este mes está cerca del límite de gasto',
  'warning.groupLoad': 'No se pudo cargar {name}: {message}',
  'search.placeholder': 'Buscar modelos…',
  'search.clear': 'Borrar búsqueda',
  'search.empty': 'Ningún modelo coincide.',
  'empty.models': 'No hay modelos disponibles.',
  'empty.efforts': 'Este modelo no ofrece niveles de esfuerzo de razonamiento.',
  'price.short': '{input} / {output}',
  'price.title': 'Por millón de tokens: entrada {input}, salida {output}',
  'price.titleCache': 'Por millón de tokens: entrada {input}, salida {output}, lectura de caché {cacheRead}',
} satisfies Record<keyof typeof en, string>
