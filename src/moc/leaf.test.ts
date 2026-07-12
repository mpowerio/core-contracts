import { describe, it, expect } from 'vitest';
import { isArmable, ARMABLE_BRAND, type ArmableLeaf, type ReadableLeaf } from './leaf.js';

/**
 * The nominal-brand guard on isArmable. The firewall this proves: a leaf reaches
 * the arm/fire dispatch ONLY by deliberately carrying ARMABLE_BRAND — bare
 * structural arm/fire (accidental duck-typing) is NOT enough. This closes the
 * PII/money-firewall hole where an implementor's stray arm/fire pair on a
 * read-only leaf would pass a purely structural guard.
 */

/** A minimal read-only leaf; the read methods are never exercised in these tests. */
function readableStub(id: ReadableLeaf['id'] = 'packet'): ReadableLeaf {
  return {
    id,
    status: async () => ({ leaf: id, health: 'unknown', armed: false, pendingCount: 0, summary: '' }),
    lastRun: async () => ({ leaf: id, lastRunISO: null, outcome: 'unknown' }),
    pendingApprovals: async () => [],
    spend: async () => ({ leaf: id, currency: 'USD', amount: 0, basis: 'test', asOfISO: null }),
    receipts: async () => [],
  };
}

describe('isArmable — nominal brand guard', () => {
  it('REJECTS a plain object with arm+fire but NO brand (the accidental duck-typing case)', () => {
    // Red-first: before the brand, this object passed isArmable() and would have
    // been offered the fire surface. It must now be rejected.
    const ducktyped = {
      ...readableStub('ar'),
      arm: async () => {},
      fire: async () => {},
    } as ReadableLeaf;
    expect('arm' in ducktyped && 'fire' in ducktyped).toBe(true);
    expect(isArmable(ducktyped)).toBe(false);
  });

  it('ACCEPTS a leaf that deliberately imports and sets ARMABLE_BRAND', () => {
    const branded = {
      ...readableStub('reaction'),
      [ARMABLE_BRAND]: true,
      arm: async () => {},
      fire: async () => {},
    } as unknown as ArmableLeaf;
    expect(isArmable(branded)).toBe(true);
  });

  it('REJECTS a branded object that is missing arm/fire (brand alone is insufficient)', () => {
    const brandOnly = { ...readableStub('ar'), [ARMABLE_BRAND]: true } as unknown as ReadableLeaf;
    expect(isArmable(brandOnly)).toBe(false);
  });

  it('REJECTS a plain read-only leaf', () => {
    expect(isArmable(readableStub('packet'))).toBe(false);
  });

  it('cannot be forged via Symbol.for — the brand is a module-local unique symbol', () => {
    const forgedKey = Symbol.for('mpowerio.core-contracts/ArmableLeaf');
    expect(ARMABLE_BRAND).not.toBe(forgedKey);
    const forged = {
      ...readableStub('ar'),
      [forgedKey]: true,
      arm: async () => {},
      fire: async () => {},
    } as ReadableLeaf;
    expect(isArmable(forged)).toBe(false);
  });
});
