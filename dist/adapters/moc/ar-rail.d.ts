/**
 * AR RAIL — the lane-2 READ-ONLY shim of the 48h contract-variance test.
 *
 * Implements ReadableLeaf (and ONLY ReadableLeaf) over the mpowerio-ar money
 * rail: the Daily Money Brief (ar-watch.sh → latest-brief.txt), the monthly
 * billing log (ar-monthly-billing.sh → ar-monthly-billing.log), and the
 * Phase-0 disarm kill-switch (DISARMED sentinel / ~/.ar-disarmed /
 * AR_DISARMED=1). Read-only is enforced BY TYPE — this class simply does not
 * implement arm/fire, so `isArmable()` rejects it structurally and the
 * compiler forbids the stem from ever dispatching into the money rail. No
 * runtime throw, no try/catch branch in the stem: the PII/money firewall is a
 * property of the type.
 *
 * WHY NOT REUSE ArLeaf (./ar.js)? Two deliberate deltas:
 *   1. PII firewall — ArLeaf's receipts embed recipient emails in `detail`.
 *      This shim projects by WHITELIST EXTRACTION (invoice numbers, amounts,
 *      currencies, dates, statuses); recipient emails, client names, PayPal
 *      internal ids, HTTP bodies, and secrets paths are never re-emitted.
 *   2. Rail arm state — the AR rail has its own unattended auto-fire (the
 *      monthly billing timer) with a kill-switch. `LeafStatus.armed` is
 *      defined as "whether unattended auto-fire is currently armed", so this
 *      shim reports the REAL rail state: armed only when POSITIVELY verified
 *      (sentinel checked and absent); an undeterminable state degrades to
 *      false — never claim a money rail is armed on a failed read.
 *      ⚠ CONTRACT-DOC TENSION (flagged, not smoothed): leaf.ts's docstring
 *      says read-only leaves "always report false" because MOC cannot arm
 *      them. AR proves a leaf can be armed OUT-OF-BAND (systemd timer) while
 *      staying MOC-read-only. The field's primary definition wins here; the
 *      docstring sentence should be relaxed when AR graduates in Phase 4.
 *
 * Like every adapter in this package the shim is a PURE read-mapper over an
 * injected store — the consuming MOC app binds the real files (this package
 * deliberately compiles with no node types, so fs never appears here). The
 * try/catch inside each read method is NOT contract special-casing: it
 * implements the contract's own "read methods never throw by design" clause
 * against a misbehaving injected effect, exactly as ArLeaf already does.
 */
import type { LeafStatus, Receipt, ReadableLeaf, RunSummary, Spend } from '../../moc/leaf.js';
import { type ArStore } from './ar.js';
/**
 * The rail's disarm doors, exactly as ar-watch.sh / ar-monthly-billing.sh
 * check them (repo sentinel OR home sentinel OR env flag). The consuming
 * store reports disarmed=true if ANY door is engaged; false only after
 * positively checking all three; null when it could not determine.
 */
export declare const DEFAULT_AR_DISARM_SENTINELS: readonly ["/home/maestro/projects/mpowerio-ar/DISARMED", "/home/maestro/.ar-disarmed"];
export declare const DEFAULT_AR_DISARM_ENV = "AR_DISARMED";
/**
 * Explicit path overrides for wiring the AR rail store. Everything is optional;
 * an omitted field falls through to the env var, then the documented default.
 */
