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

// ── Kinds, actions, languages ──

/** `own_records_training` exists in the contract but is not offered yet. */
export const AI_CONSENT_KINDS = ['service_improvement', 'own_records_training'] as const;
export type AiConsentKind = (typeof AI_CONSENT_KINDS)[number];

export const AI_CONSENT_ACTIONS = ['opt_in', 'withdraw'] as const;
export type AiConsentAction = (typeof AI_CONSENT_ACTIONS)[number];

export const CONSENT_LANGS = ['en', 'es'] as const;
export type ConsentLang = (typeof CONSENT_LANGS)[number];

/**
 * Where a ledger row came from. `settings` is the owner using the switch.
 * `email_request` is a withdrawal the business asked for by email and a staff
 * member recorded (withdraw only; a business is never opted in by staff).
 */
export const AI_CONSENT_SOURCES = ['settings', 'email_request'] as const;
export type AiConsentSource = (typeof AI_CONSENT_SOURCES)[number];

/** The only role that may change the switch in Settings (Chair ruling 1). */
export const AI_CONSENT_REQUIRED_ROLE = 'owner';

/**
 * Whether each kind can be turned on today. Own-records training ships
 * disabled ("Not offered yet") until its purpose line is written and carried
 * by the policy (Chair ruling 3).
 */
export const AI_CONSENT_OFFERED: Readonly<Record<AiConsentKind, boolean>> = {
  service_improvement: true,
  own_records_training: false,
};

// ── Versions ──
// Format: YYYY-MM-DD.N. Any change to a kind's wording (either language)
// requires a new version for that kind. The pinned-hash test enforces this.

export const AI_IMPROVEMENT_WORDING_VERSION = '2026-11-22.1';
export const OWN_RECORDS_TRAINING_WORDING_VERSION = '2026-11-22.1';

export const AI_CONSENT_WORDING_VERSIONS: Readonly<Record<AiConsentKind, string>> = {
  service_improvement: AI_IMPROVEMENT_WORDING_VERSION,
  own_records_training: OWN_RECORDS_TRAINING_WORDING_VERSION,
};

/** The policy section the switch links to (anchor exists at #376). */
export const AI_IMPROVEMENT_DETAILS_URL = 'https://mpowerio.ai/privacy#ai-improvement-program';

// ── Wording ──

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

const SERVICE_IMPROVEMENT_EN: AiConsentSwitchCopy = {
  title: 'AI improvement program',
  stateOff: 'Off',
  stateOn: 'On since {date}, turned on by {name} ({role})',
  body:
    "Off unless you turn it on. If you turn it on, we use only your work steps (what was done, in what order, and how long it took), with names, contact details, prices and message text taken out, to improve and train mpowerio's own models and services, on mpowerio's own hardware. " +
    'Nothing from before you turn it on is used. ' +
    'It never includes your customer content, call recordings or transcripts, or anything from a connected Gmail account or Google Drive, including summaries or fields our software makes from it. ' +
    'It is never sold, never shared with other clients or anyone else, and never used for advertising. ' +
    'If you turn it on, you are responsible for telling the people who work for you that their work steps, with names removed, are used this way. ' +
    'You can turn it off at any time; we then delete the service-improvement data we hold from your system. ' +
    'Choosing not to take part never changes your price or service.',
  detailsLabel: 'Read the details',
  detailsUrl: AI_IMPROVEMENT_DETAILS_URL,
  attestation: "I'm authorized to accept agreements for this business.",
  turnOn: 'Turn on',
  turnOff: 'Turn off',
  turnOffNotice: 'Turning off deletes the service-improvement data we hold from your system.',
  askOwner: 'Ask an owner of this business to change this.',
};

