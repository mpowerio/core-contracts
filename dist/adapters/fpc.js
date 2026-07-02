export function fpcProposedChange(row) {
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
export function fpcProposalArtifact(row) {
    const isGenerated = row.share_token !== null;
    const status = isGenerated ? 'ready' : 'pending';
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
//# sourceMappingURL=fpc.js.map