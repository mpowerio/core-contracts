/**
 * Newsjack (squawk-scan) MOC adapter — maps the @SquawkCNBC reaction lane's
 * EXISTING state INTO the leaf contract. This is the ARMABLE variance test: the
 * newsjack leaf has a real operator-approvable fire path, so it implements
 * ArmableLeaf.
 *
 * READ-MAPPER over what the leaf ALREADY ships — it does NOT rewrite the leaf.
 * The concrete effects (read the squawk state.json, read/flip the AUTO_ARM
 * flag, enumerate the pending drafts, approve one) are injected as a
 * `NewsjackStore` — the same "pure core + injected effects" pattern squawk's own
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
import type {
  ApprovalCard,
  ArmableLeaf,
  LeafHealth,
  LeafStatus,
  Receipt,
  RunSummary,
  Spend,
} from '../../moc/leaf.js';

/** Default squawk-scan state.json (config.ts: env SQUAWK_SCAN_STATE_FILE overrides). */
export const DEFAULT_SQUAWK_STATE_FILE = '/home/maestro/.local/state/squawk-scan/state.json';

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
export interface NewsjackDraftRef {
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
 * The injected effects the newsjack leaf maps over — the consuming MOC app wires
 * these to the real squawk state.json, the AUTO_ARM flag file, and the Marketing
 * drafts dir; tests wire them to in-memory fixtures. Read effects are synchronous
 * file reads (the leaf wraps them in the async, non-throwing contract); the
 * adapter is responsible for never letting a read effect's throw escape.
 */
export interface NewsjackStore {
  /** Parsed squawk state.json, or null if the file is absent/unreadable. */
  readState(): SquawkStateShape | null;
  /** Current AUTO_ARM-equivalent flag (the MOC-owned arm override). */
  readArmed(): boolean;
  /** Set the AUTO_ARM-equivalent flag (arm mutation). */
  setArmed(on: boolean): void;
  /** Enumerate drafts currently staged `pending_approval`. */
  listPending(): NewsjackDraftRef[];
  /** Flip ONE draft `pending_approval` → `approved` (the one-item load-draft --arm). */
  approve(slug: string): void;
}

const LEAF = 'newsjack' as const;

/** Newsjack leaf — the ARMABLE clover variance test. */
export class NewsjackLeaf implements ArmableLeaf {
  readonly id = LEAF;

  constructor(private readonly store: NewsjackStore) {}

  async status(): Promise<LeafStatus> {
    try {
      const state = this.store.readState();
      const armed = this.store.readArmed();
      const pending = this.store.listPending();
      let health: LeafHealth;
      let summary: string;
      if (state === null) {
        health = 'idle';
        summary = 'newsjack: no state yet — has never run';
      } else if (pending.length > 0) {
        health = 'attention';
        summary = `newsjack: ${pending.length} draft(s) pending approval`;
      } else {
        health = 'ok';
        summary = armed ? 'newsjack: armed, no drafts pending' : 'newsjack: idle-ready, no drafts pending';
      }
      return { leaf: LEAF, health, armed, pendingCount: pending.length, summary };
    } catch {
      // Read contract: NEVER throw — a broken store degrades to 'unknown'.
      return { leaf: LEAF, health: 'unknown', armed: false, pendingCount: 0, summary: 'newsjack: status unavailable' };
    }
  }

  async lastRun(): Promise<RunSummary> {
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
    } catch {
      return { leaf: LEAF, lastRunISO: null, outcome: 'unknown' };
    }
  }

  async pendingApprovals(): Promise<ApprovalCard[]> {
    try {
      return this.store.listPending().map((d) => ({
        id: d.slug,
        leaf: LEAF,
        title: d.tweetId ? `Quote-post reacting to tweet ${d.tweetId}` : `Quote-post draft ${d.slug}`,
        createdISO: d.createdISO,
        ...(d.preview ? { preview: d.preview } : {}),
      }));
    } catch {
      return [];
    }
  }

  /**
   * squawk state.json tracks no dollar figure (LLM token cost rides the shared
   * OpenRouter path and is not attributed per-lane in state). Reported as $0
   * with an explicit basis so the stem shows a truthful zero, not a blank — a
   * real per-lane token-spend figure is a Phase-4 concern.
   */
  async spend(): Promise<Spend> {
    return { leaf: LEAF, currency: 'USD', amount: 0, basis: 'llm_tokens_usd', asOfISO: null };
  }

  /**
   * The leaf's state.json is an idempotency ledger, not a fire journal, so the
   * only durable receipt it can source is that a tick ran (at lastRunISO).
   * Per-post fire receipts are a Phase-4 surface (they live in the Marketing
   * calendar today). Returned only when at/after `sinceISO`.
   */
  async receipts(sinceISO: string): Promise<Receipt[]> {
    try {
      const state = this.store.readState();
      const lastRunISO = state?.lastRunISO;
      if (!lastRunISO || lastRunISO < sinceISO) return [];
      const seen = state?.seenTweetIds.length ?? 0;
      return [{ leaf: LEAF, atISO: lastRunISO, kind: 'tick_ran', detail: `squawk tick ran — ${seen} tweet(s) seen` }];
    } catch {
      return [];
    }
  }

  // ── ArmableLeaf mutations — MAY reject (not part of the read contract) ──

  async arm(on: boolean): Promise<void> {
    this.store.setArmed(on);
  }

  async fire(approvalId: string): Promise<void> {
    const exists = this.store.listPending().some((d) => d.slug === approvalId);
    if (!exists) {
      throw new Error(`newsjack.fire: no pending draft with id '${approvalId}' (already approved, expired, or never existed)`);
    }
    this.store.approve(approvalId);
  }
}
