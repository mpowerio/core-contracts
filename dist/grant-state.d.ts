import type { GrantLintFinding, GrantPrivilege, GrantRole, MigrationGrantSpec } from './grants.js';
export declare const GRANDFATHER_DEADLINE = "2026-10-30";
export interface PublicTableSecurityRow {
    tableName: string;
    rlsEnabled: boolean;
}
export interface RoleTableGrantRow {
    tableName: string;
    grantee: GrantRole | (string & {});
    privilegeType: GrantPrivilege | (string & {});
}
/**
 * Map observable Postgres grant/RLS state into the existing pure Rule-18 linter.
 *
 * PostgreSQL records current privileges, not whether a REVOKE statement ran.
 * For this state-based adapter, "revoked" therefore means the role has no
 * broad default privileges left: anon may retain SELECT only, while
 * authenticated may retain the canonical DML set but not
 * TRUNCATE/REFERENCES/TRIGGER/ALL.
 */
export declare function mapGrantState(tables: readonly PublicTableSecurityRow[], grantRows: readonly RoleTableGrantRow[]): MigrationGrantSpec[];
export declare function remapGrandfatheredFindings(findings: readonly GrantLintFinding[], grandfathered: boolean): GrantLintFinding[];
//# sourceMappingURL=grant-state.d.ts.map