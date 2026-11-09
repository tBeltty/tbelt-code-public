/**
 * Browser half of the browse directory-picker backend: fills ui-workspace's
 * two directory-flow holes with the in-app Select Workspace Directory dialog
 * (figma `Harness` 813-23126 family), driving the node half's
 * `directoryPicker/list`/`directoryPicker/createDirectory` primitives.
 * Mounting this package therefore composes both sides of the browse
 * interaction with one cordis.yml row; no client code branches on a
 * capability kind. The dialog's copy is locale-registered here — the flow
 * package owns its own strings.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the SlotMap merge declaring the directory-flow holes.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { BrowseFlowInjected } from './flow.ts'
import { BrowseDirectoryFlow } from './flow.ts'

/** Locale namespace owning the browser dialog's copy. */
const LOCALE_NS = 'directory-browser'

/** Required services (cordis fiber inject): the slot registry, workspace UI service, and locale. */
export const inject = ['slots', 'uiWorkspace', 'locale']

/**
 * Client plugin body: register the dialog's dictionaries and the browse flow
 * into both directory-flow holes through `slots.inject()` because the
 * ui-workspace entries may activate later or replace their declarations.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    // The dictionaries land as a unit: if a later registration hits a
    // rival owner of the namespace, the earlier ones roll back before the throw —
    // a failed activation must not squat the namespace's other locale.
    const disposers: (() => void)[] = []
    const dictionaries: [locale: string, dict: Record<string, string>][] = [
      ['en', {
        'browser.title': 'Select Workspace Directory',
        'browser.home': 'Home',
        'browser.newFolder': 'New folder',
        'browser.folderName': 'Folder name',
        'browser.createIn': 'New folder in "{name}"',
        'browser.untitledFolder': 'Untitled folder',
        'browser.create': 'Create',
        'browser.cancel': 'Cancel',
        'browser.open': 'Open',
        'browser.editPath': 'Edit path',
        'browser.loading': 'Loading…',
        'browser.truncated': 'Too many folders to list; only the beginning is shown.',
        'browser.showHidden': 'Show hidden files',
      }],
      ['es', {
        'browser.title': 'Elegir carpeta del espacio de trabajo',
        'browser.home': 'Inicio',
        'browser.newFolder': 'Nueva carpeta',
        'browser.folderName': 'Nombre de la carpeta',
        'browser.createIn': 'Nueva carpeta en "{name}"',
        'browser.untitledFolder': 'Carpeta sin título',
        'browser.create': 'Crear',
        'browser.cancel': 'Cancelar',
        'browser.open': 'Abrir',
        'browser.editPath': 'Editar ruta',
        'browser.loading': 'Cargando…',
        'browser.truncated': 'Hay demasiadas carpetas para listarlas; solo se muestra el principio.',
        'browser.showHidden': 'Mostrar archivos ocultos',
      }],
      ['el', {
        'browser.title': 'Επιλογή φακέλου χώρου εργασίας',
        'browser.home': 'Αρχική',
        'browser.newFolder': 'Νέος φάκελος',
        'browser.folderName': 'Όνομα φακέλου',
        'browser.createIn': 'Νέος φάκελος στο «{name}»',
        'browser.untitledFolder': 'Φάκελος χωρίς όνομα',
        'browser.create': 'Δημιουργία',
        'browser.cancel': 'Ακύρωση',
        'browser.open': 'Άνοιγμα',
        'browser.editPath': 'Επεξεργασία διαδρομής',
        'browser.loading': 'Φόρτωση…',
        'browser.truncated': 'Υπάρχουν πάρα πολλοί φάκελοι για να εμφανιστούν· εμφανίζεται μόνο η αρχή.',
        'browser.showHidden': 'Εμφάνιση κρυφών αρχείων',
      }],
      ['fr', {
        'browser.title': 'Choisir le dossier de l’espace de travail',
        'browser.home': 'Accueil',
        'browser.newFolder': 'Nouveau dossier',
        'browser.folderName': 'Nom du dossier',
        'browser.createIn': 'Nouveau dossier dans «\u00a0{name}\u00a0»',
        'browser.untitledFolder': 'Dossier sans titre',
        'browser.create': 'Créer',
        'browser.cancel': 'Annuler',
        'browser.open': 'Ouvrir',
        'browser.editPath': 'Modifier le chemin',
        'browser.loading': 'Chargement…',
        'browser.truncated': 'Trop de dossiers pour les lister\u00a0; seul le début est affiché.',
        'browser.showHidden': 'Afficher les fichiers masqués',
      }],
    ]
    try {
      for (const [locale, dict] of dictionaries) disposers.push(ctx.locale.register(LOCALE_NS, locale, dict))
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose()
      throw error
    }
    return () => { for (const dispose of disposers) dispose() }
  }, 'directory-picker-browse: dialog dictionaries')

  const injected = (): BrowseFlowInjected => ({
    listDirectory: (path, signal) => ctx.uiWorkspace.listDirectory(path, signal),
    createDirectory: (path, name) => ctx.uiWorkspace.createDirectory(path, name),
    t: ctx.locale.bind(LOCALE_NS),
  })
  // Both declaration lifetimes must be live before the pair installs; the
  // generator makes the two registrations one transactional effect. The
  // outer/inner nesting order is arbitrary; neither hole has precedence.
  ctx.slots.inject('conversation.hero.workspace.directoryFlow', () =>
    ctx.slots.inject('sidebar.workspaces.directoryFlow', function* () {
      yield ctx.slots.register({
        name: 'conversation.hero.workspace.directoryFlow', inject: injected,
      }, BrowseDirectoryFlow)
      yield ctx.slots.register({
        name: 'sidebar.workspaces.directoryFlow', inject: injected,
      }, BrowseDirectoryFlow)
    }))
}
