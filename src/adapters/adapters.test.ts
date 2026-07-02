import { describe, it, expect } from 'vitest';
import {
  jbetProposedChange,
  jbetGammaArtifact,
  type JbetTripProposedChangeRow,
  type JbetGammaPresentationRow,
} from './jbet.js';
import {
  fpcProposedChange,
  fpcProposalArtifact,
  type FpcEstimateProposedChangeRow,
  type FpcProposalRow,
} from './fpc.js';
import type { ProposedChange, ProposedChangeStatus, ArtifactRecord } from '../index.js';

/**
 * THE FACTORY GATE (representative form): two different verticals, with two
 * different local schemas, must both map cleanly INTO the same contract
 * envelopes — without the contracts knowing any vertical noun. If these pass
 * and the package type-checks with zero framework deps, the shared-core seam
 * is real for these two contracts.
 */

describe('JBET adapter → contracts', () => {
  // Ground truth: JBET `trip_proposed_changes` (portal migration 065, lines 34-48).
  // Real columns: id, trip_id, proposed_by (actor email), action, payload(jsonb),
  // diff(jsonb {before,after,summary}), status, expires_at, applied_at,
  // applied_by, failure_reason, created_at.
  it('maps a pending trip_proposed_changes row losslessly (real schema: created_at/diff.summary)', () => {
    const row: JbetTripProposedChangeRow = {
      id: 'tpc_1',
      trip_id: 'trip_9',
      action: 'update_pricing_per_guest',
      payload: { guestId: 'g1', amount: 4200 },
      // Real column is nested `diff.summary` jsonb, NOT a flat `diff_summary`.
      diff: { summary: '+$4,200 for guest g1', before: {}, after: {} },
      status: 'proposed',
      // Real actor email — unlike FPC, JBET records who proposed each change.
      proposed_by: 'andrea@jbelitetravel.com',
      expires_at: '2026-06-30T12:00:00Z',
      applied_at: null,
      applied_by: null,
      failure_reason: null,
      // Real column is `created_at`, NOT `proposed_at`.
      created_at: '2026-06-29T12:00:00Z',
    };
    const pc: ProposedChange = jbetProposedChange(row);
    expect(pc.id).toBe('tpc_1');
    expect(pc.action).toBe('update_pricing_per_guest');
    expect(pc.payload).toEqual({ guestId: 'g1', amount: 4200 });
    expect(pc.status).toBe('proposed');
    expect(pc.diffSummary).toBe('+$4,200 for guest g1');
    expect(pc.proposedBy).toBe('andrea@jbelitetravel.com');
    expect(pc.proposedAt).toBe('2026-06-29T12:00:00Z');
    // null DB columns must be OMITTED (exactOptionalPropertyTypes), not undefined-set.
    expect('resolvedAt' in pc).toBe(false);
    expect('resolvedBy' in pc).toBe(false);
  });

  it('maps an applied row: applied_at/applied_by → resolvedAt/resolvedBy', () => {
    const pc = jbetProposedChange({
      id: 'tpc_a',
      trip_id: 'trip_9',
      action: 'confirm_vendor',
      payload: { vendorId: 'v3' },
      diff: { summary: 'vendor v3 pending → confirmed' },
      status: 'applied',
      proposed_by: 'juan@jbelitetravel.com',
      expires_at: '2026-06-30T12:00:00Z',
      applied_at: '2026-06-29T13:00:00Z',
      applied_by: 'janella@jbelitetravel.com',
      failure_reason: null,
      created_at: '2026-06-29T12:00:00Z',
    });
    expect(pc.status).toBe('applied');
    expect(pc.resolvedAt).toBe('2026-06-29T13:00:00Z');
    expect(pc.resolvedBy).toBe('janella@jbelitetravel.com');
  });

  it('maps a rejected row: reject does NOT set applied_at (invariant I3) → resolvedAt omitted', () => {
    // proposal-actions.ts:124-131 — reject only flips status; audit queries
    // filter `applied_at IS NOT NULL` to mean "actually applied".
    const pc = jbetProposedChange({
      id: 'tpc_r',
      trip_id: 'trip_9',
      action: 'assign_guest_to_room',
      payload: { guestId: 'g2', roomId: 'r1' },
      diff: { summary: 'guest g2 → room r1' },
      status: 'rejected',
      proposed_by: 'caterina@jbelitetravel.com',
      expires_at: '2026-06-30T12:00:00Z',
      applied_at: null,
      applied_by: null,
      failure_reason: null,
      created_at: '2026-06-29T12:00:00Z',
    });
    expect(pc.status).toBe('rejected');
    expect('resolvedAt' in pc).toBe(false);
    expect('resolvedBy' in pc).toBe(false);
  });

  it("maps a 'failed' row losslessly (migration 065 CAS-race terminal state)", () => {
    // JBET's real trip_proposed_changes CHECK is
    // (status IN ('proposed','applied','expired','failed','rejected')) — 'failed'
    // is a real terminal state, so the shared envelope must carry it. The row
    // also carries failure_reason (065:46), which has no envelope field.
    const pc = jbetProposedChange({
      id: 'tpc_f',
      trip_id: 'trip_9',
      action: 'update_itinerary_item',
      payload: { itemId: 'i9' },
      diff: {},
      status: 'failed',
      proposed_by: 'juan@jbelitetravel.com',
      expires_at: '2026-07-01T00:00:00Z',
      applied_at: null,
      applied_by: null,
      failure_reason: 'CAS flip succeeded but mutation failed',
      created_at: '2026-06-30T00:00:00Z',
    });
    expect(pc.status).toBe('failed');
    expect('resolvedAt' in pc).toBe(false);
    // diff without .summary → diffSummary omitted.
    expect('diffSummary' in pc).toBe(false);
  });

  // Ground truth: JBET `gamma_presentations` (migrations 20260421_001 +
  // 20260427_001). Real status union is draft|shared|archived|generating
  // (src/types/gamma.ts:7) — there is NO 'completed', NO 'failed', and NO
  // last_checked_at column.
  it('maps a draft gamma_presentations row into a ready ArtifactRecord', () => {
    const row: JbetGammaPresentationRow = {
      id: 'gp_1',
      trip_id: 'trip_9',
      status: 'draft',
      gamma_url: 'https://gamma.app/docs/09dvq12shdwmvbg',
    };
    const art: ArtifactRecord<'gamma_itinerary'> = jbetGammaArtifact(row);
    expect(art.kind).toBe('gamma_itinerary');
    expect(art.sourceResourceType).toBe('trip');
    expect(art.sourceResourceId).toBe('trip_9');
    expect(art.provider).toBe('gamma');
    expect(art.status).toBe('ready');
    expect(art.externalUrl).toBe('https://gamma.app/docs/09dvq12shdwmvbg');
    // gamma_presentations has NO last_checked_at column — must not be invented.
    expect('lastCheckedAt' in art).toBe(false);
  });

  it('maps shared and archived gamma rows to "ready" (deck exists in all three)', () => {
    const base = { id: 'gp_s', trip_id: 'trip_5', gamma_url: 'https://gamma.app/docs/abc123' };
    expect(jbetGammaArtifact({ ...base, status: 'shared' }).status).toBe('ready');
    expect(jbetGammaArtifact({ ...base, status: 'archived' }).status).toBe('ready');
  });

  it('maps a still-generating gamma row to status "generating" with no url', () => {
    const art = jbetGammaArtifact({
      id: 'gp_2',
      trip_id: 'trip_5',
      status: 'generating',
      gamma_url: null,
    });
    expect(art.status).toBe('generating');
    expect('externalUrl' in art).toBe(false);
  });
});

