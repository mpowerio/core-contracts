import { describe, expect, it } from 'vitest';
import { lintGrants, type GrantLintFinding } from './grants.js';
import {
  GRANDFATHER_DEADLINE,
  mapGrantState,
  remapGrandfatheredFindings,
} from './grant-state.js';

const tables = [{ tableName: 'trips', rlsEnabled: true }];

describe('mapGrantState', () => {
  it('maps a compliant role-table-grant row set into lintGrants input', () => {
    const [spec] = mapGrantState(tables, [
      { tableName: 'trips', grantee: 'authenticated', privilegeType: 'SELECT' },
      { tableName: 'trips', grantee: 'authenticated', privilegeType: 'INSERT' },
      { tableName: 'trips', grantee: 'authenticated', privilegeType: 'UPDATE' },
      { tableName: 'trips', grantee: 'authenticated', privilegeType: 'DELETE' },
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'SELECT' },
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'INSERT' },
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'UPDATE' },
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'DELETE' },
    ]);

    expect(spec).toEqual({
      table: 'public.trips',
      rlsEnabled: true,
      revokedAllFrom: ['anon', 'authenticated'],
      grants: {
        anon: [],
        authenticated: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
        service_role: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
      },
    });
    expect(lintGrants(spec!)).toEqual([]);
  });

  it('preserves missing RLS as an error from lintGrants', () => {
    const [spec] = mapGrantState(
      [{ tableName: 'trips', rlsEnabled: false }],
      [
        { tableName: 'trips', grantee: 'authenticated', privilegeType: 'SELECT' },
        { tableName: 'trips', grantee: 'service_role', privilegeType: 'SELECT' },
      ],
    );

    expect(lintGrants(spec!).map((finding) => finding.code)).toContain('RLS_DISABLED');
  });

  it('represents an empty authenticated grant set so lintGrants flags it', () => {
    const [spec] = mapGrantState(tables, [
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'SELECT' },
    ]);

    expect(spec!.grants.authenticated).toEqual([]);
    expect(spec!.revokedAllFrom).toEqual(['anon', 'authenticated']);
    expect(lintGrants(spec!).map((finding) => finding.code)).toContain('NO_AUTHENTICATED_GRANT');
  });

  it('preserves destructive anon grants so lintGrants flags them', () => {
    const [spec] = mapGrantState(tables, [
      { tableName: 'trips', grantee: 'anon', privilegeType: 'DELETE' },
      { tableName: 'trips', grantee: 'authenticated', privilegeType: 'SELECT' },
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'SELECT' },
    ]);

    expect(lintGrants(spec!).map((finding) => finding.code)).toContain('ANON_DESTRUCTIVE');
  });

  it('treats broad authenticated default privileges as a missing revoke', () => {
    const [spec] = mapGrantState(tables, [
      { tableName: 'trips', grantee: 'authenticated', privilegeType: 'SELECT' },
      { tableName: 'trips', grantee: 'authenticated', privilegeType: 'TRUNCATE' },
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'SELECT' },
    ]);

    expect(spec!.revokedAllFrom).toEqual(['anon']);
    expect(lintGrants(spec!).map((finding) => finding.code)).toContain('MISSING_REVOKE');
  });

  it('ignores privileges outside MigrationGrantSpec and de-duplicates query rows', () => {
    const [spec] = mapGrantState(tables, [
      { tableName: 'trips', grantee: 'authenticated', privilegeType: 'SELECT' },
      { tableName: 'trips', grantee: 'authenticated', privilegeType: 'SELECT' },
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'REFERENCES' },
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'TRIGGER' },
      { tableName: 'trips', grantee: 'service_role', privilegeType: 'SELECT' },
    ]);

    expect(spec!.grants.authenticated).toEqual(['SELECT']);
    expect(spec!.grants.service_role).toEqual(['SELECT']);
  });
});

describe('remapGrandfatheredFindings', () => {
  const finding: GrantLintFinding = {
    code: 'NO_AUTHENTICATED_GRANT',
    severity: 'error',
    table: 'public.legacy_table',
    message: 'missing authenticated grants',
  };

  it('downgrades pre-cutover errors and prints the literal deadline warning', () => {
    expect(remapGrandfatheredFindings([finding], true)).toEqual([
      {
        ...finding,
        severity: 'warning',
        message: `missing authenticated grants; grandfathered — must comply before ${GRANDFATHER_DEADLINE}`,
      },
    ]);
  });

  it('does not downgrade post-cutover errors', () => {
    expect(remapGrandfatheredFindings([finding], false)).toEqual([finding]);
  });
});
