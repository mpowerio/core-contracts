# Changelog

## 0.6.0 — consent contract

Adds the shared contract for the AI improvement program and the Gmail
disclosure. Wording is derived from the Privacy Policy and Terms in
mpowerio/mpowerio-substrate PR #376 (head `6652ab8`; the program and Gmail
sections are unchanged at `e1ea98c`).

- `src/consent/ai-improvement.ts`
  - Kinds `service_improvement` and `own_records_training`; actions `opt_in` and `withdraw`; sources `settings` and `email_request`.
  - Switch wording in English and Spanish (`AI_CONSENT_COPY`), versions `AI_IMPROVEMENT_WORDING_VERSION` and `OWN_RECORDS_TRAINING_WORDING_VERSION` (both `2026-11-22.2`). The program text says the resulting models serve all mpowerio clients, and that models trained before switch-off are not retrained at once but are replaced on the normal schedule.
  - `renderAiConsentWording()` and `wordingSha256()`: the canonical text (language first) and its SHA-256, stored on every ledger row next to the version.
  - `validateAiConsentEvent(input: unknown)`: never throws. Turning on needs an owner, from Settings, attestation literally `true`, and the current version and hash. Turning off never depends on wording; staff may record a withdrawal the business asked for by email. Returns plain-words problems for a red banner.
  - Own-records training is in the contract but not offered: `AI_CONSENT_OFFERED.own_records_training` is `false` and its copy carries "Not offered yet".
  - `sha256Hex()`: self-contained SHA-256 over UTF-8 (no Node or DOM types).
- `src/consent/gmail-disclosure.ts`: the pre-Connect disclosure in English and Spanish, `GMAIL_DISCLOSURE_VERSION` (`2026-11-22.2`) and `gmailDisclosureSha256()`.
- `src/consent/sql/ledger-template.sql`: reference DDL, not a migration.
  - Closed by default: app roles can't read, write or run anything until one grant variant (substrate, JBET service_role only, FPC) is added.
  - No app role writes the tables directly; `ai_consent_record()` is the only write path and makes the deletion request on a withdrawal; withdrawing when already off is a safe no-op.
  - `ai_consent_window(kind)` returns a row only while opted in; `ai_consent_windows_audit(kind)` lists past windows and is not for the exporter.
  - `ai_deletion_request_complete()` is the exporter's only write; the 3-year retention purge uses the database clock and is the only path that deletes.
- Tests pin each text's hash in an append-only history, fail when text changes without a version bump, check EN/ES parity, check the policy-required phrases (known-answer), and cover malformed input.

Earlier versions (0.1.0 to 0.5.0) are described in their commit messages.
