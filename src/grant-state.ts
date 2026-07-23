import type {
  GrantLintFinding,
  GrantPrivilege,
  GrantRole,
  MigrationGrantSpec,
} from './grants.js';

export const GRANDFATHER_DEADLINE = '2026-10-30';

export interface PublicTableSecurityRow {
  tableName: string;
  rlsEnabled: boolean;
}

export interface RoleTableGrantRow {
  tableName: string;
  grantee: GrantRole | (string & {});
  privilegeType: GrantPrivilege | (string & {});
}

const ROLES: readonly GrantRole[] = ['anon', 'authenticated', 'service_role'];
const GRANT_PRIVILEGES: readonly GrantPrivilege[] = [
  'ALL',
  'DELETE',
  'INSERT',
  'SELECT',
  'TRUNCATE',
  'UPDATE',
];
const GRANT_PRIVILEGE_SET = new Set<string>(GRANT_PRIVILEGES);
const ANON_ALLOWED_AFTER_REVOKE = new Set<string>(['SELECT']);
const AUTHENTICATED_ALLOWED_AFTER_REVOKE = new Set<string>([
  'DELETE',
  'INSERT',
  'SELECT',
  'UPDATE',
]);

function stateProvesRevoke(role: GrantRole, rawPrivileges: readonly string[]): boolean {
  if (role === 'anon') {
    return rawPrivileges.every((privilege) => ANON_ALLOWED_AFTER_REVOKE.has(privilege));
  }
  if (role === 'authenticated') {
    return rawPrivileges.every((privilege) =>
      AUTHENTICATED_ALLOWED_AFTER_REVOKE.has(privilege),
    );
  }
  return false;
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
export function mapGrantState(
  tables: readonly PublicTableSecurityRow[],
  grantRows: readonly RoleTableGrantRow[],
): MigrationGrantSpec[] {
  return [...tables]
    .sort((left, right) => left.tableName.localeCompare(right.tableName))
    .map((table) => {
      const grants = Object.fromEntries(
        ROLES.map((role) => {
          const rawPrivileges = grantRows
            .filter((row) => row.tableName === table.tableName && row.grantee === role)
            .map((row) => row.privilegeType);
          const supported = [...new Set(rawPrivileges.filter((privilege) =>
            GRANT_PRIVILEGE_SET.has(privilege),
          ))]
            .sort((left, right) => left.localeCompare(right)) as GrantPrivilege[];
          return [role, supported];
        }),
      ) as Record<GrantRole, GrantPrivilege[]>;

      const revokedAllFrom = (['anon', 'authenticated'] as const).filter((role) => {
        const rawPrivileges = grantRows
          .filter((row) => row.tableName === table.tableName && row.grantee === role)
          .map((row) => row.privilegeType);
        return stateProvesRevoke(role, rawPrivileges);
      });

      return {
        table: `public.${table.tableName}`,
        rlsEnabled: table.rlsEnabled,
        revokedAllFrom: [...revokedAllFrom],
        grants,
      };
    });
}

export function remapGrandfatheredFindings(
  findings: readonly GrantLintFinding[],
  grandfathered: boolean,
): GrantLintFinding[] {
  if (!grandfathered) {
    return [...findings];
  }

  return findings.map((finding) =>
    finding.severity === 'error'
      ? {
          ...finding,
          severity: 'warning',
          message: `${finding.message}; grandfathered — must comply before ${GRANDFATHER_DEADLINE}`,
        }
      : { ...finding },
  );
}
