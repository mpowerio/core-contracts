/**
 * JBET adapter — maps JB Elite Travel (Lineage A) local row shapes INTO the
 * cross-vertical contract envelopes. Proves the contracts are expressive
 * enough to model the travel vertical without leaking travel nouns into core.
 *
 * The `trip_proposed_changes` mapping is written against JBET's REAL schema
 * (portal migration 065), read straight from the migration SQL — the same
 * defect class the FPC adapter had at v0.1.0 ("representative" shape) and was
 * cured of in v0.2.0. Real column → envelope field:
 *   created_at            → proposedAt   (there is no proposed_at column)
 *   payload (jsonb)       → payload
 *   diff.summary (nested) → diffSummary  (jsonb {before, after, summary};
 *                            NOT a flat diff_summary column)
 *   proposed_by           → proposedBy   (real actor email — unlike FPC,
 *                            JBET records who proposed each change)
 *   applied_by            → resolvedBy   (there is no resolved_by column)
 *   applied_at            → resolvedAt   (there is no resolved_at column;
 *                            reject does NOT set applied_at — invariant I3 —
 *                            so rejected rows have no resolvedAt)
 *   status                → status       (065 CHECK matches the shared union,
 *                            incl. 'failed')
 *   trip_id | expires_at | failure_reason → (no envelope field; carried on the
 *                            row type for fidelity, dropped at the seam like
 *                            FPC's estimate_id)
 */
import type { ProposedChange, ProposedChangeStatus, ArtifactRecord } from '../index.js';
/**
 * Shape of a row from JBET `trip_proposed_changes`, exactly as stored
 * (portal migration 065, lines 34-48). The CHECK is
 * (status IN ('proposed','applied','expired','failed','rejected')) — the same
 * five states as the shared `ProposedChangeStatus`, so it's typed to it.
 */
export interface JbetTripProposedChangeRow {
    id: string;
    trip_id: string;
    /** Email of the team member whose chat turn created this — a real actor. */
    proposed_by: string;
    /** ProposalAction discriminator tag. */
    action: string;
    /** Tool argument snapshot (jsonb). */
    payload: unknown;
    /** jsonb {before, after, summary}; carries the human-readable `.summary`. */
    diff: {
        summary?: string;
    } & Record<string, unknown>;
    status: ProposedChangeStatus;
    /** 24h proposal expiry (NOT NULL). No envelope field; dropped at the seam. */
    expires_at: string;
    /** Set only on apply — reject does NOT set it (invariant I3). */
    applied_at: string | null;
    applied_by: string | null;
    /** Populated on status='failed'. No envelope field; dropped at the seam. */
    failure_reason: string | null;
    created_at: string;
}
/**
 * Shape of a row from JBET `gamma_presentations` (migrations 20260421_001 +
 * 20260427_001), subset the artifact mapping needs. The real status union is
 * draft | shared | archived | generating — there is NO 'completed', NO
 * 'failed', and NO last_checked_at column (gamma_url stays NULL and status
 * stays 'generating' until the operator/poller fills it in).
 */
export interface JbetGammaPresentationRow {
    id: string;
    trip_id: string;
    status: 'draft' | 'shared' | 'archived' | 'generating';
    /** NULL only while status='generating' (20260427_001 dropped NOT NULL). */
    gamma_url: string | null;
}
export declare function jbetProposedChange(row: JbetTripProposedChangeRow): ProposedChange;
export declare function jbetGammaArtifact(row: JbetGammaPresentationRow): ArtifactRecord<'gamma_itinerary'>;
//# sourceMappingURL=jbet.d.ts.map