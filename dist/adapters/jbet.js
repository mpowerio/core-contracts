export function jbetProposedChange(row) {
    return {
        id: row.id,
        action: row.action,
        payload: row.payload,
        status: row.status,
        proposedBy: row.proposed_by,
        proposedAt: row.created_at,
        ...(row.diff.summary ? { diffSummary: row.diff.summary } : {}),
        ...(row.applied_by !== null ? { resolvedBy: row.applied_by } : {}),
        ...(row.applied_at !== null ? { resolvedAt: row.applied_at } : {}),
    };
}
// draft/shared/archived all mean "the deck exists" → 'ready'. 'failed' is the
// JBE-025 poller's terminal error state (20260628_001) → shared 'failed', so a
// failed generation stays visible in the artifact lifecycle instead of being
// dropped at the seam.
const GAMMA_STATUS = {
    generating: 'generating',
    draft: 'ready',
    shared: 'ready',
    archived: 'ready',
    failed: 'failed',
};
export function jbetGammaArtifact(row) {
    return {
        id: row.id,
        kind: 'gamma_itinerary',
        sourceResourceType: 'trip',
        sourceResourceId: row.trip_id,
        provider: 'gamma',
        status: GAMMA_STATUS[row.status],
        ...(row.gamma_url !== null ? { externalUrl: row.gamma_url } : {}),
    };
}
//# sourceMappingURL=jbet.js.map