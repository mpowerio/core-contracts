# Changelog

## 0.6.0 — consent contract

Adds the shared contract for the AI improvement program and the Gmail
disclosure. Wording is derived from the Privacy Policy and Terms in
mpowerio/mpowerio-substrate PR #376 (head `6652ab8`; the program and Gmail
sections are unchanged at `e1ea98c`).

- `src/consent/ai-improvement.ts`
  - Kinds `service_improvement` and `own_records_training`; actions `opt_in` and `withdraw`; sources `settings` and `email_request`.
  - Switch wording in English and Spanish (`AI_CONSENT_COPY`), versions `AI_IMPROVEMENT_WORDING_VERSION` and `OWN_RECORDS_TRAINING_WORDING_VERSION` (both `2026-11-22.2`). The program text says the resulting models serve all mpowerio clients, and that models trained before switch-off are not retrained at once but are replaced on the normal schedule.
  - `renderAiConsentWording()` and `wordingSha256()`: the canonical text (language first) and its SHA-256. An opt-in row must store the current version and hash. A withdrawal row stores them only as caller-reported evidence when they are well-formed (NULL otherwise); they are never checked against the published text and never block switching off.
  - `validateAiConsentEvent(input: unknown)`: never throws. Turning on needs an owner, from Settings, attestation literally `true`, and the current version and hash. Turning off never depends on wording; staff may record a withdrawal the business asked for by email. Returns plain-words problems for a red banner.
  - Own-records training is in the contract but not offered: `AI_CONSENT_OFFERED.own_records_training` is `false` and its copy carries "Not offered yet".
  - `sha256Hex()`: self-contained SHA-256 over UTF-8 (no Node or DOM types).
- `src/consent/gmail-disclosure.ts`: the pre-Connect disclosure in English and Spanish, `GMAIL_DISCLOSURE_VERSION` (`2026-11-22.2`) and `gmailDisclosureSha256()`.
- `src/consent/sql/ledger-template.sql`: reference DDL, not a migration. It is tested in a throwaway Postgres 17, not against a Supabase project or any tenant's code.
  - Closed by default: app roles can't read, write or run anything until one grant variant (substrate, JBET service_role only, FPC) is added. Variants only add grants.
  - No app role writes the tables directly. Three functions write, each for one job: `ai_consent_record()` (consent events, plus the deletion request on a withdrawal; withdrawing when already off is a no-op that returns the earlier withdrawal), `ai_deletion_request_complete()` (pending to completed, once, with `completed_at >= requested_at`), and `ai_consent_retention_purge()`.
  - The single-business `ai_consent_record()` trusts the actor its server passes in. The substrate must rewrite it to read the actor and tenant from the session before `authenticated` may call it.
  - Every state-changing function refuses to run unless the transaction is READ COMMITTED, then takes a per-kind advisory lock (per tenant and kind in the substrate) before reading state.
  - `ai_consent_window(kind)` returns a row only while opted in; `ai_consent_windows_audit(kind)` lists past windows and is not for the exporter.
  - The retention purge may be called by service_role (each system's scheduled job). It is SECURITY DEFINER, uses `now()`, and deletes only when every kind is off, no deletion request is pending, and the last withdrawal is more than 3 years old.
- Tests pin each text's hash per version, fail when text changes without a version bump, compare the current text with a full-text literal baseline per version (so changing a word and its pin together still fails), check EN/ES parity, check the policy-required phrases (known-answer), and cover malformed input. The baseline lives in the repo, so a deliberate edit of an existing entry is visible only in review.

Earlier versions (0.1.0 to 0.5.0) are described in their commit messages.
