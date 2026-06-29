/**
 * JBET adapter — maps JB Elite Travel (Lineage A) local row shapes INTO the
 * cross-vertical contract envelopes. Proves the contracts are expressive
 * enough to model the travel vertical without leaking travel nouns into core.
 * STUB: returns placeholder values so the spec fails first (TDD red).
 */
import type { ProposedChange, ArtifactRecord } from '../index.js';
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
export declare function jbetProposedChange(row: JbetTripProposedChangeRow): ProposedChange;
export declare function jbetGammaArtifact(row: JbetGammaPresentationRow): ArtifactRecord<'gamma_itinerary'>;
//# sourceMappingURL=jbet.d.ts.map