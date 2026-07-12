/**
 * MOC leaf contract — the honest, roast-hardened split for the 🍀 clover.
 *
 * MOC = the operator-facing STEM (arm / approve / watch) sitting over four
 * engine-LEAVES (content · packet · AR · reaction). The stem READS status and
 * DISPATCHES approved actions; it NEVER reasons or generates — that keeps the
 * doer≠reviewer moat intact.
 *
 * THE KEYSTONE: split the contract HONESTLY into two interfaces, not one leaky
 * interface whose mutation methods throw on the read-only leaves.
 *
 *   • ReadableLeaf — total, read-only, implemented by EVERY leaf. None of its
 *     methods may throw BY DESIGN: a broken/absent data source degrades to a
 *     safe envelope (health 'unknown'), it never rejects. A dead leaf must not
 *     crash the stem's status sweep.
 *   • ArmableLeaf  — extends ReadableLeaf with arm/fire. ONLY content, reaction,
 *     and AR-once-retrofitted implement it. The packet leaf is ReadableLeaf
 *     ONLY — it has NO fire surface BY TYPE (the PII firewall is a property of
 *     the type, not a runtime landmine). In THIS phase AR is also ReadableLeaf
 *     only (no --json fire surface yet — Phase 4).
 *
 * The stem discriminates with the `isArmable` type guard (presence of arm/fire),
 * NEVER with try/catch. A ReadableLeaf[] can hold both shapes cleanly; only the
 * ones that narrow to ArmableLeaf expose arm/fire — enforced by the compiler.
 *
 * Read methods are async: the stem consumes them from a Next.js server /
 * cron surface, and future leaves (content/packet) read over network/db. The
 * mutation methods (arm/fire) MAY reject — firing an unknown approval SHOULD
 * error — because they are NOT part of the non-throwing read contract.
 */

/** The four clover engine-leaves. */
export type LeafId = 'content' | 'packet' | 'ar' | 'reaction';

/**
 * Coarse health for the stem's at-a-glance card.
 *  ok        — ran cleanly, nothing needs the operator
 *  attention — needs an operator look (pending approvals, overdue AR, …)
 *  error     — the last run failed
 *  idle      — configured but has never run
 *  unknown   — the leaf's data source was absent/unparseable (degraded read)
 */
export type LeafHealth = 'ok' | 'attention' | 'error' | 'idle' | 'unknown';

/** One-glance status card the MOC stem renders per leaf. */
export interface LeafStatus {
  leaf: LeafId;
  health: LeafHealth;
  /**
   * Whether unattended auto-fire is currently armed. Read-only leaves (which
   * cannot arm by type) always report false — arming is meaningless without a
   * fire surface.
   */
  armed: boolean;
  /** Count of items awaiting operator approval (0 when the leaf has no approval surface). */
  pendingCount: number;
  /** One-line human summary for the stem card. */
  summary: string;
}

/** Summary of a leaf's most recent run. */
export interface RunSummary {
  leaf: LeafId;
  /** ISO-8601 of the last completed run, or null if never run / unknown. */
  lastRunISO: string | null;
  /** Outcome tag of that run. */
  outcome: 'ok' | 'error' | 'unknown';
  /** Optional one-line detail (e.g. 'drafted=2 armed=0', 'scanned 22 invoices'). */
  detail?: string;
}

/** One item awaiting operator approval — the payload the stem shows, then passes back to fire(). */
export interface ApprovalCard {
  /** Stable id the stem passes to fire(). */
  id: string;
  leaf: LeafId;
  /** Human-readable title of what would fire. */
  title: string;
  /** ISO-8601 when this item was drafted/created. */
  createdISO: string;
  /** Optional preview body (draft post text, diff summary, …). */
  preview?: string;
}

/** One durable receipt of something the leaf did (fired a post, saw an invoice go overdue, …). */
export interface Receipt {
  leaf: LeafId;
  /** ISO-8601 of the receipt event. */
  atISO: string;
  /** e.g. 'tick_ran' | 'invoice_overdue' | 'invoice_paid' | 'post_fired'. */
  kind: string;
  /** Human-readable one-liner. */
  detail: string;
  /** Optional external ref (tweet id, invoice number). */
  ref?: string;
}

