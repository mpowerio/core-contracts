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
import type { ProposedChange, ArtifactRecord } from '../index.js';

/**
 * THE FACTORY GATE (representative form): two different verticals, with two
 * different local schemas, must both map cleanly INTO the same contract
 * envelopes — without the contracts knowing any vertical noun. If these pass
 * and the package type-checks with zero framework deps, the shared-core seam
 * is real for these two contracts.
 */

describe('JBET adapter → contracts', () => {
  it('maps a trip_proposed_changes row into ProposedChange', () => {
    const row: JbetTripProposedChangeRow = {
      id: 'tpc_1',
      action: 'set_guest_pricing',
      payload: { guestId: 'g1', amount: 4200 },
      status: 'proposed',
      diff_summary: '+$4,200 for guest g1',
      proposed_by: 'andrea@jbelitetravel.com',
      proposed_at: '2026-06-29T12:00:00Z',
      resolved_by: null,
      resolved_at: null,
    };
    const pc: ProposedChange = jbetProposedChange(row);
    expect(pc.id).toBe('tpc_1');
    expect(pc.action).toBe('set_guest_pricing');
    expect(pc.payload).toEqual({ guestId: 'g1', amount: 4200 });
    expect(pc.status).toBe('proposed');
    expect(pc.diffSummary).toBe('+$4,200 for guest g1');
    expect(pc.proposedBy).toBe('andrea@jbelitetravel.com');
    expect(pc.proposedAt).toBe('2026-06-29T12:00:00Z');
    // null DB columns must be OMITTED (exactOptionalPropertyTypes), not undefined-set.
    expect('resolvedAt' in pc).toBe(false);
    expect('resolvedBy' in pc).toBe(false);
  });

  it('maps a completed gamma_presentations row into a ready ArtifactRecord', () => {
    const row: JbetGammaPresentationRow = {
      id: 'gp_1',
      trip_id: 'trip_9',
      status: 'completed',
      gamma_url: 'https://gamma.app/docs/09dvq12shdwmvbg',
      last_checked_at: '2026-06-29T13:00:00Z',
    };
    const art: ArtifactRecord<'gamma_itinerary'> = jbetGammaArtifact(row);
    expect(art.kind).toBe('gamma_itinerary');
    expect(art.sourceResourceType).toBe('trip');
    expect(art.sourceResourceId).toBe('trip_9');
    expect(art.provider).toBe('gamma');
    expect(art.status).toBe('ready');
    expect(art.externalUrl).toBe('https://gamma.app/docs/09dvq12shdwmvbg');
    expect(art.lastCheckedAt).toBe('2026-06-29T13:00:00Z');
  });

  it('maps a still-generating gamma row to status "generating" with no url', () => {
    const art = jbetGammaArtifact({
      id: 'gp_2',
      trip_id: 'trip_5',
      status: 'generating',
      gamma_url: null,
      last_checked_at: null,
    });
    expect(art.status).toBe('generating');
    expect('externalUrl' in art).toBe(false);
  });
});

describe('FPC adapter → contracts', () => {
  it('maps an estimate_proposed_changes row into ProposedChange (created_at → proposedAt)', () => {
    const row: FpcEstimateProposedChangeRow = {
      id: 'epc_1',
      action: 'add_line_item',
      payload: { sku: 'concrete-yd', qty: 12 },
      status: 'applied',
      diff_summary: '+12 yd concrete',
      proposed_by: 'filemon@fpcconstructions.com',
      created_at: '2026-06-20T09:00:00Z',
      resolved_by: 'filemon@fpcconstructions.com',
      resolved_at: '2026-06-20T09:05:00Z',
    };
    const pc: ProposedChange = fpcProposedChange(row);
    expect(pc.id).toBe('epc_1');
    expect(pc.status).toBe('applied');
    // The seam: FPC's `created_at` normalizes to the SAME envelope field JBET
    // populates from `proposed_at`.
    expect(pc.proposedAt).toBe('2026-06-20T09:00:00Z');
    expect(pc.resolvedAt).toBe('2026-06-20T09:05:00Z');
    expect(pc.resolvedBy).toBe('filemon@fpcconstructions.com');
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
        id: 'a', action: 'x', payload: {}, status: 'proposed',
        diff_summary: null, proposed_by: 'a@b.c', proposed_at: '2026-01-01T00:00:00Z',
        resolved_by: null, resolved_at: null,
      }),
      fpcProposedChange({
        id: 'b', action: 'y', payload: {}, status: 'proposed',
        diff_summary: null, proposed_by: 'd@e.f', created_at: '2026-01-02T00:00:00Z',
        resolved_by: null, resolved_at: null,
      }),
    ];
    expect(changes.map((c) => c.id)).toEqual(['a', 'b']);
    expect(changes.every((c) => c.status === 'proposed')).toBe(true);
  });
});