const SERVICE_IMPROVEMENT_ES: AiConsentSwitchCopy = {
  title: 'Programa de mejora de IA',
  stateOff: 'Desactivado',
  stateOn: 'Activado desde el {date}; lo activó {name} ({role})',
  body:
    'Está desactivado a menos que tú lo actives. Si lo activas, usamos solo los pasos de trabajo de tu negocio (qué se hizo, en qué orden y cuánto tiempo tomó), sin nombres, datos de contacto, precios ni texto de mensajes, para mejorar y entrenar los modelos y servicios propios de mpowerio, en equipos de mpowerio. ' +
    'No se usa nada de antes de que lo actives. ' +
    'Nunca incluye el contenido de tus clientes, grabaciones ni transcripciones de llamadas, ni nada de una cuenta de Gmail o de Google Drive conectada, incluidos los resúmenes o campos que nuestro software crea a partir de ellos. ' +
    'Nunca se vende, nunca se comparte con otros clientes ni con nadie más, y nunca se usa para publicidad. ' +
    'Si lo activas, te corresponde avisar a las personas que trabajan para ti que sus pasos de trabajo, sin nombres, se usan de esta forma. ' +
    'Puedes desactivarlo cuando quieras; entonces borramos los datos de mejora del servicio que tenemos de tu sistema. ' +
    'Decidir no participar nunca cambia tu precio ni tu servicio.',
  detailsLabel: 'Lee los detalles',
  detailsUrl: AI_IMPROVEMENT_DETAILS_URL,
  attestation: 'Tengo autorización para aceptar acuerdos en nombre de este negocio.',
  turnOn: 'Activar',
  turnOff: 'Desactivar',
  turnOffNotice: 'Al desactivarlo, borramos los datos de mejora del servicio que tenemos de tu sistema.',
  askOwner: 'Pídele a un dueño de este negocio que lo cambie.',
};

// Own-records training: the policy says only that it needs a separate opt-in
// and what is always left out. It does not yet say what the model is for, so
// the switch carries `notOffered` and must render disabled (Chair ruling 3).
const OWN_RECORDS_EN: AiConsentSwitchCopy = {
  title: 'Training on your own records',
  stateOff: 'Off',
  stateOn: 'On since {date}, turned on by {name} ({role})',
  notOffered: 'Not offered yet',
  body:
    "Off unless you turn it on. If you turn it on, mpowerio may use your business's own records to train a model. " +
    'Names, email addresses, phone numbers, street addresses and all free text (notes, descriptions and message text) are always left out, and nothing from call recordings, transcripts, a connected Gmail account or Google Drive, including summaries or fields our software makes from it, is ever used. ' +
    'This is separate from the AI improvement program.',
  detailsLabel: 'Read the details',
  detailsUrl: AI_IMPROVEMENT_DETAILS_URL,
  attestation: "I'm authorized to accept agreements for this business.",
  turnOn: 'Turn on',
  turnOff: 'Turn off',
  turnOffNotice: 'Turning off stops this use from then on.',
  askOwner: 'Ask an owner of this business to change this.',
};

const OWN_RECORDS_ES: AiConsentSwitchCopy = {
  title: 'Entrenamiento con tus propios registros',
  stateOff: 'Desactivado',
  stateOn: 'Activado desde el {date}; lo activó {name} ({role})',
  notOffered: 'Todavía no se ofrece',
  body:
    'Está desactivado a menos que tú lo actives. Si lo activas, mpowerio puede usar los registros propios de tu negocio para entrenar un modelo. ' +
    'Siempre se dejan fuera los nombres, correos electrónicos, números de teléfono, direcciones postales y todo el texto libre (notas, descripciones y texto de mensajes), y nunca se usa nada de grabaciones o transcripciones de llamadas, ni de una cuenta de Gmail o de Google Drive conectada, incluidos los resúmenes o campos que nuestro software crea a partir de ellos. ' +
    'Esto es aparte del programa de mejora de IA.',
  detailsLabel: 'Lee los detalles',
  detailsUrl: AI_IMPROVEMENT_DETAILS_URL,
  attestation: 'Tengo autorización para aceptar acuerdos en nombre de este negocio.',
  turnOn: 'Activar',
  turnOff: 'Desactivar',
  turnOffNotice: 'Al desactivarlo, este uso se detiene desde ese momento.',
  askOwner: 'Pídele a un dueño de este negocio que lo cambie.',
};

