/**
 * Browser-safe failure vocabulary of the configuration surfaces this package
 * serves. The redacted views themselves live with their seam in
 * `@deepseek-ai/dsh-settings/types`, whose Cordis event declarations already
 * register that file for the Client compilation face.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/types
 */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /**
     * Every seam refusal that is not a stale write: an unregistered or malformed
     * namespace, a read-only provider, schema validation, storage.
     */
    'settings/rejected': { readonly ns: string }
    /**
     * The stored revision moved after the caller read it. Its own outcome rather
     * than an invalid request: the caller must re-read and re-apply.
     */
    'settings/conflict': { readonly ns: string; readonly expected: number; readonly actual: number }
    /**
     * The provider refused a valid credential write, for example because a
     * read-only source shadows the reference. The details name only the
     * reference, never the value.
     */
    'credential/rejected': { readonly ref: string }
  }
}

/** Confirmation that the settings document was handed to the native editor. */
export interface SettingsDocumentOpenValue {
  readonly opened: true
}

/** One way a sign-in flow can obtain its credential. */
export interface AuthorizationMethodView {
  /** Flow-owned id, echoed back to `begin`. */
  readonly id: string
  /** Label for a picker. */
  readonly label: string
}

/** A credential sign-in flow a surface can offer. */
export interface AuthorizationFlowView {
  /** Credential record the flow writes, `<scope>/<id>`. */
  readonly key: string
  /** Name of what is being signed in to. */
  readonly label: string
  /** Methods the flow offers, most preferred first. */
  readonly methods: readonly AuthorizationMethodView[]
}

/** What a running flow asks the person to do next. */
export interface AuthorizationNoticeView {
  /** What is happening or what to do. */
  readonly message: string
  /** Page to open to continue. */
  readonly url?: string
  /** Code to enter on that page. */
  readonly code?: string
}

/** A question the running flow waits on. */
export type AuthorizationPromptView = {
  /** Id echoed back to `answer`. */
  readonly id: string
  /** The question. */
  readonly message: string
} & ({
  /** `secret` is masked. */
  readonly kind: 'text' | 'secret'
  /** Input hint. */
  readonly placeholder?: string
} | {
  /** Answers with the chosen option's id. */
  readonly kind: 'select'
  /** Choices. */
  readonly options: readonly { readonly id: string; readonly label: string }[]
})

/** Progress of one sign-in attempt. */
export interface AuthorizationAttemptView {
  /** Attempt id; a poll for a replaced attempt answers `undefined`. */
  readonly id: string
  /** Flow key the attempt signs in to. */
  readonly key: string
  /** `running` until the flow settles. */
  readonly status: 'running' | 'authorized' | 'cancelled' | 'failed'
  /** Latest notice from the flow, if it sent one. */
  readonly notice?: AuthorizationNoticeView
  /** Question awaiting an answer, if any. */
  readonly prompt?: AuthorizationPromptView
  /** Failure diagnostic once `status` is `failed`. */
  readonly failure?: string
}