export interface ArPathOverrides {
    briefFile?: string;
    billingLog?: string;
    disarmSentinels?: readonly string[];
    disarmEnv?: string;
}
/** A fully-resolved AR rail file wiring — what the consuming store binds `fs` to. */
export interface ResolvedArPaths {
    briefFile: string;
    billingLog: string;
    disarmSentinels: readonly string[];
    disarmEnv: string;
}
/**
 * Resolve the AR rail's file paths with precedence: explicit override → env var
 * → documented default. This is what makes the package PORTABLE off the
 * operator's `/home/maestro` layout without a fork — the DEFAULT_AR_* constants
 * are only defaults, never the sole option.
 *
 * `env` is the CONSUMER'S process.env, passed in: this package deliberately
 * carries no node types and never touches `process` itself, so the caller hands
 * the environment across the boundary (the same injected-effects posture as the
 * stores). Recognised keys: AR_BRIEF_FILE, AR_BILLING_LOG, AR_DISARM_SENTINELS
 * (a ':'-separated path list, mirroring $PATH), AR_DISARM_ENV.
 */
export declare function resolveArPaths(overrides?: ArPathOverrides, env?: Record<string, string | undefined>): ResolvedArPaths;
/** Injected read effects — ArStore's brief/billing readers + the kill-switch probe. */
export interface ArRailStore extends ArStore {
    /**
     * true  = a disarm door is engaged (rail will not auto-fire)
     * false = positively verified armed (all doors checked, none engaged)
     * null  = could not determine (permission error, …) — treated as NOT armed
     */
    readDisarmed(): boolean | null;
}
/** One whitelist-projected line of ar-monthly-billing.log. */
export interface BillingLogEntry {
    /** `date -Iseconds` timestamp, offset-bearing ISO-8601. */
    atISO: string;
    kind: 'created' | 'sent' | 'skipped' | 'error' | 'run_complete';
    /** MPIO-<YYYYMM>-<CODE> invoice number, when the line names one. */
    invoiceNumber?: string;
    /** USD amount extracted from a CREATED line (the staged invoice amount). */
    amountUSD?: number;
    /** HTTP status on SENT/ERROR lines. */
    httpStatus?: number;
    /** Which call failed, on ERROR lines. */
    op?: 'create' | 'send';
    /** run-complete only: 'draft' | 'send'. */
    mode?: string;
    /** run-complete only: billing month 'YYYY-MM'. */
    month?: string;
}
/**
 * Parse ar-monthly-billing.log. Pure + total: unmatched lines are silently
 * dropped, garbage parses to [] — it never throws, upholding the leaf's
 * non-throwing read contract.
 */
export declare function parseBillingLog(text: string): BillingLogEntry[];
/**
 * The AR rail as a READ-ONLY ReadableLeaf. NO arm(), NO fire() — by type.
 */
export declare class ArRailLeaf implements ReadableLeaf {
    private readonly store;
    readonly id: "ar";
    constructor(store: ArRailStore);
    private brief;
    private billing;
    /** armed only when POSITIVELY verified; unknown degrades to false. */
    private armState;
    status(): Promise<LeafStatus>;
    /**
     * Last activity across BOTH rails: the daily brief heartbeat vs the last
     * monthly-billing log entry — whichever is more recent (epoch compare, the
     * two sources carry different ISO offsets).
     */
    lastRun(): Promise<RunSummary>;
    /**
     * ALWAYS []. The AR rail is read-only BY TYPE in this phase: no fire
     * surface, therefore no approval queue. (Phase-4 --json retrofit graduates
     * AR to ArmableLeaf, where reminder-sends become real ApprovalCards.)
     */
    pendingApprovals(): Promise<[]>;
    spend(): Promise<Spend>;
    /**
     * Receipts from BOTH files, whitelist-projected (invoice numbers, amounts,
     * currencies, dates, statuses — NEVER recipients/client names/ids/bodies):
     *   • brief OVERDUE rows  → invoice_overdue (at the brief date, UTC midnight)
     *   • brief PAID rows     → invoice_paid (at the payment date)
     *   • billing log entries → invoice_created / invoice_sent / invoice_skipped /
     *                           billing_error / billing_run_complete
     * Filtered by EPOCH against sinceISO (sources carry different UTC offsets);
     * an unparseable sinceISO degrades to "return all", never a throw.
     */
    receipts(sinceISO: string): Promise<Receipt[]>;
}
//# sourceMappingURL=ar-rail.d.ts.map