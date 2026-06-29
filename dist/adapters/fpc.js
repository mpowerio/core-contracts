export function fpcProposedChange(row) {
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