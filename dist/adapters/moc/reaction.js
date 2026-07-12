/**
 * Reaction (squawk-scan) MOC adapter — maps the @SquawkCNBC reaction lane's
 * EXISTING state INTO the leaf contract. This is the ARMABLE variance test: the
 * reaction leaf has a real operator-approvable fire path, so it implements
 * ArmableLeaf.
 *
 * READ-MAPPER over what the leaf ALREADY ships — it does NOT rewrite the leaf.
 * The concrete effects (read the squawk state.json, read/flip the AUTO_ARM
 * flag, enumerate the pending drafts, approve one) are injected as a
 * `ReactionStore` — the same "pure core + injected effects" pattern squawk's own
 * tick.ts uses (TickDeps). That keeps THIS package pure TypeScript (the repo's
 * tsconfig has `types: []` — no node types available), makes the leaf unit-
 * testable with an in-memory fixture store, and keeps every real file path in
 * the consuming MOC app's store implementation rather than hard-coded here.
 *
 * What each leaf surface maps FROM (squawk-scan, 2026-07-04 lane):
 *   state.json  { version, seenTweetIds[], userId?, lastRunISO? }
 *               (default ~/.local/state/squawk-scan/state.json, env
 *                SQUAWK_SCAN_STATE_FILE)  → lastRun / status / a 'tick_ran' receipt
 *   AUTO_ARM    the config.ts auto-arm flag; there is no persistent arm file in
 *               the leaf itself, so the MOC-owned arm flag the cron wrapper
 *               sources IS the AUTO_ARM-equivalent → status.armed / arm(on)
 *   drafts/<slug>/{post.txt,provenance.json} in mpowerio-Marketing, staged
 *               `pending_approval` until load-draft --arm flips the calendar row
 *               to `approved`  → pendingApprovals() / fire(id) (one-item --arm)
 */
import { ARMABLE_BRAND } from '../../moc/leaf.js';
/** Default squawk-scan state.json (config.ts: env SQUAWK_SCAN_STATE_FILE overrides). */
export const DEFAULT_SQUAWK_STATE_FILE = '/home/maestro/.local/state/squawk-scan/state.json';
const LEAF = 'reaction';
/** Reaction leaf — the ARMABLE clover variance test. */
export class ReactionLeaf {
    store;
    id = LEAF;
    /** Deliberate armable brand — see ARMABLE_BRAND. Without it isArmable() rejects this leaf. */
    [ARMABLE_BRAND] = true;
    constructor(store) {
        this.store = store;
    }
    async status() {
        try {
            const state = this.store.readState();
            const armed = this.store.readArmed();
            const pending = this.store.listPending();
            let health;
            let summary;
            if (state === null) {
                health = 'idle';
                summary = 'reaction: no state yet — has never run';
            }
            else if (pending.length > 0) {
                health = 'attention';
                summary = `reaction: ${pending.length} draft(s) pending approval`;
            }
            else {
                health = 'ok';
                summary = armed ? 'reaction: armed, no drafts pending' : 'reaction: idle-ready, no drafts pending';
            }
            return { leaf: LEAF, health, armed, pendingCount: pending.length, summary };
        }
        catch {
            // Read contract: NEVER throw — a broken store degrades to 'unknown'.
            return { leaf: LEAF, health: 'unknown', armed: false, pendingCount: 0, summary: 'reaction: status unavailable' };
        }
    }
    async lastRun() {
        try {
            const state = this.store.readState();
            const lastRunISO = state?.lastRunISO ?? null;
            const seen = state?.seenTweetIds.length ?? 0;
            return {
                leaf: LEAF,
                lastRunISO,
                outcome: state === null ? 'unknown' : 'ok',
                ...(state !== null ? { detail: `${seen} tweet(s) seen` } : {}),
            };
        }
        catch {
            return { leaf: LEAF, lastRunISO: null, outcome: 'unknown' };
        }
    }
    async pendingApprovals() {
        try {
            return this.store.listPending().map((d) => ({
                id: d.slug,
                leaf: LEAF,
                title: d.tweetId ? `Quote-post reacting to tweet ${d.tweetId}` : `Quote-post draft ${d.slug}`,
                createdISO: d.createdISO,
                ...(d.preview ? { preview: d.preview } : {}),
            }));
        }
        catch {
            return [];
        }
    }
    /**
     * squawk state.json tracks no dollar figure (LLM token cost rides the shared
     * OpenRouter path and is not attributed per-lane in state). Reported as $0
     * with an explicit basis so the stem shows a truthful zero, not a blank — a
     * real per-lane token-spend figure is a Phase-4 concern.
     */
    async spend() {
        return { leaf: LEAF, currency: 'USD', amount: 0, basis: 'llm_tokens_usd', asOfISO: null };
    }
    /**
     * The leaf's state.json is an idempotency ledger, not a fire journal, so the
     * only durable receipt it can source is that a tick ran (at lastRunISO).
     * Per-post fire receipts are a Phase-4 surface (they live in the Marketing
     * calendar today). Returned only when at/after `sinceISO`.
     */
    async receipts(sinceISO) {
        try {
            const state = this.store.readState();
            const lastRunISO = state?.lastRunISO;
            if (!lastRunISO || lastRunISO < sinceISO)
                return [];
            const seen = state?.seenTweetIds.length ?? 0;
            return [{ leaf: LEAF, atISO: lastRunISO, kind: 'tick_ran', detail: `squawk tick ran — ${seen} tweet(s) seen` }];
        }
        catch {
            return [];
        }
    }
    // ── ArmableLeaf mutations — MAY reject (not part of the read contract) ──
    async arm(on) {
        this.store.setArmed(on);
    }
    async fire(approvalId) {
        const exists = this.store.listPending().some((d) => d.slug === approvalId);
        if (!exists) {
            throw new Error(`reaction.fire: no pending draft with id '${approvalId}' (already approved, expired, or never existed)`);
        }
        this.store.approve(approvalId);
    }
}
//# sourceMappingURL=reaction.js.map