/** A money figure relevant to the leaf's ledger. */
export interface Spend {
  leaf: LeafId;
  /** ISO-4217 currency code, e.g. 'USD'. */
  currency: string;
  /**
   * Amount in the MAJOR units of `currency` (e.g. dollars for USD, euros for
   * EUR — never assume dollars), with its meaning defined by `basis`.
   */
  amount: number;
  /** What the amount denotes, e.g. 'outstanding_ar' | 'llm_tokens_usd'. */
  basis: string;
  /** ISO-8601 as-of time for the figure, or null if unknown. */
  asOfISO: string | null;
}

/**
 * The TOTAL, read-only contract every leaf implements. NONE of these methods
 * may throw BY DESIGN — a missing or corrupt data source degrades to a safe
 * envelope (health 'unknown', empty lists) so one broken leaf can never crash
 * the stem's status sweep.
 */
export interface ReadableLeaf {
  readonly id: LeafId;
  status(): Promise<LeafStatus>;
  lastRun(): Promise<RunSummary>;
  pendingApprovals(): Promise<ApprovalCard[]>;
  spend(): Promise<Spend>;
  /** Receipts at or after `sinceISO` (ISO-8601). */
  receipts(sinceISO: string): Promise<Receipt[]>;
}

/**
 * NOMINAL BRAND for ArmableLeaf. A leaf becomes armable ONLY by deliberately
 * carrying this symbol — you cannot set it without importing it, so a plain
 * object that merely happens to expose `arm`/`fire` methods (accidental duck-
 * typing) can never masquerade as armable and slip past `isArmable` into the
 * fire dispatch. This makes the money/PII firewall a DELIBERATE opt-in, not an
 * accident of method names: an implementor who did not mean to be armable will
 * not be, and `arm`/`fire` typos on a read-only leaf stay inert.
 */
export const ARMABLE_BRAND: unique symbol = Symbol('mpowerio.core-contracts/ArmableLeaf');

/**
 * ReadableLeaf + the arm/fire dispatch surface. ONLY leaves that actually have
 * an operator-approvable fire path implement this (content · reaction · and AR
 * after the Phase-4 --json retrofit). The packet leaf NEVER does — its PII
 * firewall is a type property, not a runtime guard.
 *
 * Unlike the read methods, arm/fire MAY reject: firing an unknown/expired
 * approval SHOULD surface as an error, not a silent no-op.
 */
export interface ArmableLeaf extends ReadableLeaf {
  /**
   * Nominal brand (see {@link ARMABLE_BRAND}). Always `true` on a deliberate
   * implementation; its presence is what `isArmable` gates on, so a leaf must
   * import the symbol and set this field to be dispatchable.
   */
  readonly [ARMABLE_BRAND]: true;
  /** Turn unattended auto-fire on/off (the AUTO_ARM-equivalent for the leaf). */
  arm(on: boolean): Promise<void>;
  /** Fire one approved item by its ApprovalCard id. Rejects on an unknown id. */
  fire(approvalId: string): Promise<void>;
}

/**
 * Discriminate an ArmableLeaf from a plain ReadableLeaf. The test is the
 * NOMINAL BRAND plus the presence of both arm and fire — NOT a try/catch on a
 * method that throws, and NOT bare structural duck-typing (which would let an
 * accidental arm/fire pair pass). This is how the stem decides whether to
 * render arm/fire controls: no exceptions, and TypeScript narrows the type for
 * callers inside the guard.
 */
export function isArmable(leaf: ReadableLeaf): leaf is ArmableLeaf {
  const maybe = leaf as Partial<ArmableLeaf>;
  return (
    maybe[ARMABLE_BRAND] === true &&
    typeof maybe.arm === 'function' &&
    typeof maybe.fire === 'function'
  );
}
