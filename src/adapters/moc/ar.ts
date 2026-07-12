/**
 * AR (PayPal Accounts-Receivable) shared read primitives — the Daily Money
 * Brief parser + row types + the injected `ArStore` effect surface that the AR
 * leaf reads over. The concrete leaf adapter lives in `./ar-rail.ts`
 * (`ArRailLeaf`, the surviving canonical AR ReadableLeaf); this module holds the
 * pure, framework-free parsing it shares.
 *
 * (History: an earlier `ArLeaf` class also lived here — the brief-only lane-1
 * read adapter of the 48h contract-variance test. It was retired during the
 * de-vendor pass in favour of `ArRailLeaf`, which is a strict superset:
 * whitelist PII firewall on receipts, monthly-billing-log coverage, and real
 * kill-switch arm-state. Git history preserves the old class.)
 *
 * PURE READ-MAPPER over what the leaf ALREADY ships — it does NOT add --json
 * (that is a later phase). `parseBrief` reads the plain-text brief ar-watch.sh
 * writes to latest-brief.txt. The brief format is pinned to ar-watch.sh's print
 * block (lines 306-338): header `(YYYY-MM-DD)`, `Outstanding : USD <amt> across
 * <n> open invoice(s)`, `Overdue : <n> invoice(s)`, and per-row OVERDUE
 * (`#<num> <CUR> <amt> <days> days <email>`) / PAID (`#<num> <CUR> <amt> <date>
 * <email>`) lines. The reader is injected (an `ArStore`) so the leaf is unit-
 * testable with a fixture brief and never reads the operator's live file in tests.
 */

/** Default brief + billing-log paths (mpowerio-ar). The consuming store may override — see `resolveArPaths` in ./ar-rail.ts. */
export const DEFAULT_AR_BRIEF_FILE = '/home/maestro/projects/mpowerio-ar/latest-brief.txt';
export const DEFAULT_AR_BILLING_LOG = '/home/maestro/projects/mpowerio-ar/ar-monthly-billing.log';

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
