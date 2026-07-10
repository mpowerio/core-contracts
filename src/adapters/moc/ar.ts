/**
 * AR (PayPal Accounts-Receivable) MOC adapter — maps the Daily Money Brief's
 * EXISTING text INTO the leaf contract. This is the READ-ONLY variance test: AR
 * has NO operator-approvable fire surface yet (ar-watch.sh emits a human brief,
 * not a --json control plane), so the leaf implements ReadableLeaf ONLY — no
 * arm/fire BY TYPE. That is the whole point of the variance test: one contract,
 * two shapes, discriminated structurally, no throwing stub methods.
 *
 * READ-MAPPER over what the leaf ALREADY ships — it does NOT add --json (that is
 * a later phase). It parses the plain-text brief ar-watch.sh writes to
 * latest-brief.txt and the CREATED/SENT lines ar-monthly-billing.sh appends to
 * ar-monthly-billing.log. The brief format is pinned to ar-watch.sh's print
 * block (lines 306-338): header `(YYYY-MM-DD)`, `Outstanding : USD <amt> across
 * <n> open invoice(s)`, `Overdue : <n> invoice(s)`, and per-row OVERDUE
 * (`#<num> <CUR> <amt> <days> days <email>`) / PAID (`#<num> <CUR> <amt> <date>
 * <email>`) lines. The reader is injected (an `ArStore`) so the leaf is unit-
 * testable with a fixture brief and never reads the operator's live file in tests.
 */
import type {
  LeafHealth,
  LeafStatus,
  Receipt,
  ReadableLeaf,
  RunSummary,
  Spend,
} from '../../moc/leaf.js';

/** Default brief + billing-log paths (mpowerio-ar). The consuming store may override. */
export const DEFAULT_AR_BRIEF_FILE = '/home/maestro/projects/mpowerio-ar/latest-brief.txt';
export const DEFAULT_AR_BILLING_LOG = '/home/maestro/projects/mpowerio-ar/ar-monthly-billing.log';

const LEAF = 'ar' as const;

/** The injected read effects: the consuming MOC app wires these to the real files. */
export interface ArStore {
  /** Contents of latest-brief.txt, or null if absent/unreadable. */
  readBrief(): string | null;
  /** Contents of ar-monthly-billing.log, or null if absent/unreadable. */
  readBillingLog(): string | null;
}

/** One row of the OVERDUE section of the brief. */
export interface ArOverdueRow {
  invoiceNumber: string;
  currency: string;
  amount: number;
  daysOverdue: number;
  recipient: string;
}

/** One row of the PAID — last 48h section of the brief. */
export interface ArPaidRow {
  invoiceNumber: string;
  currency: string;
  amount: number;
  /** ISO-8601 date the payment posted (date-granular in the brief). */
  paymentDate: string;
  recipient: string;
}

/** Structured view of one Daily Money Brief. All fields null when unparseable. */
export interface ParsedBrief {
  /** Brief date (date-granular), e.g. '2026-07-10', or null. */
  date: string | null;
  scanned: number | null;
  currency: string | null;
  outstanding: number | null;
  openCount: number | null;
  overdueCount: number | null;
  paidThisMonth: number | null;
  overdue: ArOverdueRow[];
  paid: ArPaidRow[];
}

/** date-only 'YYYY-MM-DD' → ISO-8601 at UTC midnight (brief is date-granular). */
function dateToISO(date: string): string {
  return `${date}T00:00:00Z`;
}

/**
 * Parse the plain-text Daily Money Brief. Pure + total: any missing/garbled
 * field becomes null (or an empty row list) — it never throws, so the leaf's
 * non-throwing read contract holds even on a truncated brief.
 */
