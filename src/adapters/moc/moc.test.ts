import { describe, it, expect } from 'vitest';
import {
  NewsjackLeaf,
  type NewsjackStore,
  type SquawkStateShape,
  type NewsjackDraftRef,
} from './newsjack.js';
import { ArLeaf, parseBrief, type ArStore } from './ar.js';
import { isArmable, type ReadableLeaf } from '../../moc/leaf.js';

/**
 * THE MOC CLOVER VARIANCE TEST (§5 pass criterion, in code): the SINGLE leaf
 * contract must carry BOTH shapes cleanly — an ARMABLE leaf (newsjack, with a
 * real operator-approvable fire path) and a READ-ONLY leaf (AR, no fire surface
 * yet) — in the same ReadableLeaf[], discriminated by the `isArmable` type guard
 * (presence of arm/fire), NEVER by try/catch on a throwing stub. If this passes
 * and the package type-checks, the doer≠reviewer-preserving stem/leaf split is
 * real and Phase 2 (the stem) can build against ONE hierarchy.
 */

// ── In-memory fixture stores (tests NEVER touch the real leaf files) ──

function makeNewsjackStore(init: {
  state: SquawkStateShape | null;
  armed?: boolean;
  pending?: NewsjackDraftRef[];
}): NewsjackStore & { armed: boolean; approved: string[]; pending: NewsjackDraftRef[] } {
  return {
    state: init.state,
    armed: init.armed ?? false,
    pending: [...(init.pending ?? [])],
    approved: [] as string[],
    readState() {
      return this.state;
    },
    readArmed() {
      return this.armed;
    },
    setArmed(on: boolean) {
      this.armed = on;
    },
    listPending() {
      return this.pending;
    },
    approve(slug: string) {
      this.approved.push(slug);
      this.pending = this.pending.filter((d) => d.slug !== slug);
    },
  } as NewsjackStore & { state: SquawkStateShape | null; armed: boolean; approved: string[]; pending: NewsjackDraftRef[] };
}

// Real Daily Money Brief shape (ar-watch.sh print block, lines 306-338), pinned
// to the operator's 2026-07-10 latest-brief.txt.
const BRIEF_FIXTURE = `================================================================
 mpowerio — DAILY MONEY BRIEF  (2026-07-10)
 PayPal AR / Invoice-Watch  ·  READ-ONLY
================================================================

 Invoices scanned : 22
 Outstanding      : USD 6627.01  across 5 open invoice(s)
 Overdue          : 2 invoice(s)
 Paid (last 48h)  : 0 payment(s)
 Paid this month  : USD 0.00

----------------------------------------------------------------
 OVERDUE  (status SENT/UNPAID/PARTIALLY_PAID, past due date)
----------------------------------------------------------------
   #0010            USD 4147.01    57 days  jillraffinello@gmail.com
   #0011             USD 750.00    39 days  jillraffinello@gmail.com

----------------------------------------------------------------
 PAID — last 48h
----------------------------------------------------------------
   (none)

----------------------------------------------------------------
 REMINDER-ELIGIBLE  (overdue → would nudge with --send)
 NOTE: PayPal caps reminders at 2/day per invoice.
       DRY-RUN: nothing sent. Use:  ar-watch.sh --send <invoice_number>
----------------------------------------------------------------
   would remind  #0010            jillraffinello@gmail.com  (57 days overdue)
   would remind  #0011            jillraffinello@gmail.com  (39 days overdue)

================================================================
`;

function makeArStore(brief: string | null, billingLog: string | null = null): ArStore {
  return { readBrief: () => brief, readBillingLog: () => billingLog };
}

const SQUAWK_STATE: SquawkStateShape = {
  version: 1,
  seenTweetIds: ['1811111111', '1822222222'],
  userId: '44196397',
  lastRunISO: '2026-07-10T10:13:00Z',
};

const PENDING: NewsjackDraftRef[] = [
  {
    slug: 'squawk-1833333333-20260710',
    createdISO: '2026-07-10T10:13:05Z',
    tweetId: '1833333333',
    preview: 'The Fed just blinked — here is what the desk missed…',
  },
];

