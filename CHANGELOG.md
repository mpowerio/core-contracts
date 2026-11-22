# Changelog

## 0.6.0 — consent contract

Adds the shared contract for the AI improvement program and the Gmail
disclosure. Wording is derived from the Privacy Policy and Terms in
mpowerio/mpowerio-substrate PR #376 at `6652ab8`.

- `src/consent/ai-improvement.ts`
  - Kinds `service_improvement` and `own_records_training`; actions `opt_in` and `withdraw`; sources `settings` and `email_request`.
  - Switch wording in English and Spanish (`AI_CONSENT_COPY`), with versions `AI_IMPROVEMENT_WORDING_VERSION` and `OWN_RECORDS_TRAINING_WORDING_VERSION` (both `2026-11-22.1`).
  - `renderAiConsentWording()` and `wordingSha256()`: the canonical text (language first) and its SHA-256, stored on every ledger row next to the version.
  - `validateAiConsentEvent()`: owner only, attestation ticked, opt-in only from Settings, staff may record an emailed withdrawal, current version and hash. Returns plain-words problems for a red banner.
  - Own-records training is in the contract but not offered: `AI_CONSENT_OFFERED.own_records_training` is `false` and its copy carries "Not offered yet".
  - `sha256Hex()`: self-contained SHA-256 over UTF-8 (no Node or DOM types).
- `src/consent/gmail-disclosure.ts`: the pre-Connect disclosure in English and Spanish, `GMAIL_DISCLOSURE_VERSION` (`2026-11-22.1`) and `gmailDisclosureSha256()`.
- `src/consent/sql/ledger-template.sql`: reference DDL for each system's append-only ledger, deletion requests, the `ai_consent_window(kind)` training gate, the 3-year retention purge, RLS, and the rule-18 grant variants for the substrate, JBET (service_role only) and FPC. Not a migration.
- Tests pin each text's hash, fail when text changes without a version bump, check EN/ES parity, and check the policy-required phrases (known-answer).

Earlier versions (0.1.0 to 0.5.0) are described in their commit messages.
