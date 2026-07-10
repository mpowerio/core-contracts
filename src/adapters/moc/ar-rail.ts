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
import type {
  LeafHealth,
  LeafStatus,
  Receipt,
  ReadableLeaf,
  RunSummary,
  Spend,
} from '../../moc/leaf.js';
import { parseBrief, type ArStore, type ParsedBrief } from './ar.js';

const LEAF = 'ar' as const;

/**
 * The rail's disarm doors, exactly as ar-watch.sh / ar-monthly-billing.sh
 * check them (repo sentinel OR home sentinel OR env flag). The consuming
 * store reports disarmed=true if ANY door is engaged; false only after
 * positively checking all three; null when it could not determine.
 */
export const DEFAULT_AR_DISARM_SENTINELS = [
  '/home/maestro/projects/mpowerio-ar/DISARMED',
  '/home/maestro/.ar-disarmed',
] as const;
export const DEFAULT_AR_DISARM_ENV = 'AR_DISARMED';

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

// Line shapes pinned to ar-monthly-billing.sh's log() calls. Everything not
// matched by a whitelist pattern is DROPPED — never passed through — so
// client names, emails, PayPal internal ids, HTTP bodies and secrets paths
// (all present in the raw log) cannot leak into a projection.
const RE_LINE = /^\[([^\]]+)\]\s+(.*)$/;
const RE_CREATED = /^CREATED\s+(\S+)\s+id=\S+\s+\((.*)\)\s*$/;
const RE_AMOUNT = /\$([\d,]+(?:\.\d+)?)\s*→/;
const RE_SENT = /^SENT\s+(\S+)\s+\(HTTP\s+(\d+)\)/;
const RE_SKIP = /^SKIP\s+(\S+)\s+already exists/;
const RE_ERROR = /^ERROR\s+(create|send)\s+(\S+)\s+HTTP\s+(\d+)/;
const RE_FATAL = /^FATAL:/;
const RE_RUN_COMPLETE = /^===\s*run complete mode=(\S+)\s+month=(\S+)\s*===/;

/**
 * Parse ar-monthly-billing.log. Pure + total: unmatched lines are silently
 * dropped, garbage parses to [] — it never throws, upholding the leaf's
 * non-throwing read contract.
 */
export function parseBillingLog(text: string): BillingLogEntry[] {
  const out: BillingLogEntry[] = [];
  for (const raw of text.split('\n')) {
    const lineM = raw.match(RE_LINE);
    if (!lineM?.[1] || !lineM[2]) continue;
    const atISO = lineM[1];
    const rest = lineM[2];

    const created = rest.match(RE_CREATED);
    if (created?.[1]) {
      const entry: BillingLogEntry = { atISO, kind: 'created', invoiceNumber: created[1] };
      const amt = created[2]?.match(RE_AMOUNT)?.[1];
      if (amt !== undefined) entry.amountUSD = Number(amt.replace(/,/g, ''));
      out.push(entry);
      continue;
    }
    const sent = rest.match(RE_SENT);
    if (sent?.[1] && sent[2]) {
      out.push({ atISO, kind: 'sent', invoiceNumber: sent[1], httpStatus: Number(sent[2]) });
      continue;
    }
    const skip = rest.match(RE_SKIP);
    if (skip?.[1]) {
      out.push({ atISO, kind: 'skipped', invoiceNumber: skip[1] });
      continue;
    }
    const error = rest.match(RE_ERROR);
    if (error?.[1] && error[2] && error[3]) {
      out.push({
        atISO,
        kind: 'error',
        op: error[1] as 'create' | 'send',
        invoiceNumber: error[2],
        httpStatus: Number(error[3]),
      });
      continue;
    }
    if (RE_FATAL.test(rest)) {
      // Detail deliberately dropped: FATAL messages can carry secrets paths.
      out.push({ atISO, kind: 'error' });
      continue;
    }
    const run = rest.match(RE_RUN_COMPLETE);
    if (run?.[1] && run[2]) {
      out.push({ atISO, kind: 'run_complete', mode: run[1], month: run[2] });
      continue;
    }
    // anything else: dropped by design
  }
  return out;
}

