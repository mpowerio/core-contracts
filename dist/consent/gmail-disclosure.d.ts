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
import { type ConsentLang } from './ai-improvement.js';
export declare const GMAIL_DISCLOSURE_VERSION = "2026-11-22.1";
/** How far back a first connection copies mail. Part of the disclosure text. */
export declare const GMAIL_DISCLOSURE_LOOKBACK_DAYS = 14;
export interface GmailDisclosureCopy {
    disclosure: string;
    /** Required checkbox label. */
    agree: string;
    /** Button label; disabled until `agree` is ticked. */
    connect: string;
}
export declare const GMAIL_DISCLOSURE_COPY: Readonly<Record<ConsentLang, Readonly<GmailDisclosureCopy>>>;
/** The exact text a person agrees to, one field per line, language first. */
export declare function renderGmailDisclosure(lang: ConsentLang): string;
/** Lowercase hex SHA-256 of the canonical disclosure for one language. */
export declare function gmailDisclosureSha256(lang: ConsentLang): string;
//# sourceMappingURL=gmail-disclosure.d.ts.map