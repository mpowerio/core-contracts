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
//# sourceMappingURL=index.js.map