/** date-only 'YYYY-MM-DD' → ISO-8601 at UTC midnight (brief is date-granular). */
function dateToISO(date: string): string {
  return `${date}T00:00:00Z`;
}

/** Receipt text for one billing entry — whitelist fields only. */
function billingReceipt(e: BillingLogEntry): Receipt {
  switch (e.kind) {
    case 'created': {
      const amount = e.amountUSD !== undefined ? ` USD ${e.amountUSD.toFixed(2)}` : '';
      const r: Receipt = {
        leaf: LEAF,
        atISO: e.atISO,
        kind: 'invoice_created',
        detail: `${e.invoiceNumber ?? '?'}${amount} created`,
      };
      if (e.invoiceNumber !== undefined) r.ref = e.invoiceNumber;
      return r;
    }
    case 'sent': {
      const r: Receipt = {
        leaf: LEAF,
        atISO: e.atISO,
        kind: 'invoice_sent',
        detail: `${e.invoiceNumber ?? '?'} sent (HTTP ${e.httpStatus ?? '?'})`,
      };
      if (e.invoiceNumber !== undefined) r.ref = e.invoiceNumber;
      return r;
    }
    case 'skipped': {
      const r: Receipt = {
        leaf: LEAF,
        atISO: e.atISO,
        kind: 'invoice_skipped',
        detail: `${e.invoiceNumber ?? '?'} skipped — already exists (idempotency guard)`,
      };
      if (e.invoiceNumber !== undefined) r.ref = e.invoiceNumber;
      return r;
    }
    case 'error': {
      const what =
        e.op !== undefined && e.invoiceNumber !== undefined
          ? `${e.op} ${e.invoiceNumber} failed (HTTP ${e.httpStatus ?? '?'})`
          : 'billing run fatal error';
      const r: Receipt = { leaf: LEAF, atISO: e.atISO, kind: 'billing_error', detail: what };
      if (e.invoiceNumber !== undefined) r.ref = e.invoiceNumber;
      return r;
    }
    case 'run_complete':
      return {
        leaf: LEAF,
        atISO: e.atISO,
        kind: 'billing_run_complete',
        detail: `billing run complete mode=${e.mode ?? '?'} month=${e.month ?? '?'}`,
      };
  }
}

/**
 * The AR rail as a READ-ONLY ReadableLeaf. NO arm(), NO fire() — by type.
 */
export class ArRailLeaf implements ReadableLeaf {
  readonly id = LEAF;

  constructor(private readonly store: ArRailStore) {}

  private brief(): ParsedBrief | null {
    const text = this.store.readBrief();
    return text === null ? null : parseBrief(text);
  }

  private billing(): BillingLogEntry[] {
    const text = this.store.readBillingLog();
    return text === null ? [] : parseBillingLog(text);
  }

  /** armed only when POSITIVELY verified; unknown degrades to false. */
  private armState(): { armed: boolean; tag: string } {
    let disarmed: boolean | null;
    try {
      disarmed = this.store.readDisarmed();
    } catch {
      disarmed = null;
    }
    if (disarmed === true) return { armed: false, tag: '[DISARMED]' };
    if (disarmed === false) return { armed: true, tag: '[ARMED]' };
    return { armed: false, tag: '[arm state unknown]' };
  }

  async status(): Promise<LeafStatus> {
    const { armed, tag } = this.armState();
    try {
      const b = this.brief();
      if (b === null || b.date === null) {
        return {
          leaf: LEAF,
          health: 'unknown',
          armed,
          pendingCount: 0,
          summary: `AR ${tag}: no brief available`,
        };
      }
      const overdue = b.overdueCount ?? 0;
      const health: LeafHealth = overdue > 0 ? 'attention' : 'ok';
      const cur = b.currency ?? 'USD';
      const outstanding = b.outstanding ?? 0;
      const summary =
        overdue > 0
          ? `AR ${tag}: ${overdue} overdue, ${cur} ${outstanding.toFixed(2)} outstanding across ${b.openCount ?? 0} open`
          : `AR ${tag}: nothing overdue, ${cur} ${outstanding.toFixed(2)} outstanding`;
      return { leaf: LEAF, health, armed, pendingCount: 0, summary };
    } catch {
      return {
        leaf: LEAF,
        health: 'unknown',
        armed,
        pendingCount: 0,
        summary: `AR ${tag}: status unavailable`,
      };
    }
  }

