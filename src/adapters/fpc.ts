/**
 * FPC adapter — maps FPC Construction (Lineage B) local row shapes INTO the
 * cross-vertical contract envelopes. Note the source columns DIFFER from JBET
 * (e.g. `created_at` here vs `proposed_at` there) yet both normalize to the
 * SAME envelope — that normalization IS the seam.
 * STUB: returns placeholder values so the spec fails first (TDD red).
 */
import type { ProposedChange, ArtifactRecord, ArtifactStatus } from '../index.js';

/** Shape of a row from FPC `estimate_proposed_changes`. */
export interface FpcEstimateProposedChangeRow {
  id: string;
  action: string;
  payload: unknown;
  status: 'proposed' | 'applied' | 'rejected' | 'expired';
  diff_summary: string | null;
  proposed_by: string;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
}

/** Shape of a row from FPC `proposals`. */
export interface FpcProposalRow {
  id: string;
  estimate_id: string;
  status: 'draft' | 'sent' | 'viewed' | 'accepted';
  share_token: string | null;
}

export function fpcProposedChange(row: FpcEstimateProposedChangeRow): ProposedChange {
  return {
    id: row.id,
    action: row.action,
    payload: row.payload,
    status: row.status,
    proposedBy: row.proposed_by,
    // The seam: FPC's `created_at` normalizes to the same envelope field JBET
    // populates from `proposed_at`.
    proposedAt: row.created_at,
    ...(row.diff_summary !== null ? { diffSummary: row.diff_summary } : {}),
    ...(row.resolved_by !== null ? { resolvedBy: row.resolved_by } : {}),
    ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
  };
}

export function fpcProposalArtifact(row: FpcProposalRow): ArtifactRecord<'proposal'> {
  const isGenerated = row.share_token !== null;
  const status: ArtifactStatus = isGenerated ? 'ready' : 'pending';
  return {
    id: row.id,
    kind: 'proposal',
    sourceResourceType: 'estimate',
    sourceResourceId: row.estimate_id,
    provider: 'sow-renderer',
    status,
    ...(isGenerated ? { externalUrl: `/proposals/${row.share_token}` } : {}),
  };
}
