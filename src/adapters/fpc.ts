/**
 * FPC adapter — maps FPC Construction (Lineage B) local row shapes INTO the
 * cross-vertical contract envelopes.
 *
 * The `estimate_proposed_changes` mapping is written against FPC's REAL schema
 * (migrations 022 + 023), verified against the table's first production
 * consumer. The columns differ from JBET's proposed-change table, yet both
 * normalize to the SAME `ProposedChange` envelope — that normalization IS the
 * seam. Real column → envelope field:
 *   proposed_at              → proposedAt
 *   params (jsonb)           → payload
 *   diff.summary (nested)    → diffSummary
 *   proposed_by_message_id   → (unused; a message backlink, NOT an actor. FPC
 *                               records no per-proposal actor — every row is
 *                               agent-proposed, so proposedBy is 'agent'.)
 *   applied_at | rejected_at → resolvedAt (split by outcome; no resolver actor,
 *                               so resolvedBy is always omitted.)
 *   status                   → status (incl. 'failed', migration 023.)
 */
import type { ProposedChange, ProposedChangeStatus, ArtifactRecord, ArtifactStatus } from '../index.js';

/** The four FPC propose_change actions (migration 022 CHECK + src/lib/chat/tools.ts). */
export type FpcProposedAction =
  | 'update_line_item'
  | 'remove_line_item'
  | 'add_line_item'
  | 'update_estimate_field';

/**
 * Shape of a row from FPC `estimate_proposed_changes`, exactly as stored
 * (migrations 022 + 023). After 023 the DB CHECK admits the same five statuses
 * as the shared `ProposedChangeStatus`, so the row's `status` is typed to it.
 */
export interface FpcEstimateProposedChangeRow {
  id: string;
  estimate_id: string;
  proposed_at: string;
  /** Backlink to the assistant turn that produced this proposal — NOT an actor. */
  proposed_by_message_id: string | null;
  action: FpcProposedAction;
  /** Action-specific parameters (jsonb) — the real column is `params`. */
  params: unknown;
  /** jsonb; carries a human-readable `.summary` for the confirmation card. */
  diff: { summary?: string } & Record<string, unknown>;
  status: ProposedChangeStatus;
  applied_at: string | null;
  rejected_at: string | null;
}

/** Shape of a row from FPC `proposals`. */
export interface FpcProposalRow {
  id: string;
  estimate_id: string;
  status: 'draft' | 'sent' | 'viewed' | 'accepted';
  share_token: string | null;
}

export function fpcProposedChange(
  row: FpcEstimateProposedChangeRow,
): ProposedChange<FpcProposedAction> {
  // FPC splits resolution by outcome; only applied/rejected record a time.
  const resolvedAt = row.applied_at ?? row.rejected_at;
  return {
    id: row.id,
    action: row.action,
    payload: row.params,
    status: row.status,
    // FPC v1a records no per-proposal actor — every row is agent-proposed.
    proposedBy: 'agent',
    proposedAt: row.proposed_at,
    ...(row.diff.summary ? { diffSummary: row.diff.summary } : {}),
    ...(resolvedAt !== null ? { resolvedAt } : {}),
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