describe('MOC clover — THE KEYSTONE variance test', () => {
  it('carries an armable AND a read-only leaf in ONE ReadableLeaf[], discriminated by isArmable with no try/catch', async () => {
    const newsjack = new NewsjackLeaf(makeNewsjackStore({ state: SQUAWK_STATE, armed: true, pending: PENDING }));
    const ar = new ArLeaf(makeArStore(BRIEF_FIXTURE));

    // Both shapes coexist in ONE homogeneous list of the SINGLE contract type.
    const leaves: ReadableLeaf[] = [newsjack, ar];

    // Iterate calling EVERY read method on BOTH — no special-casing, no try/catch.
    for (const leaf of leaves) {
      const status = await leaf.status();
      const run = await leaf.lastRun();
      const pending = await leaf.pendingApprovals();
      const spend = await leaf.spend();
      const receipts = await leaf.receipts('2000-01-01T00:00:00Z');
      expect(status.leaf).toBe(leaf.id);
      expect(run.leaf).toBe(leaf.id);
      expect(Array.isArray(pending)).toBe(true);
      expect(spend.leaf).toBe(leaf.id);
      expect(Array.isArray(receipts)).toBe(true);
    }

    // The honest structural discrimination — presence of arm/fire, NOT a throw.
    expect(isArmable(newsjack)).toBe(true);
    expect(isArmable(ar)).toBe(false);

    // Only the armable leaf exposes arm/fire; the guard narrows the type so the
    // read-only leaf is never even offered the mutation surface. This is the
    // PII-firewall-as-a-type-property property proven at runtime.
    let armedCount = 0;
    for (const leaf of leaves) {
      if (isArmable(leaf)) {
        await leaf.arm(false); // type-narrowed — compiler admits arm() here only
        armedCount++;
      }
    }
    expect(armedCount).toBe(1); // exactly the newsjack leaf
  });
});

describe('NewsjackLeaf (ArmableLeaf)', () => {
  it('reports pending drafts + armed state from the squawk state.json read-map', async () => {
    const leaf = new NewsjackLeaf(makeNewsjackStore({ state: SQUAWK_STATE, armed: true, pending: PENDING }));
    const status = await leaf.status();
    expect(status.health).toBe('attention');
    expect(status.armed).toBe(true);
    expect(status.pendingCount).toBe(1);

    const cards = await leaf.pendingApprovals();
    expect(cards).toHaveLength(1);
    expect(cards[0]!.id).toBe('squawk-1833333333-20260710');
    expect(cards[0]!.leaf).toBe('newsjack');
    expect(cards[0]!.title).toContain('1833333333');
    expect(cards[0]!.preview).toContain('Fed just blinked');
  });

  it('maps lastRunISO/seen count into the RunSummary', async () => {
    const leaf = new NewsjackLeaf(makeNewsjackStore({ state: SQUAWK_STATE }));
    const run = await leaf.lastRun();
    expect(run.lastRunISO).toBe('2026-07-10T10:13:00Z');
    expect(run.outcome).toBe('ok');
    expect(run.detail).toBe('2 tweet(s) seen');
  });

  it('arm(on) flips the AUTO_ARM-equivalent flag', async () => {
    const store = makeNewsjackStore({ state: SQUAWK_STATE, armed: false });
    const leaf = new NewsjackLeaf(store);
    expect((await leaf.status()).armed).toBe(false);
    await leaf.arm(true);
    expect(store.armed).toBe(true);
    expect((await leaf.status()).armed).toBe(true);
  });

  it('fire(id) approves an existing pending draft (draft→approved)', async () => {
    const store = makeNewsjackStore({ state: SQUAWK_STATE, pending: PENDING });
    const leaf = new NewsjackLeaf(store);
    await leaf.fire('squawk-1833333333-20260710');
    expect(store.approved).toEqual(['squawk-1833333333-20260710']);
    // The approved draft leaves the pending queue.
    expect(await leaf.pendingApprovals()).toHaveLength(0);
  });

  it('fire(unknown id) REJECTS (mutations may throw — unlike the read contract)', async () => {
    const leaf = new NewsjackLeaf(makeNewsjackStore({ state: SQUAWK_STATE, pending: PENDING }));
    await expect(leaf.fire('does-not-exist')).rejects.toThrow(/no pending draft/);
  });

  it('receipts() emits a tick_ran receipt only at/after sinceISO (non-throwing)', async () => {
    const leaf = new NewsjackLeaf(makeNewsjackStore({ state: SQUAWK_STATE }));
    expect(await leaf.receipts('2000-01-01T00:00:00Z')).toHaveLength(1);
    // sinceISO after the last run → filtered out.
    expect(await leaf.receipts('2026-07-11T00:00:00Z')).toHaveLength(0);
  });

  it('degrades to health "idle" when no state.json exists (never run) — read contract holds', async () => {
    const leaf = new NewsjackLeaf(makeNewsjackStore({ state: null }));
    const status = await leaf.status();
    expect(status.health).toBe('idle');
    expect((await leaf.lastRun()).lastRunISO).toBeNull();
  });

  it('NEVER throws from a read method even when the store throws (degrades to "unknown")', async () => {
    const brokenStore: NewsjackStore = {
      readState() { throw new Error('disk gone'); },
      readArmed() { throw new Error('disk gone'); },
      setArmed() {},
      listPending() { throw new Error('disk gone'); },
      approve() {},
    };
    const leaf = new NewsjackLeaf(brokenStore);
    const status = await leaf.status(); // must resolve, not reject
    expect(status.health).toBe('unknown');
    expect(await leaf.pendingApprovals()).toEqual([]);
    expect(await leaf.receipts('2000-01-01T00:00:00Z')).toEqual([]);
  });
});

