/**
 * @mpowerio/core-contracts — the Vertical-Factory's stable cross-vertical
 * envelopes. PURE TYPESCRIPT ONLY: no React, no Next, no Supabase client, no
 * vertical domain nouns. Each tenant app maps its local nouns INTO these
 * envelopes via a thin adapter (see adapters/*). The success gate for the
 * shared-core plan is that JBET and FPC can both import + type-check this
 * package without pulling any framework or vertical type.
 *
 * Derived from JBET ∩ FPC ∩ LAJ ∩ Blass ∩ MOC (seam-diff 2026-06-29) and the
 * Codex roast: extract contracts + small adapter interfaces, NOT shared UI/DB.
 */
// ── Rule-18 migration grant spec + linter (the one runtime-tested module) ──
export { lintGrants, } from './grants.js';
export { GRANDFATHER_DEADLINE, mapGrantState, remapGrandfatheredFindings, } from './grant-state.js';
// ── AI improvement consent contract (v0.6.0): kinds, wording EN/ES, versions,
// hashes, validation; plus the Gmail pre-Connect disclosure. Reference ledger
// DDL ships as src/consent/sql/ledger-template.sql. ──
export { AI_CONSENT_KINDS, AI_CONSENT_ACTIONS, AI_CONSENT_SOURCES, CONSENT_LANGS, AI_CONSENT_REQUIRED_ROLE, AI_CONSENT_OFFERED, AI_IMPROVEMENT_WORDING_VERSION, OWN_RECORDS_TRAINING_WORDING_VERSION, AI_CONSENT_WORDING_VERSIONS, AI_IMPROVEMENT_DETAILS_URL, AI_CONSENT_COPY, formatStateOn, renderAiConsentWording, wordingSha256, validateAiConsentEvent, sha256Hex, } from './consent/ai-improvement.js';
export { GMAIL_DISCLOSURE_VERSION, GMAIL_DISCLOSURE_LOOKBACK_DAYS, GMAIL_DISCLOSURE_COPY, renderGmailDisclosure, gmailDisclosureSha256, } from './consent/gmail-disclosure.js';
// ── MOC clover leaf contract: the honest ReadableLeaf / ArmableLeaf split ──
export { isArmable, ARMABLE_BRAND, } from './moc/leaf.js';
// ── MOC leaf adapters: reaction (ArmableLeaf) + AR (ReadableLeaf) variance tests ──
export { ReactionLeaf, DEFAULT_SQUAWK_STATE_FILE, } from './adapters/moc/reaction.js';
// AR shared brief-parser primitives (the parser + row types + injected store surface).
export { parseBrief, DEFAULT_AR_BRIEF_FILE, DEFAULT_AR_BILLING_LOG, } from './adapters/moc/ar.js';
// AR canonical leaf: the surviving ReadableLeaf (PII-firewalled, billing-log +
// kill-switch aware). Replaced the retired brief-only ArLeaf in the de-vendor pass.
export { ArRailLeaf, parseBillingLog, resolveArPaths, DEFAULT_AR_DISARM_SENTINELS, DEFAULT_AR_DISARM_ENV, } from './adapters/moc/ar-rail.js';
//# sourceMappingURL=index.js.map