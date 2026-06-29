/**
 * JBET adapter — maps JB Elite Travel (Lineage A) local row shapes INTO the
 * cross-vertical contract envelopes. Proves the contracts are expressive
 * enough to model the travel vertical without leaking travel nouns into core.
 * STUB: returns placeholder values so the spec fails first (TDD red).
 */
import type { ProposedChange, ArtifactRecord, ArtifactStatus } from '../index.js';

/** Shape of a row from JBET `trip_proposed_changes`. */
export interface JbetTripProposedChangeRow {
  id: string;
  action: string;
  payload: unknown;
  status: 'proposed' | 'applied' | 'rejected' | 'expired';
  diff_summary: string | null;
  proposed_by: string;
  proposed_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
}

/** Shape of a row from JBET `gamma_presentations`. */
export interface JbetGammaPresentationRow {
  id: string;
  trip_id: string;
  status: 'generating' | 'draft' | 'completed' | 'failed';
  gamma_url: string | null;
  last_checked_at: string | null;
}

export function jbetProposedChange(row: JbetTripProposedChangeRow): ProposedChange {
  return {
    id: row.id,
    action: row.action,
    payload: row.payload,
    status: row.status,
    proposedBy: row.proposed_by,
    proposedAt: row.proposed_at,
    ...(row.diff_summary !== null ? { diffSummary: row.diff_summary } : {}),
    ...(row.resolved_by !== null ? { resolvedBy: row.resolved_by } : {}),
    ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
  };
}

const GAMMA_STATUS: Record<JbetGammaPresentationRow['status'], ArtifactStatus> = {
  generating: 'generating',
  draft: 'ready',
  completed: 'ready',
  failed: 'failed',
};

export function jbetGammaArtifact(
  row: JbetGammaPresentationRow,
): ArtifactRecord<'gamma_itinerary'> {
  return {
    id: row.id,
    kind: 'gamma_itinerary',
    sourceResourceType: 'trip',
    sourceResourceId: row.trip_id,
    provider: 'gamma',
    status: GAMMA_STATUS[row.status],
    ...(row.gamma_url !== null ? { externalUrl: row.gamma_url } : {}),
    ...(row.last_checked_at !== null ? { lastCheckedAt: row.last_checked_at } : {}),
  };
}
