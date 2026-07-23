/**
 * @mpowerio/core-contracts — the Vertical-Factory's stable cross-vertical
 * envelopes. PURE TYPESCRIPT ONLY: no React, no Next, no Supabase client, no
 * vertical domain nouns. Each tenant app maps its local nouns INTO these
 * envelopes via a thin adapter (see adapters/*). The success gate for the
 * shared-core plan is that JBET and FPC can both import + type-check this
 * package without pulling any framework or vertical type.
 *
 * Derived from JBET ∩ FPC ∩ LAJ ∩ Blass ∩ MOC (seam-diff 2026-06-29) and the
 * Codex roast: extract contracts + small adapter interfaces, NOT shared UI/DB.
 */
export { lintGrants, type MigrationGrantSpec, type GrantPrivilege, type GrantRole, type GrantLintFinding, type LintSeverity, } from './grants.js';
export { GRANDFATHER_DEADLINE, mapGrantState, remapGrandfatheredFindings, type PublicTableSecurityRow, type RoleTableGrantRow, } from './grant-state.js';
export { isArmable, ARMABLE_BRAND, type LeafId, type LeafHealth, type LeafStatus, type RunSummary, type ApprovalCard, type Receipt, type Spend, type ReadableLeaf, type ArmableLeaf, } from './moc/leaf.js';
export { ReactionLeaf, DEFAULT_SQUAWK_STATE_FILE, type ReactionStore, type SquawkStateShape, type ReactionDraftRef, } from './adapters/moc/reaction.js';
export { parseBrief, DEFAULT_AR_BRIEF_FILE, DEFAULT_AR_BILLING_LOG, type ArStore, type ParsedBrief, type ArOverdueRow, type ArPaidRow, } from './adapters/moc/ar.js';
export { ArRailLeaf, parseBillingLog, resolveArPaths, DEFAULT_AR_DISARM_SENTINELS, DEFAULT_AR_DISARM_ENV, type ArRailStore, type BillingLogEntry, type ArPathOverrides, type ResolvedArPaths, } from './adapters/moc/ar-rail.js';
export interface TenantConfig {
    slug: string;
    displayName: string;
    deployment: {
        vercelProjectId?: string;
        supabaseProjectRef?: string;
        baseUrl?: string;
    };
    featureFlags: Record<string, boolean>;
    /** Reference (id/path) to branding tokens — NOT the tokens themselves. */
    brandingTokensRef?: string;
}
/** Loosely-typed tier; a vertical may narrow to its own union. */
export type PermissionTier = 'coordinator' | 'manager' | 'owner' | (string & {});
export interface ActorSession {
    userId: string;
    email: string;
    role: string;
    permissionTier: PermissionTier;
    tenantSlug: string;
    /** e.g. 'nextauth-credentials' (JBET) | 'supabase' (FPC/LAJ). */
    authProvider: string;
}
export interface AuditEvent {
    actor: string;
    action: string;
    resourceType: string;
    resourceId: string;
    resourceLabel?: string;
    metadata?: Record<string, unknown>;
    /** ISO-8601 timestamp. */
    timestamp: string;
}
export type ProposedChangeStatus = 'proposed' | 'applied' | 'rejected' | 'expired' | 'failed';
export interface ProposedChange<TAction extends string = string, TPayload = unknown> {
    id: string;
    action: TAction;
    payload: TPayload;
    status: ProposedChangeStatus;
    /** Human-readable diff preview shown at the apply gate. */
    diffSummary?: string;
    proposedBy: string;
    /** ISO-8601. */
    proposedAt: string;
    resolvedBy?: string;
    resolvedAt?: string;
}
export type ArtifactStatus = 'pending' | 'generating' | 'ready' | 'failed';
export interface ArtifactRecord<TKind extends string = string> {
    id: string;
    kind: TKind;
    sourceResourceType: string;
    sourceResourceId: string;
    /** e.g. 'gamma' | 'docxtemplater' | 'sow-renderer'. */
    provider?: string;
    status: ArtifactStatus;
    externalUrl?: string;
    blobKey?: string;
    /** ISO-8601 of the last poll/status check (for async generators like Gamma). */
    lastCheckedAt?: string;
}
export interface AnalyticsEvent {
    name: string;
    resourceType?: string;
    resourceId?: string;
    actor?: string;
    value?: Record<string, string | number | boolean>;
    /** Vertical tag (e.g. 'travel', 'construction') for downstream slicing. */
    vertical?: string;
}
//# sourceMappingURL=index.d.ts.map