  /**
   * Last activity across BOTH rails: the daily brief heartbeat vs the last
   * monthly-billing log entry — whichever is more recent (epoch compare, the
   * two sources carry different ISO offsets).
   */
  async lastRun(): Promise<RunSummary> {
    try {
      const candidates: RunSummary[] = [];

      const b = this.brief();
      if (b !== null && b.date !== null) {
        candidates.push({
          leaf: LEAF,
          lastRunISO: dateToISO(b.date),
          outcome: 'ok',
          detail: `brief: scanned ${b.scanned ?? 0} invoice(s), ${b.overdueCount ?? 0} overdue`,
        });
      }

      const entries = this.billing();
      const last = entries[entries.length - 1];
      if (last !== undefined) {
        candidates.push({
          leaf: LEAF,
          lastRunISO: last.atISO,
          outcome: last.kind === 'error' ? 'error' : 'ok',
          detail:
            last.kind === 'run_complete'
              ? `billing: run complete mode=${last.mode ?? '?'} month=${last.month ?? '?'}`
              : `billing: last entry ${last.kind}`,
        });
      }

      let best: RunSummary | null = null;
      let bestEpoch = Number.NEGATIVE_INFINITY;
      for (const c of candidates) {
        const epoch = c.lastRunISO === null ? Number.NaN : Date.parse(c.lastRunISO);
        if (!Number.isNaN(epoch) && epoch >= bestEpoch) {
          best = c;
          bestEpoch = epoch;
        }
      }
      return best ?? { leaf: LEAF, lastRunISO: null, outcome: 'unknown' };
    } catch {
      return { leaf: LEAF, lastRunISO: null, outcome: 'unknown' };
    }
  }

  /**
   * ALWAYS []. The AR rail is read-only BY TYPE in this phase: no fire
   * surface, therefore no approval queue. (Phase-4 --json retrofit graduates
   * AR to ArmableLeaf, where reminder-sends become real ApprovalCards.)
   */
  async pendingApprovals(): Promise<[]> {
    return [];
  }

  async spend(): Promise<Spend> {
    try {
      const b = this.brief();
      return {
        leaf: LEAF,
        currency: b?.currency ?? 'USD',
        amount: b?.outstanding ?? 0,
        basis: 'outstanding_ar',
        asOfISO: b?.date ? dateToISO(b.date) : null,
      };
    } catch {
      return { leaf: LEAF, currency: 'USD', amount: 0, basis: 'outstanding_ar', asOfISO: null };
    }
  }

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
  async receipts(sinceISO: string): Promise<Receipt[]> {
    try {
      const receipts: Receipt[] = [];

      const b = this.brief();
      if (b !== null && b.date !== null) {
        const briefISO = dateToISO(b.date);
        for (const o of b.overdue) {
          receipts.push({
            leaf: LEAF,
            atISO: briefISO,
            kind: 'invoice_overdue',
            detail: `${o.invoiceNumber} ${o.currency} ${o.amount.toFixed(2)} — ${o.daysOverdue} days overdue`,
            ref: o.invoiceNumber,
          });
        }
        for (const p of b.paid) {
          receipts.push({
            leaf: LEAF,
            atISO: dateToISO(p.paymentDate),
            kind: 'invoice_paid',
            detail: `${p.invoiceNumber} ${p.currency} ${p.amount.toFixed(2)} paid`,
            ref: p.invoiceNumber,
          });
        }
      }

      for (const e of this.billing()) receipts.push(billingReceipt(e));

      const sinceEpoch = Date.parse(sinceISO);
      const filtered = Number.isNaN(sinceEpoch)
        ? receipts
        : receipts.filter((r) => {
            const epoch = Date.parse(r.atISO);
            return !Number.isNaN(epoch) && epoch >= sinceEpoch;
          });
      return filtered.sort((a, z) => Date.parse(a.atISO) - Date.parse(z.atISO));
    } catch {
      return [];
    }
  }
}