export const AI_CONSENT_COPY: Readonly<
  Record<AiConsentKind, Readonly<Record<ConsentLang, Readonly<AiConsentSwitchCopy>>>>
> = deepFreeze({
  service_improvement: { en: SERVICE_IMPROVEMENT_EN, es: SERVICE_IMPROVEMENT_ES },
  own_records_training: { en: OWN_RECORDS_EN, es: OWN_RECORDS_ES },
});

/**
 * Fill the "on" state line. Values are inserted as plain text; the caller's
 * UI is responsible for escaping when it renders.
 */
export function formatStateOn(
  copy: Pick<AiConsentSwitchCopy, 'stateOn'>,
  values: { date: string; name: string; role: string },
): string {
  return copy.stateOn
    .replace('{date}', values.date)
    .replace('{name}', values.name)
    .replace('{role}', values.role);
}

// ── Canonical text + hash ──

/**
 * The exact text a person agrees to, in a fixed order, one field per line.
 * Dynamic state lines (`stateOff`, `stateOn`) and `askOwner` are not part of
 * the agreement and are left out. The first line is the language, so the hash
 * covers "the exact rendered text and language".
 */
export function renderAiConsentWording(kind: AiConsentKind, lang: ConsentLang): string {
  const c = AI_CONSENT_COPY[kind][lang];
  const lines = [
    `lang:${lang}`,
    `kind:${kind}`,
    c.title,
    ...(c.notOffered !== undefined ? [c.notOffered] : []),
    c.body,
    `${c.detailsLabel} <${c.detailsUrl}>`,
    c.attestation,
    c.turnOn,
    c.turnOff,
    c.turnOffNotice,
  ];
  return lines.join('\n');
}

/** Lowercase hex SHA-256 of the canonical wording for one kind and language. */
export function wordingSha256(kind: AiConsentKind, lang: ConsentLang): string {
  return sha256Hex(renderAiConsentWording(kind, lang));
}

// ── Ledger row shape + validation (what each system's RPC must enforce) ──

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
  /** The attestation checkbox. Must be true for opt_in. */
  authorityAttested: boolean;
  wordingVersion: string;
  wordingSha256: string;
  lang: ConsentLang;
  /** Staff member who recorded an emailed withdrawal. */
  recordedByUserId?: string | null;
  /** e.g. a mail message id. Never message text. */
  requestRef?: string | null;
  /** ISO-8601. Set by the database clock. */
  occurredAt?: string;
}

export type AiConsentProblemCode =
  | 'UNKNOWN_KIND'
  | 'UNKNOWN_ACTION'
  | 'UNKNOWN_LANG'
  | 'UNKNOWN_SOURCE'
  | 'NOT_OFFERED'
  | 'NOT_OWNER'
  | 'NOT_ATTESTED'
  | 'STAFF_CANNOT_OPT_IN'
  | 'MISSING_ACTOR'
  | 'MISSING_RECORDER'
  | 'STALE_WORDING_VERSION'
  | 'WORDING_HASH_MISMATCH';

export interface AiConsentProblem {
  code: AiConsentProblemCode;
  /** Plain words, safe to show in a red banner. */
  message: string;
}

/**
 * Check a proposed ledger row against the contract before it is written.
 * Returns an empty array when the row is acceptable. Each system's database
 * RPC must enforce the same rules; this function lets the server action and
 * the tests share one definition.
 */
