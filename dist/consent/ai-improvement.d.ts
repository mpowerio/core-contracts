/**
 * AI improvement program — the shared consent contract.
 *
 * One wording, one version, one hash, used by every system that records a
 * business's choice (substrate, JBET, FPC). Each system keeps its own
 * append-only ledger (see `./sql/ledger-template.sql`); this module is the
 * single source for:
 *   - the two consent kinds and the two actions;
 *   - the switch wording, English and Spanish;
 *   - the wording versions;
 *   - `wordingSha256()`, the hash each ledger row stores next to the version,
 *     so a text change can never hide behind an unchanged version string.
 *
 * The wording is built only from sentences in the Privacy Policy and Terms at
 * mpowerio/mpowerio-substrate PR #376 (head 6652ab8). If that policy text
 * changes, this wording must be re-derived and its version bumped.
 *
 * PURE TYPESCRIPT: no Node, DOM or framework types. The SHA-256 below is a
 * small self-contained implementation so the hash is synchronous and works the
 * same in Node, edge runtimes and the browser.
 */
/** `own_records_training` exists in the contract but is not offered yet. */
export declare const AI_CONSENT_KINDS: readonly ["service_improvement", "own_records_training"];
export type AiConsentKind = (typeof AI_CONSENT_KINDS)[number];
export declare const AI_CONSENT_ACTIONS: readonly ["opt_in", "withdraw"];
export type AiConsentAction = (typeof AI_CONSENT_ACTIONS)[number];
export declare const CONSENT_LANGS: readonly ["en", "es"];
export type ConsentLang = (typeof CONSENT_LANGS)[number];
/**
 * Where a ledger row came from. `settings` is the owner using the switch.
 * `email_request` is a withdrawal the business asked for by email and a staff
 * member recorded (withdraw only; a business is never opted in by staff).
 */
export declare const AI_CONSENT_SOURCES: readonly ["settings", "email_request"];
export type AiConsentSource = (typeof AI_CONSENT_SOURCES)[number];
/** The only role that may change the switch in Settings (Chair ruling 1). */
export declare const AI_CONSENT_REQUIRED_ROLE = "owner";
/**
 * Whether each kind can be turned on today. Own-records training ships
 * disabled ("Not offered yet") until its purpose line is written and carried
 * by the policy (Chair ruling 3).
 */
export declare const AI_CONSENT_OFFERED: Readonly<Record<AiConsentKind, boolean>>;
export declare const AI_IMPROVEMENT_WORDING_VERSION = "2026-11-22.2";
export declare const OWN_RECORDS_TRAINING_WORDING_VERSION = "2026-11-22.2";
export declare const AI_CONSENT_WORDING_VERSIONS: Readonly<Record<AiConsentKind, string>>;
/**
 * The policy section the switch links to. `#service-improvement` is the top
 * of the "Service-improvement data" section at #376, so the reader lands on
 * the purpose and exclusions first, then the opt-in and switch-off paragraph.
 */
export declare const AI_IMPROVEMENT_DETAILS_URL = "https://mpowerio.ai/privacy#service-improvement";
export interface AiConsentSwitchCopy {
    title: string;
    /** State line when off. */
    stateOff: string;
    /** State line when on. Placeholders: {date}, {name}, {role}. */
    stateOn: string;
    /** Shown instead of the switch while the kind is not offered. */
    notOffered?: string;
    /** Shown before the switch can be turned on. */
    body: string;
    detailsLabel: string;
    detailsUrl: string;
    /** Required checkbox for opt_in. */
    attestation: string;
    turnOn: string;
    turnOff: string;
    /** Inline line shown when turning off (no browser confirm dialog). */
    turnOffNotice: string;
    /** Shown to signed-in people who are not an owner. */
    askOwner: string;
}
export declare const AI_CONSENT_COPY: Readonly<Record<AiConsentKind, Readonly<Record<ConsentLang, Readonly<AiConsentSwitchCopy>>>>>;
/**
 * Fill the "on" state line. Values are inserted as plain text; the caller's
 * UI is responsible for escaping when it renders.
 */
export declare function formatStateOn(copy: Pick<AiConsentSwitchCopy, 'stateOn'>, values: {
    date: string;
    name: string;
    role: string;
}): string;
/**
 * The exact text a person agrees to, in a fixed order, one field per line.
 * Dynamic state lines (`stateOff`, `stateOn`) and `askOwner` are not part of
 * the agreement and are left out. The first line is the language, so the hash
 * covers "the exact rendered text and language".
 */
export declare function renderAiConsentWording(kind: AiConsentKind, lang: ConsentLang): string;
/** Lowercase hex SHA-256 of the canonical wording for one kind and language. */
export declare function wordingSha256(kind: AiConsentKind, lang: ConsentLang): string;
/** One row of a tenant's append-only consent ledger. Mirrors the SQL template. */
export interface AiConsentEvent {
    kind: AiConsentKind;
    action: AiConsentAction;
    source: AiConsentSource;
    /** Null only for an emailed withdrawal recorded by staff. */
    actorUserId: string | null;
    actorName: string;
    actorEmail: string;
    /** Resolved by the system itself (session/membership), never sent by the browser. */
    actorRole: string;
    /** The attestation checkbox. Must be literally `true` for opt_in. */
    authorityAttested: boolean;
    /**
     * The wording the person saw. Required and current for opt_in. For a
     * withdrawal it is recorded as evidence when available (any past version,
     * or null), and is never a reason to refuse switching off.
     */
    wordingVersion: string | null;
    wordingSha256: string | null;
    lang: ConsentLang | null;
    /** Staff member who recorded an emailed withdrawal. */
    recordedByUserId?: string | null;
    /** e.g. a mail message id. Never message text. */
    requestRef?: string | null;
    /** ISO-8601. Set by the database clock. */
    occurredAt?: string;
}
export type AiConsentProblemCode = 'MALFORMED_INPUT' | 'UNKNOWN_KIND' | 'UNKNOWN_ACTION' | 'UNKNOWN_LANG' | 'UNKNOWN_SOURCE' | 'NOT_OFFERED' | 'NOT_OWNER' | 'NOT_ATTESTED' | 'STAFF_CANNOT_OPT_IN' | 'MISSING_ACTOR' | 'MISSING_RECORDER' | 'STALE_WORDING_VERSION' | 'WORDING_HASH_MISMATCH';
export interface AiConsentProblem {
    code: AiConsentProblemCode;
    /** Plain words, safe to show in a red banner. */
    message: string;
}
/**
 * Check a proposed ledger row against the contract before it is written.
 * Returns an empty array when the row is acceptable. Never throws: input of
 * the wrong shape (for example straight from a request body) comes back as
 * problems. Each system's database function must enforce the same rules;
 * this function lets the server action and the tests share one definition.
 *
 * Turning on needs the current wording, version and hash. Turning off never
 * depends on the wording: a stale page, an older version or a missing hash
 * must not stop a business from switching off.
 */
export declare function validateAiConsentEvent(input: unknown): AiConsentProblem[];
/** Lowercase hex SHA-256 of the UTF-8 encoding of `text`. */
export declare function sha256Hex(text: string): string;
//# sourceMappingURL=ai-improvement.d.ts.map