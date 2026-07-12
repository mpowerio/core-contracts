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
import type { ApprovalCard, ArmableLeaf, LeafStatus, Receipt, RunSummary, Spend } from '../../moc/leaf.js';
/** Default squawk-scan state.json (config.ts: env SQUAWK_SCAN_STATE_FILE overrides). */
export declare const DEFAULT_SQUAWK_STATE_FILE = "/home/maestro/.local/state/squawk-scan/state.json";
/**
 * The squawk-scan idempotency ledger, exactly as stored (squawk-scan/state.ts
 * `SquawkState`). Only the fields the adapter reads are required-typed; the leaf
 * owns the rest. lastRunISO is the single run-timestamp the leaf persists.
 */
export interface SquawkStateShape {
    version: 1;
    seenTweetIds: string[];
    userId?: string;
    lastRunISO?: string;
}
/**
 * One squawk draft staged `pending_approval` — a `drafts/<slug>/` dir the leaf
 * wrote (post.txt + provenance.json). `slug` is the stable id fire() approves.
 */
export interface ReactionDraftRef {
    /** The draft slug (drafts/<slug>/) — stable id passed back to fire(). */
    slug: string;
    /** ISO-8601 when the draft was written (provenance.draftedAt). */
    createdISO: string;
    /** Source tweet id (provenance brainId `x-tweet:<id>`), if known. */
    tweetId?: string;
    /** First line / body preview for the approval card. */
    preview?: string;
}
/**
 * The injected effects the reaction leaf maps over — the consuming MOC app wires
 * these to the real squawk state.json, the AUTO_ARM flag file, and the Marketing
 * drafts dir; tests wire them to in-memory fixtures. Read effects are synchronous
 * file reads (the leaf wraps them in the async, non-throwing contract); the
 * adapter is responsible for never letting a read effect's throw escape.
 */
export interface ReactionStore {
    /** Parsed squawk state.json, or null if the file is absent/unreadable. */
    readState(): SquawkStateShape | null;
    /** Current AUTO_ARM-equivalent flag (the MOC-owned arm override). */
    readArmed(): boolean;
    /** Set the AUTO_ARM-equivalent flag (arm mutation). */
    setArmed(on: boolean): void;
    /** Enumerate drafts currently staged `pending_approval`. */
    listPending(): ReactionDraftRef[];
    /** Flip ONE draft `pending_approval` → `approved` (the one-item load-draft --arm). */
    approve(slug: string): void;
}
/** Reaction leaf — the ARMABLE clover variance test. */
export declare class ReactionLeaf implements ArmableLeaf {
    private readonly store;
    readonly id: "reaction";
    /** Deliberate armable brand — see ARMABLE_BRAND. Without it isArmable() rejects this leaf. */
    readonly [ARMABLE_BRAND] = true;
    constructor(store: ReactionStore);
    status(): Promise<LeafStatus>;
    lastRun(): Promise<RunSummary>;
    pendingApprovals(): Promise<ApprovalCard[]>;
    /**
     * squawk state.json tracks no dollar figure (LLM token cost rides the shared
     * OpenRouter path and is not attributed per-lane in state). Reported as $0
     * with an explicit basis so the stem shows a truthful zero, not a blank — a
     * real per-lane token-spend figure is a Phase-4 concern.
     */
    spend(): Promise<Spend>;
    /**
     * The leaf's state.json is an idempotency ledger, not a fire journal, so the
     * only durable receipt it can source is that a tick ran (at lastRunISO).
     * Per-post fire receipts are a Phase-4 surface (they live in the Marketing
     * calendar today). Returned only when at/after `sinceISO`.
     */
    receipts(sinceISO: string): Promise<Receipt[]>;
    arm(on: boolean): Promise<void>;
    fire(approvalId: string): Promise<void>;
}
//# sourceMappingURL=reaction.d.ts.map