export function validateAiConsentEvent(e: AiConsentEvent): AiConsentProblem[] {
  const problems: AiConsentProblem[] = [];
  const add = (code: AiConsentProblemCode, message: string): void => {
    problems.push({ code, message });
  };

  const kindOk = (AI_CONSENT_KINDS as readonly string[]).includes(e.kind);
  const langOk = (CONSENT_LANGS as readonly string[]).includes(e.lang);
  if (!kindOk) add('UNKNOWN_KIND', 'This setting is not recognized.');
  if (!(AI_CONSENT_ACTIONS as readonly string[]).includes(e.action)) {
    add('UNKNOWN_ACTION', 'This change is not recognized.');
  }
  if (!langOk) add('UNKNOWN_LANG', 'This language is not supported.');
  if (!(AI_CONSENT_SOURCES as readonly string[]).includes(e.source)) {
    add('UNKNOWN_SOURCE', 'The source of this change is not recognized.');
  }
  if (problems.length > 0) return problems;

  if (e.actorName.trim() === '' || e.actorEmail.trim() === '' || e.actorRole.trim() === '') {
    add('MISSING_ACTOR', 'Who made this change could not be recorded.');
  }

  if (e.action === 'opt_in') {
    if (e.source !== 'settings') {
      add('STAFF_CANNOT_OPT_IN', 'Only an owner can turn this on, from Settings.');
    }
    if (!AI_CONSENT_OFFERED[e.kind]) {
      add('NOT_OFFERED', 'This option is not offered yet.');
    }
    if (!e.authorityAttested) {
      add('NOT_ATTESTED', 'Tick the box to confirm you are authorized to accept agreements for this business.');
    }
  }

  if (e.source === 'settings') {
    if (e.actorRole !== AI_CONSENT_REQUIRED_ROLE) {
      add('NOT_OWNER', 'Only an owner of this business can change this.');
    }
    if (e.actorUserId === null || e.actorUserId.trim() === '') {
      add('MISSING_ACTOR', 'Who made this change could not be recorded.');
    }
  } else if (e.recordedByUserId == null || e.recordedByUserId.trim() === '') {
    add('MISSING_RECORDER', 'Record which staff member entered this emailed request.');
  }

  if (e.wordingVersion !== AI_CONSENT_WORDING_VERSIONS[e.kind]) {
    add('STALE_WORDING_VERSION', 'This page is out of date. Reload it and try again.');
  } else if (e.wordingSha256 !== wordingSha256(e.kind, e.lang)) {
    add('WORDING_HASH_MISMATCH', 'This page is out of date. Reload it and try again.');
  }

  // MISSING_ACTOR can be added twice (blank fields + blank user id); keep one.
  return problems.filter((p, i) => problems.findIndex((q) => q.code === p.code) === i);
}

// ── SHA-256 (FIPS 180-4) over UTF-8 ──

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** UTF-8 encode without TextEncoder (keeps the package free of DOM/Node types). */
function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp >= 0xd800 && cp <= 0xdfff) {
      // Lone surrogate: encode U+FFFD, as TextEncoder does.
      out.push(0xef, 0xbf, 0xbd);
    } else if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/** Lowercase hex SHA-256 of the UTF-8 encoding of `text`. */
export function sha256Hex(text: string): string {
  const msg = utf8Bytes(text);
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  // 64-bit big-endian length; split to stay exact past 2^32 bits.
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15] as number;
      const w2 = w[i - 2] as number;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let a = h[0] as number;
    let b = h[1] as number;
    let c = h[2] as number;
    let d = h[3] as number;
    let e = h[4] as number;
    let f = h[5] as number;
    let g = h[6] as number;
    let hh = h[7] as number;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + (K[i] as number) + (w[i] as number)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = ((h[0] as number) + a) >>> 0;
    h[1] = ((h[1] as number) + b) >>> 0;
    h[2] = ((h[2] as number) + c) >>> 0;
    h[3] = ((h[3] as number) + d) >>> 0;
    h[4] = ((h[4] as number) + e) >>> 0;
    h[5] = ((h[5] as number) + f) >>> 0;
    h[6] = ((h[6] as number) + g) >>> 0;
    h[7] = ((h[7] as number) + hh) >>> 0;
  }
  let hex = '';
  for (const word of h) hex += word.toString(16).padStart(8, '0');
  return hex;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
