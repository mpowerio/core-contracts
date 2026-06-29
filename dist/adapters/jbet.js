export function jbetProposedChange(row) {
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
const GAMMA_STATUS = {
    generating: 'generating',
    draft: 'ready',
    completed: 'ready',
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
        ...(row.last_checked_at !== null ? { lastCheckedAt: row.last_checked_at } : {}),
    };
}
//# sourceMappingURL=jbet.js.map