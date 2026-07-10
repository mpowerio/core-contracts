import { describe, it, expect } from 'vitest';
import {
  ArRailLeaf,
  parseBillingLog,
  type ArRailStore,
  DEFAULT_AR_DISARM_SENTINELS,
  DEFAULT_AR_DISARM_ENV,
} from './ar-rail.js';
import { isArmable, type ReadableLeaf, type Receipt } from '../../moc/leaf.js';
import {
  FIXTURE_BRIEF,
  FIXTURE_BRIEF_CLEAN,
  FIXTURE_BILLING_LOG_DRAFT,
  FIXTURE_BILLING_LOG_MIXED,
  FIXTURE_BILLING_LOG_FATAL,
  FIXTURE_GARBAGE,
  FIXTURE_PII_STRINGS,
} from './__fixtures__/ar-rail.js';

/**
 * LANE 2 of the 48h contract-variance test: the AR (money) rail as a
 * READ-ONLY ReadableLeaf shim. Read-only is a property of the TYPE (no
 * arm/fire implemented — the PII/money firewall pattern), never a runtime
 * throw. These tests also pin the PII firewall: recipient emails, client
 * names, and secrets paths present in the rail's files must NEVER appear in
 * any projected output.
 */

// ── helpers ──────────────────────────────────────────────────────────────

function makeStore(init: {
  brief?: string | null;
  billing?: string | null;
  disarmed?: boolean | null;
}): ArRailStore {
  return {
    readBrief: () => init.brief ?? null,
    readBillingLog: () => init.billing ?? null,
    readDisarmed: () => (init.disarmed === undefined ? null : init.disarmed),
  };
}

/** Serialize every read surface of the leaf into one string for PII checks. */
async function projectAll(leaf: ArRailLeaf): Promise<string> {
  const all = {
    status: await leaf.status(),
    lastRun: await leaf.lastRun(),
    pending: await leaf.pendingApprovals(),
    spend: await leaf.spend(),
    receipts: await leaf.receipts('1970-01-01T00:00:00Z'),
  };
  return JSON.stringify(all);
}

// ── parseBillingLog: pure, total, whitelist projection ──────────────────

describe('parseBillingLog', () => {
  it('parses CREATED lines into invoice number + USD amount (staged invoices), no id/name/email', () => {
    const entries = parseBillingLog(FIXTURE_BILLING_LOG_DRAFT);
    const created = entries.filter((e) => e.kind === 'created');
    expect(created).toHaveLength(3);
    expect(created[0]).toMatchObject({
      atISO: '2026-07-04T08:18:24-04:00',
      kind: 'created',
      invoiceNumber: 'MPIO-202607-AAA',
      amountUSD: 750,
    });
    expect(created[2]?.amountUSD).toBe(200);
    const s = JSON.stringify(created);
    for (const pii of FIXTURE_PII_STRINGS) expect(s).not.toContain(pii);
    expect(s).not.toContain('INV2-'); // PayPal internal ids not projected
  });

  it('parses run-complete markers with mode + month', () => {
    const entries = parseBillingLog(FIXTURE_BILLING_LOG_DRAFT);
    const runs = entries.filter((e) => e.kind === 'run_complete');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      atISO: '2026-07-04T08:18:26-04:00',
      mode: 'draft',
      month: '2026-07',
    });
  });

  it('parses SENT, SKIP and ERROR verbs; ERROR drops the HTTP body entirely', () => {
    const entries = parseBillingLog(FIXTURE_BILLING_LOG_MIXED);
    expect(entries.filter((e) => e.kind === 'skipped')[0]).toMatchObject({
      invoiceNumber: 'MPIO-202608-AAA',
    });
    expect(entries.filter((e) => e.kind === 'sent')[0]).toMatchObject({
      invoiceNumber: 'MPIO-202608-BBB',
      httpStatus: 202,
    });
    const err = entries.filter((e) => e.kind === 'error')[0];
    expect(err).toMatchObject({
      invoiceNumber: 'MPIO-202608-CCC',
      op: 'create',
      httpStatus: 422,
    });
    const s = JSON.stringify(entries);
    for (const pii of FIXTURE_PII_STRINGS) expect(s).not.toContain(pii);
  });

  it('maps FATAL to an error entry without the message tail (secrets path dropped)', () => {
    const entries = parseBillingLog(FIXTURE_BILLING_LOG_FATAL);
    const err = entries.filter((e) => e.kind === 'error');
    expect(err).toHaveLength(1);
    expect(err[0]?.atISO).toBe('2026-09-01T08:00:00-04:00');
    expect(JSON.stringify(entries)).not.toContain('.secrets');
  });

  it('is total: garbage and empty input parse to [] without throwing', () => {
    expect(parseBillingLog(FIXTURE_GARBAGE)).toEqual([]);
    expect(parseBillingLog('')).toEqual([]);
  });
});

