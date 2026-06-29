/**
 * MigrationGrantSpec + lintGrants — declarative Rule-18 conformance.
 * STUB: types are real; lintGrants is intentionally empty so the spec's
 * tests fail first (TDD red). Implementation lands in the green step.
 */
export type GrantPrivilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | 'ALL';
export type GrantRole = 'anon' | 'authenticated' | 'service_role';
export interface MigrationGrantSpec {
    /** Fully-qualified table, e.g. 'public.trips'. */
    table: string;
    /** Whether ROW LEVEL SECURITY is enabled on the table. */
    rlsEnabled: boolean;
    /** Roles explicitly REVOKE ALL'd before grants (Rule-18 requires anon + authenticated). */
    revokedAllFrom?: GrantRole[];
    /** Privileges granted per role. */
    grants: Record<GrantRole, GrantPrivilege[]>;
}
export type LintSeverity = 'error' | 'warning';
export interface GrantLintFinding {
    code: 'RLS_DISABLED' | 'MISSING_REVOKE' | 'ANON_DESTRUCTIVE' | 'NO_AUTHENTICATED_GRANT' | 'NO_SERVICE_ROLE_GRANT';
    severity: LintSeverity;
    table: string;
    message: string;
}
/**
 * Mechanically check a public.* table's grant posture against Rule-18.
 * Pure: no I/O, no SQL parsing — operates on the declarative spec a migration
 * author (or a migration linter that emits this shape) provides.
 */
export declare function lintGrants(spec: MigrationGrantSpec): GrantLintFinding[];
//# sourceMappingURL=grants.d.ts.map