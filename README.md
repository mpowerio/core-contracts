# @mpowerio/core-contracts

The Vertical-Factory's stable, cross-vertical **contract envelopes** — pure TypeScript, **zero React / Next / Supabase / vertical-domain deps by design.**

Dual-verified first extraction step (Claude seam-diff `VERTICAL-FACTORY-SEAM-DIFF-2026-06-29.md` Part 4 ✕ Codex roast `VERTICAL-FACTORY-ROAST-2026-06-29.md`): *extract contracts + small adapter interfaces, NOT shared UI/DB/auth code.* Each tenant app maps its local nouns INTO these envelopes via a thin adapter.

## Envelopes
| Type | Purpose | Fleet evidence |
|---|---|---|
| `TenantConfig` | tenant identity + deployment metadata (per-tenant Supabase/Vercel) | MOC `organizations`, hardcoded tenant constants |
| `ActorSession` | auth-rail-agnostic principal | JBET NextAuth ✕ FPC Supabase-Auth (different rails, one shape) |
| `AuditEvent` | audit-trail entry | JBET `audit_log`/`activity_log`, LAJ `activity_log` |
| `ProposedChange<TAction,TPayload>` | agent propose→confirm→apply lifecycle (**#1 seam**) | JBET `trip_proposed_changes` ≡ FPC `estimate_proposed_changes` |
| `ArtifactRecord<TKind>` | generate-artifact-from-canonical-row lifecycle | JBET Gamma/DOCX ≡ FPC SOW/proposal (tool ≠ product) |
| `AnalyticsEvent` | shared capture envelope; metric *definitions* stay vertical | JBET trackEvent funnel |
| `MigrationGrantSpec` + `lintGrants()` | declarative **Rule-18** conformance (the one runtime-tested module) | fleet-wide Rule-18 drift |

## The success gate (Codex's, adopted)
Shared-core is "real" only if **both JBET and FPC import + type-check this package WITHOUT pulling React/Next/Supabase or any vertical noun.** Status:
- [x] Package type-checks standalone, strict (+`exactOptionalPropertyTypes`), zero framework deps (`npm run typecheck` → exit 0)
- [x] `lintGrants` TDD'd (7/7)
- [x] **JBET adapter** (`src/adapters/jbet.ts`) — trip_proposed_changes → `ProposedChange`; gamma_presentations → `ArtifactRecord`
- [x] **FPC adapter** (`src/adapters/fpc.ts`) — estimate_proposed_changes → `ProposedChange` (note: `created_at`→`proposedAt` seam); proposals → `ArtifactRecord`
- [x] **shared proposal/apply + shared artifact tests run against BOTH adapters** (`src/adapters/adapters.test.ts`, 7/7) — incl. a cross-vertical test collecting both into one homogeneous `ProposedChange[]`
- [~] **Both REAL apps compile against the package** — PROVEN here against *representative* row shapes; the full cross-repo import (JBET + FPC `package.json` depend on `@mpowerio/core-contracts`) is pending the distribution decision below
- [ ] grant-lint wired into both migration folders (next: dogfood on FPC via #FPC-R18-1)

If the adapters can't compile cleanly, the shared-core plan is not ready → the next pilot uses **controlled copy-then-converge** (with a seam ledger).

## Open decision (flagged, not blocking)
**Distribution:** standalone repo (current) vs. fold into the `mpowerio-substrate` monorepo `packages/*` (Codex-owned) vs. publish to GitHub Packages so the separate JBET/FPC repos can consume it. Contents are identical regardless; pick before the adapters wire in.

## Dev
```
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
```
