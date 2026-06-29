/**
 * FPC adapter — maps FPC Construction (Lineage B) local row shapes INTO the
 * cross-vertical contract envelopes. Note the source columns DIFFER from JBET
 * (e.g. `created_at` here vs `proposed_at` there) yet both normalize to the
 * SAME envelope — that normalization IS the seam.
 * STUB: returns placeholder values so the spec fails first (TDD red).
 */
import type { ProposedChange, ArtifactRecord } from '../index.js';
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
export declare function fpcProposedChange(row: FpcEstimateProposedChangeRow): ProposedChange;
export declare function fpcProposalArtifact(row: FpcProposalRow): ArtifactRecord<'proposal'>;
//# sourceMappingURL=fpc.d.ts.map