// ── the contract carriage (the actual variance test) ────────────────────

describe('ArRailLeaf — read-only BY TYPE', () => {
  it('is a ReadableLeaf that isArmable() rejects — no arm/fire anywhere on the object', () => {
    const leaf: ReadableLeaf = new ArRailLeaf(makeStore({ brief: FIXTURE_BRIEF }));
    expect(leaf.id).toBe('ar');
    expect(isArmable(leaf)).toBe(false);
    expect('arm' in leaf).toBe(false);
    expect('fire' in leaf).toBe(false);
  });

  it('sits in the same ReadableLeaf[] as any other leaf with no special-casing', async () => {
    const leaves: ReadableLeaf[] = [new ArRailLeaf(makeStore({ brief: FIXTURE_BRIEF }))];
    // The stem's sweep: call every read method on every leaf, no try/catch.
    for (const leaf of leaves) {
      const status = await leaf.status();
      expect(status.leaf).toBe('ar');
      const armables = leaves.filter(isArmable);
      expect(armables).toHaveLength(0);
    }
  });
});

// ── status: rail arm state + brief health ───────────────────────────────

describe('ArRailLeaf.status', () => {
  it('reports the rail POSITIVELY ARMED (no disarm sentinel) with attention on overdue', async () => {
    const leaf = new ArRailLeaf(makeStore({ brief: FIXTURE_BRIEF, disarmed: false }));
    const s = await leaf.status();
    expect(s).toMatchObject({ leaf: 'ar', health: 'attention', armed: true, pendingCount: 0 });
    expect(s.summary).toContain('[ARMED]');
    expect(s.summary).toContain('2 overdue');
    expect(s.summary).toContain('6627.01');
  });

  it('reports DISARMED when the sentinel is present', async () => {
    const leaf = new ArRailLeaf(makeStore({ brief: FIXTURE_BRIEF_CLEAN, disarmed: true }));
    const s = await leaf.status();
    expect(s.armed).toBe(false);
    expect(s.health).toBe('ok');
    expect(s.summary).toContain('[DISARMED]');
  });

  it('never claims armed when the arm state cannot be determined', async () => {
    const leaf = new ArRailLeaf(makeStore({ brief: FIXTURE_BRIEF_CLEAN, disarmed: null }));
    const s = await leaf.status();
    expect(s.armed).toBe(false);
    expect(s.summary).toContain('arm state unknown');
  });

  it('degrades to health unknown without a brief, still reporting arm state', async () => {
    const leaf = new ArRailLeaf(makeStore({ brief: null, disarmed: true }));
    const s = await leaf.status();
    expect(s.health).toBe('unknown');
    expect(s.armed).toBe(false);
    expect(s.summary).toContain('[DISARMED]');
  });

  it('does not reject even when the injected store itself throws', async () => {
    const throwing: ArRailStore = {
      readBrief: () => {
        throw new Error('EACCES');
      },
      readBillingLog: () => {
        throw new Error('EACCES');
      },
      readDisarmed: () => {
        throw new Error('EACCES');
      },
    };
    const leaf = new ArRailLeaf(throwing);
    const s = await leaf.status();
    expect(s.health).toBe('unknown');
    expect(s.armed).toBe(false);
    expect((await leaf.receipts('1970-01-01T00:00:00Z'))).toEqual([]);
    expect((await leaf.lastRun()).outcome).toBe('unknown');
    expect((await leaf.spend()).asOfISO).toBeNull();
  });
});

// ── lastRun: later of brief heartbeat vs billing run ────────────────────

describe('ArRailLeaf.lastRun', () => {
  it('uses the brief when it is the most recent activity', async () => {
    const leaf = new ArRailLeaf(
      makeStore({ brief: FIXTURE_BRIEF, billing: FIXTURE_BILLING_LOG_DRAFT }),
    );
    const r = await leaf.lastRun();
    expect(r.lastRunISO).toBe('2026-07-10T00:00:00Z');
    expect(r.outcome).toBe('ok');
    expect(r.detail).toContain('scanned 22');
  });

  it('uses the billing run when it is more recent than the brief', async () => {
    const leaf = new ArRailLeaf(
      makeStore({ brief: FIXTURE_BRIEF, billing: FIXTURE_BILLING_LOG_MIXED }),
    );
    const r = await leaf.lastRun();
    expect(r.lastRunISO).toBe('2026-08-01T08:00:04-04:00');
    expect(r.outcome).toBe('ok');
    expect(r.detail).toContain('mode=send');
    expect(r.detail).toContain('month=2026-08');
  });

  it('reports outcome error when the billing log ends on an error entry', async () => {
    const leaf = new ArRailLeaf(makeStore({ billing: FIXTURE_BILLING_LOG_FATAL }));
    const r = await leaf.lastRun();
    expect(r.lastRunISO).toBe('2026-09-01T08:00:00-04:00');
    expect(r.outcome).toBe('error');
  });

  it('degrades to unknown when neither source exists', async () => {
    const leaf = new ArRailLeaf(makeStore({}));
    expect(await leaf.lastRun()).toEqual({ leaf: 'ar', lastRunISO: null, outcome: 'unknown' });
  });
});