export function parseBrief(text: string): ParsedBrief {
  const out: ParsedBrief = {
    date: null,
    scanned: null,
    currency: null,
    outstanding: null,
    openCount: null,
    overdueCount: null,
    paidThisMonth: null,
    overdue: [],
    paid: [],
  };

  const dateM = text.match(/DAILY MONEY BRIEF\s*\((\d{4}-\d{2}-\d{2})\)/);
  if (dateM?.[1]) out.date = dateM[1];

  const scannedM = text.match(/Invoices scanned\s*:\s*(\d+)/);
  if (scannedM?.[1]) out.scanned = Number(scannedM[1]);

  const outM = text.match(/Outstanding\s*:\s*([A-Z]{3})\s+([\d.]+)\s+across\s+(\d+)\s+open/);
  if (outM?.[1] && outM[2] && outM[3]) {
    out.currency = outM[1];
    out.outstanding = Number(outM[2]);
    out.openCount = Number(outM[3]);
  }

  const overdueM = text.match(/Overdue\s*:\s*(\d+)\s+invoice/);
  if (overdueM?.[1]) out.overdueCount = Number(overdueM[1]);

  const paidMonthM = text.match(/Paid this month\s*:\s*([A-Z]{3})\s+([\d.]+)/);
  if (paidMonthM?.[2]) {
    out.paidThisMonth = Number(paidMonthM[2]);
    if (!out.currency && paidMonthM[1]) out.currency = paidMonthM[1];
  }

  // Row parsing is section-scoped so the OVERDUE (`<days> days`) and PAID
  // (`<date>`) row shapes are never confused for one another.
  let section: 'overdue' | 'paid' | null = null;
  for (const line of text.split('\n')) {
    if (/^\s*OVERDUE\b/.test(line)) { section = 'overdue'; continue; }
    if (/^\s*PAID\b/.test(line)) { section = 'paid'; continue; }
    if (/^\s*REMINDER-ELIGIBLE\b/.test(line)) { section = null; continue; }
    if (section === 'overdue') {
      const m = line.match(/^\s*#(\S+)\s+([A-Z]{3})\s+([\d.]+)\s+(\d+)\s+days\s+(.*\S)\s*$/);
      if (m?.[1] && m[2] && m[3] && m[4] && m[5]) {
        out.overdue.push({
          invoiceNumber: m[1],
          currency: m[2],
          amount: Number(m[3]),
          daysOverdue: Number(m[4]),
          recipient: m[5],
        });
      }
    } else if (section === 'paid') {
      const m = line.match(/^\s*#(\S+)\s+([A-Z]{3})\s+([\d.]+)\s+(\d{4}-\d{2}-\d{2})\s+(.*\S)\s*$/);
      if (m?.[1] && m[2] && m[3] && m[4] && m[5]) {
        out.paid.push({
          invoiceNumber: m[1],
          currency: m[2],
          amount: Number(m[3]),
          paymentDate: m[4],
          recipient: m[5],
        });
      }
    }
  }

  return out;
}

/** AR leaf — the READ-ONLY clover variance test (ReadableLeaf, NO arm/fire). */
export class ArLeaf implements ReadableLeaf {
  readonly id = LEAF;

  constructor(private readonly store: ArStore) {}

  private brief(): ParsedBrief | null {
    const text = this.store.readBrief();
    return text === null ? null : parseBrief(text);
  }

  async status(): Promise<LeafStatus> {
    try {
      const b = this.brief();
      if (b === null || b.date === null) {
        return { leaf: LEAF, health: 'unknown', armed: false, pendingCount: 0, summary: 'AR: no brief available' };
      }
      const overdue = b.overdueCount ?? 0;
      const health: LeafHealth = overdue > 0 ? 'attention' : 'ok';
      const cur = b.currency ?? 'USD';
      const outstanding = b.outstanding ?? 0;
      const summary = overdue > 0
        ? `AR: ${overdue} overdue, ${cur} ${outstanding.toFixed(2)} outstanding across ${b.openCount ?? 0} open`
        : `AR: nothing overdue, ${cur} ${outstanding.toFixed(2)} outstanding`;
      // pendingCount is 0: AR has no operator-approval surface (it is read-only
      // by type). Reminder-firing is a Phase-4 --json retrofit, not an approval queue.
      return { leaf: LEAF, health, armed: false, pendingCount: 0, summary };
    } catch {
      return { leaf: LEAF, health: 'unknown', armed: false, pendingCount: 0, summary: 'AR: status unavailable' };
    }
  }

  async lastRun(): Promise<RunSummary> {
    try {
      const b = this.brief();
      if (b === null || b.date === null) return { leaf: LEAF, lastRunISO: null, outcome: 'unknown' };
      return {
        leaf: LEAF,
        lastRunISO: dateToISO(b.date),
        outcome: 'ok',
        detail: `scanned ${b.scanned ?? 0} invoice(s), ${b.overdueCount ?? 0} overdue`,
      };
    } catch {
      return { leaf: LEAF, lastRunISO: null, outcome: 'unknown' };
    }
  }

  /**
   * ALWAYS []. AR is read-only BY TYPE — it has no fire surface, so it can have
   * no approval queue. Its tier-4 reminder approvals await the Phase-4 --json
   * retrofit (ar-watch.sh has no machine control plane yet); once that lands, AR
   * graduates to ArmableLeaf and this method returns real cards.
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
   * Receipts from the brief: each OVERDUE row (as-of the brief date) and each
   * PAID-last-48h row (at its payment date). Returned only when at/after
   * `sinceISO`. Overdue rows are date-granular (the brief carries no timestamp),
   * so their atISO is the brief date at UTC midnight.
   */
  async receipts(sinceISO: string): Promise<Receipt[]> {
    try {
      const b = this.brief();
      if (b === null || b.date === null) return [];
      const briefISO = dateToISO(b.date);
      const receipts: Receipt[] = [];
      for (const o of b.overdue) {
        receipts.push({
          leaf: LEAF,
          atISO: briefISO,
          kind: 'invoice_overdue',
          detail: `${o.invoiceNumber} ${o.currency} ${o.amount.toFixed(2)} — ${o.daysOverdue} days overdue (${o.recipient})`,
          ref: o.invoiceNumber,
        });
      }
      for (const p of b.paid) {
        receipts.push({
          leaf: LEAF,
          atISO: dateToISO(p.paymentDate),
          kind: 'invoice_paid',
          detail: `${p.invoiceNumber} ${p.currency} ${p.amount.toFixed(2)} paid (${p.recipient})`,
          ref: p.invoiceNumber,
        });
      }
      return receipts.filter((r) => r.atISO >= sinceISO);
    } catch {
      return [];
    }
  }
}