describe('parseBrief (pure text parser)', () => {
  it('extracts the summary figures from the real brief format', () => {
    const b = parseBrief(BRIEF_FIXTURE);
    expect(b.date).toBe('2026-07-10');
    expect(b.scanned).toBe(22);
    expect(b.currency).toBe('USD');
    expect(b.outstanding).toBe(6627.01);
    expect(b.openCount).toBe(5);
    expect(b.overdueCount).toBe(2);
    expect(b.paidThisMonth).toBe(0);
  });

  it('parses OVERDUE rows section-scoped (days shape), skipping the "(none)" PAID row', () => {
    const b = parseBrief(BRIEF_FIXTURE);
    expect(b.overdue).toHaveLength(2);
    expect(b.overdue[0]).toEqual({
      invoiceNumber: '0010',
      currency: 'USD',
      amount: 4147.01,
      daysOverdue: 57,
      recipient: 'jillraffinello@gmail.com',
    });
    expect(b.overdue[1]!.amount).toBe(750);
    expect(b.overdue[1]!.daysOverdue).toBe(39);
    expect(b.paid).toHaveLength(0); // "(none)" is not a row
  });

  it('parses a PAID — last 48h row (date shape) when present', () => {
    const withPaid = BRIEF_FIXTURE.replace(
      '   (none)',
      '   #0009             USD 500.00  2026-07-09  paid@example.com',
    );
    const b = parseBrief(withPaid);
    expect(b.paid).toHaveLength(1);
    expect(b.paid[0]).toEqual({
      invoiceNumber: '0009',
      currency: 'USD',
      amount: 500,
      paymentDate: '2026-07-09',
      recipient: 'paid@example.com',
    });
  });

  it('returns an all-null/empty shape on garbage input (total, never throws)', () => {
    const b = parseBrief('not a brief at all');
    expect(b.date).toBeNull();
    expect(b.outstanding).toBeNull();
    expect(b.overdue).toEqual([]);
    expect(b.paid).toEqual([]);
  });
});

describe('ArLeaf (ReadableLeaf ONLY — the read-only variance)', () => {
  it('is NOT armable (no arm/fire by type)', () => {
    const leaf = new ArLeaf(makeArStore(BRIEF_FIXTURE));
    expect(isArmable(leaf)).toBe(false);
  });

  it('status = attention when invoices are overdue, with an outstanding summary', async () => {
    const status = await new ArLeaf(makeArStore(BRIEF_FIXTURE)).status();
    expect(status.leaf).toBe('ar');
    expect(status.health).toBe('attention');
    expect(status.armed).toBe(false);
    expect(status.pendingCount).toBe(0);
    expect(status.summary).toContain('2 overdue');
    expect(status.summary).toContain('6627.01');
  });

  it('status = ok when nothing is overdue', async () => {
    const clean = BRIEF_FIXTURE
      .replace('Overdue          : 2 invoice(s)', 'Overdue          : 0 invoice(s)');
    const status = await new ArLeaf(makeArStore(clean)).status();
    expect(status.health).toBe('ok');
  });

  it('lastRun maps the brief date to a date-granular ISO run time', async () => {
    const run = await new ArLeaf(makeArStore(BRIEF_FIXTURE)).lastRun();
    expect(run.lastRunISO).toBe('2026-07-10T00:00:00Z');
    expect(run.outcome).toBe('ok');
    expect(run.detail).toContain('scanned 22');
  });

  it('spend maps outstanding AR into the Spend envelope', async () => {
    const spend = await new ArLeaf(makeArStore(BRIEF_FIXTURE)).spend();
    expect(spend).toEqual({
      leaf: 'ar',
      currency: 'USD',
      amount: 6627.01,
      basis: 'outstanding_ar',
      asOfISO: '2026-07-10T00:00:00Z',
    });
  });

  it('pendingApprovals is ALWAYS [] (read-only by type; Phase-4 --json retrofit)', async () => {
    expect(await new ArLeaf(makeArStore(BRIEF_FIXTURE)).pendingApprovals()).toEqual([]);
  });

  it('receipts emits one invoice_overdue receipt per OVERDUE row, filtered by sinceISO', async () => {
    const leaf = new ArLeaf(makeArStore(BRIEF_FIXTURE));
    const receipts = await leaf.receipts('2000-01-01T00:00:00Z');
    expect(receipts).toHaveLength(2);
    expect(receipts.every((r) => r.kind === 'invoice_overdue')).toBe(true);
    expect(receipts[0]!.ref).toBe('0010');
    // sinceISO after the brief date → all overdue rows filtered out.
    expect(await leaf.receipts('2026-07-11T00:00:00Z')).toHaveLength(0);
  });

  it('degrades to health "unknown" when the brief is absent — read contract holds', async () => {
    const leaf = new ArLeaf(makeArStore(null));
    const status = await leaf.status();
    expect(status.health).toBe('unknown');
    expect((await leaf.lastRun()).lastRunISO).toBeNull();
    expect(await leaf.receipts('2000-01-01T00:00:00Z')).toEqual([]);
  });
});