// ── approvals + spend ────────────────────────────────────────────────────

describe('ArRailLeaf approvals + spend', () => {
  it('pendingApprovals is ALWAYS [] — read-only leaves have no approval surface', async () => {
    const leaf = new ArRailLeaf(
      makeStore({ brief: FIXTURE_BRIEF, billing: FIXTURE_BILLING_LOG_DRAFT }),
    );
    expect(await leaf.pendingApprovals()).toEqual([]);
  });

  it('spend surfaces outstanding AR from the brief', async () => {
    const leaf = new ArRailLeaf(makeStore({ brief: FIXTURE_BRIEF }));
    expect(await leaf.spend()).toEqual({
      leaf: 'ar',
      currency: 'USD',
      amount: 6627.01,
      basis: 'outstanding_ar',
      asOfISO: '2026-07-10T00:00:00Z',
    });
  });
});

// ── receipts: brief rows + billing entries, PII-free, epoch-filtered ─────

describe('ArRailLeaf.receipts', () => {
  const leaf = () =>
    new ArRailLeaf(makeStore({ brief: FIXTURE_BRIEF, billing: FIXTURE_BILLING_LOG_DRAFT }));

  it('projects overdue + paid brief rows WITHOUT recipients, and staged billing invoices with amounts', async () => {
    const rs = await leaf().receipts('1970-01-01T00:00:00Z');
    const kinds = rs.map((r) => r.kind);
    expect(kinds).toContain('invoice_overdue');
    expect(kinds).toContain('invoice_paid');
    expect(kinds).toContain('invoice_created');
    expect(kinds).toContain('billing_run_complete');

    const staged = rs.filter((r) => r.kind === 'invoice_created');
    expect(staged.map((r) => r.ref)).toEqual([
      'MPIO-202607-AAA',
      'MPIO-202607-BBB',
      'MPIO-202607-CCC',
    ]);
    expect(staged[0]?.detail).toContain('USD 750.00');
    expect(staged[2]?.detail).toContain('USD 200.00');

    const overdue = rs.filter((r) => r.kind === 'invoice_overdue');
    expect(overdue[0]?.ref).toBe('0010');
    expect(overdue[0]?.detail).toContain('57 days overdue');
  });

  it('filters by epoch (not string compare) so offset timestamps work against sinceISO', async () => {
    // 2026-07-04T08:18:26-04:00 == 12:18:26Z; a since of 10:00Z keeps it,
    // while a naive string compare ('2026-07-04T08…' < '2026-07-04T10…') would drop it.
    const kept = await leaf().receipts('2026-07-04T10:00:00Z');
    expect(kept.some((r) => r.kind === 'billing_run_complete')).toBe(true);
    // …and everything is excluded once since passes the brief date.
    const none = await leaf().receipts('2026-07-11T00:00:00Z');
    expect(none).toEqual([]);
  });

  it('returns everything (never throws) on an unparseable sinceISO', async () => {
    const rs = await leaf().receipts('not-a-date');
    expect(rs.length).toBeGreaterThan(0);
  });

  it('is sorted ascending by time', async () => {
    const rs = await leaf().receipts('1970-01-01T00:00:00Z');
    const epochs = rs.map((r: Receipt) => Date.parse(r.atISO));
    expect([...epochs].sort((a, b) => a - b)).toEqual(epochs);
  });
});

// ── THE PII FIREWALL ─────────────────────────────────────────────────────

describe('PII firewall', () => {
  it('no read surface ever emits an email, client name, or secrets path', async () => {
    const leaf = new ArRailLeaf(
      makeStore({ brief: FIXTURE_BRIEF, billing: FIXTURE_BILLING_LOG_MIXED, disarmed: false }),
    );
    const projected = await projectAll(leaf);
    for (const pii of FIXTURE_PII_STRINGS) expect(projected).not.toContain(pii);
    // The strongest invariant: nothing the shim projects contains an @ at all.
    expect(projected).not.toContain('@');
  });
});

// ── default binding constants (the consuming app wires the real fs) ─────

describe('default rail paths', () => {
  it('pins the real disarm sentinels + env flag for the consuming store', () => {
    expect(DEFAULT_AR_DISARM_SENTINELS).toEqual([
      '/home/maestro/projects/mpowerio-ar/DISARMED',
      '/home/maestro/.ar-disarmed',
    ]);
    expect(DEFAULT_AR_DISARM_ENV).toBe('AR_DISARMED');
  });
});
