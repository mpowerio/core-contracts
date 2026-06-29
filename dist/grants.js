/**
 * MigrationGrantSpec + lintGrants — declarative Rule-18 conformance.
 * STUB: types are real; lintGrants is intentionally empty so the spec's
 * tests fail first (TDD red). Implementation lands in the green step.
 */
const DESTRUCTIVE = new Set([
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ALL',
]);
/**
 * Mechanically check a public.* table's grant posture against Rule-18.
 * Pure: no I/O, no SQL parsing — operates on the declarative spec a migration
 * author (or a migration linter that emits this shape) provides.
 */
export function lintGrants(spec) {
    const findings = [];
    const at = (code, severity, message) => {
        findings.push({ code, severity, table: spec.table, message });
    };
    if (!spec.rlsEnabled) {
        at('RLS_DISABLED', 'error', `RLS is not enabled on ${spec.table}; per-row access is ungated.`);
    }
    const revoked = new Set(spec.revokedAllFrom ?? []);
    if (!revoked.has('anon') || !revoked.has('authenticated')) {
        at('MISSING_REVOKE', 'error', `Missing explicit REVOKE ALL ON ${spec.table} FROM anon, authenticated — grants are additive, so implicit defaults (incl. TRUNCATE for authenticated) survive.`);
    }
    const anonDestructive = spec.grants.anon.filter((p) => DESTRUCTIVE.has(p));
    if (anonDestructive.length > 0) {
        at('ANON_DESTRUCTIVE', 'error', `anon is granted destructive privilege(s) [${anonDestructive.join(', ')}] on ${spec.table}; anon baseline is SELECT-only.`);
    }
    if (spec.grants.authenticated.length === 0) {
        at('NO_AUTHENTICATED_GRANT', 'error', `${spec.table} grants nothing to authenticated; it will be invisible to supabase-js/PostgREST even when RLS policies pass.`);
    }
    if (spec.grants.service_role.length === 0) {
        at('NO_SERVICE_ROLE_GRANT', 'error', `${spec.table} grants nothing to service_role; server-side/admin writes will fail.`);
    }
    return findings;
}
//# sourceMappingURL=grants.js.map