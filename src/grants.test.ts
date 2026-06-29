import { describe, it, expect } from 'vitest';
import { lintGrants, type MigrationGrantSpec } from './grants.js';

/**
 * Rule-18 (CLAUDE.md SUBAGENT SPRINT PLAYBOOK §18): every public.* table must
 * ship an explicit REVOKE ALL FROM anon, authenticated; then GRANT ... TO
 * authenticated, service_role; with RLS enabled. Grants gate Data-API
 * visibility; RLS gates per-row access; TRUNCATE is gated only by the grant.
 * This linter encodes that doctrine so a migration can be checked mechanically.
 */

// A fully Rule-18-compliant tenant-scoped operational table.
const COMPLIANT: MigrationGrantSpec = {
  table: 'public.trips',
  rlsEnabled: true,
  revokedAllFrom: ['anon', 'authenticated'],
  grants: {
    anon: [],
    authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    service_role: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
};

describe('lintGrants (Rule-18 conformance)', () => {
  it('returns no findings for a fully compliant spec', () => {
    expect(lintGrants(COMPLIANT)).toEqual([]);
  });

  it('flags RLS disabled on a public table', () => {
    const findings = lintGrants({ ...COMPLIANT, rlsEnabled: false });
    expect(findings.some((f) => f.code === 'RLS_DISABLED' && f.severity === 'error')).toBe(true);
  });

  it('flags reliance on implicit grants (no explicit REVOKE ALL from anon + authenticated)', () => {
    const findings = lintGrants({ ...COMPLIANT, revokedAllFrom: ['anon'] });
    expect(findings.some((f) => f.code === 'MISSING_REVOKE' && f.severity === 'error')).toBe(true);
  });

  it('flags destructive privileges granted to anon (anon must be SELECT-only baseline)', () => {
    const findings = lintGrants({
      ...COMPLIANT,
      grants: { ...COMPLIANT.grants, anon: ['SELECT', 'DELETE'] },
    });
    expect(findings.some((f) => f.code === 'ANON_DESTRUCTIVE' && f.severity === 'error')).toBe(true);
  });

  it('flags a table with no authenticated grants (invisible to supabase-js even with RLS passing)', () => {
    const findings = lintGrants({
      ...COMPLIANT,
      grants: { ...COMPLIANT.grants, authenticated: [] },
    });
    expect(findings.some((f) => f.code === 'NO_AUTHENTICATED_GRANT' && f.severity === 'error')).toBe(true);
  });

  it('flags missing service_role grants', () => {
    const findings = lintGrants({
      ...COMPLIANT,
      grants: { ...COMPLIANT.grants, service_role: [] },
    });
    expect(findings.some((f) => f.code === 'NO_SERVICE_ROLE_GRANT')).toBe(true);
  });

  it('allows anon SELECT for genuinely public-read tables without a destructive finding', () => {
    const findings = lintGrants({
      ...COMPLIANT,
      grants: { ...COMPLIANT.grants, anon: ['SELECT'] },
    });
    expect(findings.some((f) => f.code === 'ANON_DESTRUCTIVE')).toBe(false);
  });
});