describe('FPC adapter → contracts', () => {
  // Ground truth: FPC `estimate_proposed_changes` (migrations 022 + 023).
  // Real columns: id, estimate_id, proposed_at, proposed_by_message_id, action,
  // params(jsonb), diff(jsonb w/ nested .summary), status, applied_at, rejected_at.
  it('maps an applied estimate_proposed_changes row losslessly (real schema, params/diff/proposed_at)', () => {
    const row: FpcEstimateProposedChangeRow = {
      id: 'epc_1',
      estimate_id: 'est_7',
      action: 'add_line_item',
      // Real column is `params`, NOT `payload`.
      params: { sku: 'concrete-yd', qty: 12 },
      status: 'applied',
      // Real column is nested `diff.summary`, NOT a flat `diff_summary`.
      diff: { summary: '+12 yd concrete', before: {}, after: {} },
      // Real column is a message backlink, NOT an actor; FPC records no
      // per-proposal actor, so the envelope's proposedBy is the constant 'agent'.
      proposed_by_message_id: 'msg_42',
      // Real column is `proposed_at`, NOT `created_at`.
      proposed_at: '2026-06-20T09:00:00Z',
      // Resolution is split by outcome: applied_at | rejected_at (no resolved_at/by).
      applied_at: '2026-06-20T09:05:00Z',
      rejected_at: null,
    };
    const pc: ProposedChange = fpcProposedChange(row);
    expect(pc.id).toBe('epc_1');
    expect(pc.action).toBe('add_line_item');
    expect(pc.payload).toEqual({ sku: 'concrete-yd', qty: 12 });
    expect(pc.status).toBe('applied');
    expect(pc.diffSummary).toBe('+12 yd concrete');
    // FPC has no per-proposal actor — every row is agent-proposed.
    expect(pc.proposedBy).toBe('agent');
    // The seam: FPC's `proposed_at` normalizes to the SAME envelope field JBET
    // populates from its own proposed-at column.
    expect(pc.proposedAt).toBe('2026-06-20T09:00:00Z');
    // applied_at collapses into the shared resolvedAt.
    expect(pc.resolvedAt).toBe('2026-06-20T09:05:00Z');
    // FPC has no resolver actor — resolvedBy must be OMITTED, not undefined-set.
    expect('resolvedBy' in pc).toBe(false);
  });

  it('maps a rejected row: rejected_at collapses into resolvedAt', () => {
    const pc = fpcProposedChange({
      id: 'epc_r',
      estimate_id: 'est_7',
      action: 'remove_line_item',
      params: { lineItemId: 'li_3' },
      status: 'rejected',
      diff: { summary: '-1 line item' },
      proposed_by_message_id: 'msg_9',
      proposed_at: '2026-06-21T10:00:00Z',
      applied_at: null,
      rejected_at: '2026-06-21T10:02:00Z',
    });
    expect(pc.status).toBe('rejected');
    expect(pc.resolvedAt).toBe('2026-06-21T10:02:00Z');
  });

  it('maps a still-pending proposed row: no resolution timestamp, diffSummary present', () => {
    const pc = fpcProposedChange({
      id: 'epc_p',
      estimate_id: 'est_7',
      action: 'update_estimate_field',
      params: { field: 'tax_rate', value: 0.07 },
      status: 'proposed',
      diff: { summary: 'tax 6% → 7%' },
      proposed_by_message_id: 'msg_1',
      proposed_at: '2026-06-22T08:00:00Z',
      applied_at: null,
      rejected_at: null,
    });
    expect(pc.status).toBe('proposed');
    expect(pc.diffSummary).toBe('tax 6% → 7%');
    // Both resolution columns null → resolvedAt omitted.
    expect('resolvedAt' in pc).toBe(false);
  });

  it("maps a 'failed' row losslessly (migration 023 CAS-race terminal state)", () => {
    // 023 'failed' = "mutation may have partially applied — manual review required".
    // Neither applied_at nor rejected_at is set. Must survive the round-trip.
    const pc = fpcProposedChange({
      id: 'epc_f',
      estimate_id: 'est_7',
      action: 'update_line_item',
      params: { lineItemId: 'li_1', qty: 5 },
      status: 'failed',
      diff: { summary: 'qty 3 → 5' },
      proposed_by_message_id: 'msg_5',
      proposed_at: '2026-06-23T11:00:00Z',
      applied_at: null,
      rejected_at: null,
    });
    expect(pc.status).toBe('failed');
    expect('resolvedAt' in pc).toBe(false);
  });

  it('omits diffSummary when diff carries no .summary', () => {
    const pc = fpcProposedChange({
      id: 'epc_n',
      estimate_id: 'est_7',
      action: 'add_line_item',
      params: {},
      status: 'proposed',
      diff: { before: {}, after: {} },
      proposed_by_message_id: null,
      proposed_at: '2026-06-24T00:00:00Z',
      applied_at: null,
      rejected_at: null,
    });
    expect('diffSummary' in pc).toBe(false);
  });

  it('maps a sent proposal into a ready ArtifactRecord with a share-link url', () => {
    const row: FpcProposalRow = {
      id: 'prop_1',
      estimate_id: 'est_3',
      status: 'sent',
      share_token: 'abc123def456',
    };
    const art: ArtifactRecord<'proposal'> = fpcProposalArtifact(row);
    expect(art.kind).toBe('proposal');
    expect(art.sourceResourceType).toBe('estimate');
    expect(art.sourceResourceId).toBe('est_3');
    expect(art.status).toBe('ready');
    expect(art.externalUrl).toContain('abc123def456');
  });

  it('maps a draft proposal (no share token) to a pending artifact with no url', () => {
    const art = fpcProposalArtifact({
      id: 'prop_2',
      estimate_id: 'est_4',
      status: 'draft',
      share_token: null,
    });
    expect(art.status).toBe('pending');
    expect('externalUrl' in art).toBe(false);
  });
});

describe('cross-vertical: both verticals produce the SAME envelope types', () => {
  it('collects ProposedChanges from both verticals into one homogeneous list', () => {
    const changes: ProposedChange[] = [
      jbetProposedChange({
        id: 'a', trip_id: 'trip_1', action: 'x', payload: {}, status: 'proposed',
        diff: {}, proposed_by: 'a@b.c', expires_at: '2026-01-02T00:00:00Z',
        applied_at: null, applied_by: null, failure_reason: null,
        created_at: '2026-01-01T00:00:00Z',
      }),
      fpcProposedChange({
        id: 'b', estimate_id: 'est_1', action: 'add_line_item', params: {},
        status: 'proposed', diff: {}, proposed_by_message_id: null,
        proposed_at: '2026-01-02T00:00:00Z', applied_at: null, rejected_at: null,
      }),
    ];
    expect(changes.map((c) => c.id)).toEqual(['a', 'b']);
    expect(changes.every((c) => c.status === 'proposed')).toBe(true);
  });

  it("the shared status union now admits 'failed' from either vertical", () => {
    const failedStatuses: ProposedChangeStatus[] = ['proposed', 'applied', 'rejected', 'expired', 'failed'];
    expect(failedStatuses).toContain('failed');
  });
});
