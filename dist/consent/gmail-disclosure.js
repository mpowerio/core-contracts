/**
 * Gmail disclosure shown before "Connect Google".
 *
 * The person connecting a mailbox must read this and tick "I agree" before the
 * Connect button is enabled. The system stores the version and the hash with
 * the connection, so a later text change shows up as "needs to agree again".
 *
 * Meaning matches the Privacy Policy at mpowerio/mpowerio-substrate PR #376
 * (head 6652ab8), Google API Limited Use section: mail is stored by our
 * database and hosting providers for us, and is never used for training or
 * for advertising.
 */
import { sha256Hex } from './ai-improvement.js';
export const GMAIL_DISCLOSURE_VERSION = '2026-11-22.2';
/** How far back a first connection copies mail. Part of the disclosure text. */
export const GMAIL_DISCLOSURE_LOOKBACK_DAYS = 14;
export const GMAIL_DISCLOSURE_COPY = Object.freeze({
    en: Object.freeze({
        disclosure: 'Connecting copies messages from the last 14 days into your CRM, stored by our database and hosting providers for us. We never use them for training or ads.',
        agree: 'I agree',
        connect: 'Connect Google',
    }),
    es: Object.freeze({
        disclosure: 'Al conectar, se copian a tu CRM los mensajes de los últimos 14 días. Los guardan para nosotros nuestros proveedores de base de datos y de alojamiento. Nunca los usamos para entrenar modelos ni para publicidad.',
        agree: 'Acepto',
        connect: 'Conectar Google',
    }),
});
/** The exact text a person agrees to, one field per line, language first. */
export function renderGmailDisclosure(lang) {
    const c = GMAIL_DISCLOSURE_COPY[lang];
    return [`lang:${lang}`, 'kind:gmail_disclosure', c.disclosure, c.agree, c.connect].join('\n');
}
/** Lowercase hex SHA-256 of the canonical disclosure for one language. */
export function gmailDisclosureSha256(lang) {
    return sha256Hex(renderGmailDisclosure(lang));
}
//# sourceMappingURL=gmail-disclosure.js.map