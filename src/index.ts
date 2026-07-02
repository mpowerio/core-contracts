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

// ── Rule-18 migration grant spec + linter (the one runtime-tested module) ──
export {
  lintGrants,
  type MigrationGrantSpec,
  type GrantPrivilege,
  type GrantRole,
  type GrantLintFinding,
  type LintSeverity,
} from './grants.js';

// ── TenantConfig: identity + deployment metadata for one tenant ──
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

// ── ActorSession: the authenticated principal, auth-rail-agnostic ──
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

// ── AuditEvent: one PII/action audit-trail entry ──
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

// ── ProposedChange: the agent propose→confirm→apply lifecycle (THE #1 seam) ──
// Present identically in JBET (trip_proposed_changes) and FPC
// (estimate_proposed_changes). The domain payload stays vertical; the
// lifecycle is shared.
//
// 'failed' is a real terminal state in BOTH verticals' schemas (FPC migration
// 023 + JBET migration 065): the compare-and-swap status flip succeeded but the
// downstream mutation then failed, so the row "may have partially applied —
// manual review required". It is neither 'applied' (would hide the failure) nor
// re-openable to 'proposed' (would invite a retry into a half-applied record).
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

// ── ArtifactRecord: generate-artifact-from-canonical-row lifecycle ──
// JBET: Gamma itinerary, DOCX trip doc. FPC: SOW HTML, proposal PDF. The tool
// (Gamma/docxtemplater) is NOT the shared product — this lifecycle is.
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

// ── AnalyticsEvent: shared capture envelope; metric DEFINITIONS stay vertical ──
export interface AnalyticsEvent {
  name: string;
  resourceType?: string;
  resourceId?: string;
  actor?: string;
  value?: Record<string, string | number | boolean>;
  /** Vertical tag (e.g. 'travel', 'construction') for downstream slicing. */
  vertical?: string;
}
