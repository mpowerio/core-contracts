import { parseBrief, DEFAULT_AR_BRIEF_FILE, DEFAULT_AR_BILLING_LOG, } from './ar.js';
const LEAF = 'ar';
/**
 * The rail's disarm doors, exactly as ar-watch.sh / ar-monthly-billing.sh
 * check them (repo sentinel OR home sentinel OR env flag). The consuming
 * store reports disarmed=true if ANY door is engaged; false only after
 * positively checking all three; null when it could not determine.
 */
export const DEFAULT_AR_DISARM_SENTINELS = [
    '/home/maestro/projects/mpowerio-ar/DISARMED',
    '/home/maestro/.ar-disarmed',
];
export const DEFAULT_AR_DISARM_ENV = 'AR_DISARMED';
/**
 * PRESENCE != VALUE: a defined-but-blank scalar (`""` or whitespace-only) is
 * treated as ABSENT, so it falls through to the next precedence tier rather than
 * resolving to an empty path. A blank `AR_BRIEF_FILE` must not become `''`.
 * Returns the trimmed content, or undefined when there is none.
 */
function scalarOrUndefined(v) {
    if (v === undefined)
        return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
/**
 * Normalize a sentinel list: trim every entry and drop the blanks. If NOTHING
 * survives it returns undefined (fall through to the next tier) — NEVER `[]`,
 * because an empty sentinel list silently removes the kill-switch check and lets
 * the money rail report armed despite a DISARMED file. This is the core of the
 * blocking fix: a malformed `AR_DISARM_SENTINELS=':'` must not defeat disarm.
 */
function sentinelListOrUndefined(raw) {
    if (raw === undefined)
        return undefined;
    const cleaned = raw.map((s) => s.trim()).filter((s) => s.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
}
/**
 * Resolve the AR rail's file paths with precedence: explicit override → env var
 * → documented default. This is what makes the package PORTABLE off the
 * operator's `/home/maestro` layout without a fork — the DEFAULT_AR_* constants
 * are only defaults, never the sole option.
 *
 * PRESENCE != VALUE at every tier (env AND overrides): a defined-but-blank or
 * whitespace-only scalar, and a sentinel list that trims to nothing, are treated
 * as ABSENT and fall through — a blank deployment variable can NEVER empty a
 * path or silently strip the disarm sentinels. (Overrides are normalized too,
 * for consistency: an explicit `briefFile: ''` or `disarmSentinels: []` is a
 * config mistake, not an instruction to break the rail.)
 *
 * `env` is the CONSUMER'S process.env, passed in: this package deliberately
 * carries no node types and never touches `process` itself, so the caller hands
 * the environment across the boundary (the same injected-effects posture as the
 * stores). Recognised keys: AR_BRIEF_FILE, AR_BILLING_LOG, AR_DISARM_SENTINELS
 * (a ':'-separated path list, mirroring $PATH), AR_DISARM_ENV.
 */
export function resolveArPaths(overrides = {}, env = {}) {
    const envSentinel = scalarOrUndefined(env.AR_DISARM_SENTINELS);
    const sentinelsFromEnv = envSentinel === undefined ? undefined : sentinelListOrUndefined(envSentinel.split(':'));
    return {
        briefFile: scalarOrUndefined(overrides.briefFile) ??
            scalarOrUndefined(env.AR_BRIEF_FILE) ??
            DEFAULT_AR_BRIEF_FILE,
        billingLog: scalarOrUndefined(overrides.billingLog) ??
            scalarOrUndefined(env.AR_BILLING_LOG) ??
            DEFAULT_AR_BILLING_LOG,
        disarmSentinels: sentinelListOrUndefined(overrides.disarmSentinels) ??
            sentinelsFromEnv ??
            DEFAULT_AR_DISARM_SENTINELS,
        disarmEnv: scalarOrUndefined(overrides.disarmEnv) ??
            scalarOrUndefined(env.AR_DISARM_ENV) ??
            DEFAULT_AR_DISARM_ENV,
    };
}
// Line shapes pinned to ar-monthly-billing.sh's log() calls. Everything not
// matched by a whitelist pattern is DROPPED — never passed through — so
// client names, emails, PayPal internal ids, HTTP bodies and secrets paths
// (all present in the raw log) cannot leak into a projection.
const RE_LINE = /^\[([^\]]+)\]\s+(.*)$/;
const RE_CREATED = /^CREATED\s+(\S+)\s+id=\S+\s+\((.*)\)\s*$/;
const RE_AMOUNT = /\$([\d,]+(?:\.\d+)?)\s*→/;
const RE_SENT = /^SENT\s+(\S+)\s+\(HTTP\s+(\d+)\)/;
const RE_SKIP = /^SKIP\s+(\S+)\s+already exists/;
const RE_ERROR = /^ERROR\s+(create|send)\s+(\S+)\s+HTTP\s+(\d+)/;
const RE_FATAL = /^FATAL:/;
const RE_RUN_COMPLETE = /^===\s*run complete mode=(\S+)\s+month=(\S+)\s*===/;
/**
 * Parse ar-monthly-billing.log. Pure + total: unmatched lines are silently
 * dropped, garbage parses to [] — it never throws, upholding the leaf's
 * non-throwing read contract.
 */
export function parseBillingLog(text) {
    const out = [];
    for (const raw of text.split('\n')) {
        const lineM = raw.match(RE_LINE);
        if (!lineM?.[1] || !lineM[2])
            continue;
        const atISO = lineM[1];
        const rest = lineM[2];
        const created = rest.match(RE_CREATED);
        if (created?.[1]) {
            const entry = { atISO, kind: 'created', invoiceNumber: created[1] };
            const amt = created[2]?.match(RE_AMOUNT)?.[1];
            if (amt !== undefined)
                entry.amountUSD = Number(amt.replace(/,/g, ''));
            out.push(entry);
            continue;
        }
        const sent = rest.match(RE_SENT);
        if (sent?.[1] && sent[2]) {
            out.push({ atISO, kind: 'sent', invoiceNumber: sent[1], httpStatus: Number(sent[2]) });
            continue;
        }
        const skip = rest.match(RE_SKIP);
        if (skip?.[1]) {
            out.push({ atISO, kind: 'skipped', invoiceNumber: skip[1] });
            continue;
        }
        const error = rest.match(RE_ERROR);
        if (error?.[1] && error[2] && error[3]) {
            out.push({
                atISO,
                kind: 'error',
                op: error[1],
                invoiceNumber: error[2],
                httpStatus: Number(error[3]),
            });
            continue;
        }
        if (RE_FATAL.test(rest)) {
            // Detail deliberately dropped: FATAL messages can carry secrets paths.
            out.push({ atISO, kind: 'error' });
            continue;
        }
        const run = rest.match(RE_RUN_COMPLETE);
        if (run?.[1] && run[2]) {
            out.push({ atISO, kind: 'run_complete', mode: run[1], month: run[2] });
            continue;
        }
        // anything else: dropped by design
    }
    return out;
}
/** date-only 'YYYY-MM-DD' → ISO-8601 at UTC midnight (brief is date-granular). */
function dateToISO(date) {
    return `${date}T00:00:00Z`;
}
/** Receipt text for one billing entry — whitelist fields only. */
function billingReceipt(e) {
    switch (e.kind) {
        case 'created': {
            const amount = e.amountUSD !== undefined ? ` USD ${e.amountUSD.toFixed(2)}` : '';
            const r = {
                leaf: LEAF,
                atISO: e.atISO,
                kind: 'invoice_created',
                detail: `${e.invoiceNumber ?? '?'}${amount} created`,
            };
            if (e.invoiceNumber !== undefined)
                r.ref = e.invoiceNumber;
            return r;
        }
        case 'sent': {
            const r = {
                leaf: LEAF,
                atISO: e.atISO,
                kind: 'invoice_sent',
                detail: `${e.invoiceNumber ?? '?'} sent (HTTP ${e.httpStatus ?? '?'})`,
            };
            if (e.invoiceNumber !== undefined)
                r.ref = e.invoiceNumber;
            return r;
        }
        case 'skipped': {
            const r = {
                leaf: LEAF,
                atISO: e.atISO,
                kind: 'invoice_skipped',
                detail: `${e.invoiceNumber ?? '?'} skipped — already exists (idempotency guard)`,
            };
            if (e.invoiceNumber !== undefined)
                r.ref = e.invoiceNumber;
            return r;
        }
        case 'error': {
            const what = e.op !== undefined && e.invoiceNumber !== undefined
                ? `${e.op} ${e.invoiceNumber} failed (HTTP ${e.httpStatus ?? '?'})`
                : 'billing run fatal error';
            const r = { leaf: LEAF, atISO: e.atISO, kind: 'billing_error', detail: what };
            if (e.invoiceNumber !== undefined)
                r.ref = e.invoiceNumber;
            return r;
        }
        case 'run_complete':
            return {
                leaf: LEAF,
                atISO: e.atISO,
                kind: 'billing_run_complete',
                detail: `billing run complete mode=${e.mode ?? '?'} month=${e.month ?? '?'}`,
            };
    }
}
/**
 * The AR rail as a READ-ONLY ReadableLeaf. NO arm(), NO fire() — by type.
 */
export class ArRailLeaf {
    store;
    id = LEAF;
    constructor(store) {
        this.store = store;
    }
    brief() {
        const text = this.store.readBrief();
        return text === null ? null : parseBrief(text);
    }
    billing() {
        const text = this.store.readBillingLog();
        return text === null ? [] : parseBillingLog(text);
    }
    /** armed only when POSITIVELY verified; unknown degrades to false. */
    armState() {
        let disarmed;
        try {
            disarmed = this.store.readDisarmed();
        }
        catch {
            disarmed = null;
        }
        if (disarmed === true)
            return { armed: false, tag: '[DISARMED]' };
        if (disarmed === false)
            return { armed: true, tag: '[ARMED]' };
        return { armed: false, tag: '[arm state unknown]' };
    }
    async status() {
        const { armed, tag } = this.armState();
        try {
            const b = this.brief();
            if (b === null || b.date === null) {
                return {
                    leaf: LEAF,
                    health: 'unknown',
                    armed,
                    pendingCount: 0,
                    summary: `AR ${tag}: no brief available`,
                };
            }
            const overdue = b.overdueCount ?? 0;
            const health = overdue > 0 ? 'attention' : 'ok';
            const cur = b.currency ?? 'USD';
            const outstanding = b.outstanding ?? 0;
            const summary = overdue > 0
                ? `AR ${tag}: ${overdue} overdue, ${cur} ${outstanding.toFixed(2)} outstanding across ${b.openCount ?? 0} open`
                : `AR ${tag}: nothing overdue, ${cur} ${outstanding.toFixed(2)} outstanding`;
            return { leaf: LEAF, health, armed, pendingCount: 0, summary };
        }
        catch {
            return {
                leaf: LEAF,
                health: 'unknown',
                armed,
                pendingCount: 0,
                summary: `AR ${tag}: status unavailable`,
            };
        }
    }
    /**
     * Last activity across BOTH rails: the daily brief heartbeat vs the last
     * monthly-billing log entry — whichever is more recent (epoch compare, the
     * two sources carry different ISO offsets).
     */
    async lastRun() {
        try {
            const candidates = [];
            const b = this.brief();
            if (b !== null && b.date !== null) {
                candidates.push({
                    leaf: LEAF,
                    lastRunISO: dateToISO(b.date),
                    outcome: 'ok',
                    detail: `brief: scanned ${b.scanned ?? 0} invoice(s), ${b.overdueCount ?? 0} overdue`,
                });
            }
            const entries = this.billing();
            const last = entries[entries.length - 1];
            if (last !== undefined) {
                candidates.push({
                    leaf: LEAF,
                    lastRunISO: last.atISO,
                    outcome: last.kind === 'error' ? 'error' : 'ok',
                    detail: last.kind === 'run_complete'
                        ? `billing: run complete mode=${last.mode ?? '?'} month=${last.month ?? '?'}`
                        : `billing: last entry ${last.kind}`,
                });
            }
            let best = null;
            let bestEpoch = Number.NEGATIVE_INFINITY;
            for (const c of candidates) {
                const epoch = c.lastRunISO === null ? Number.NaN : Date.parse(c.lastRunISO);
                if (!Number.isNaN(epoch) && epoch >= bestEpoch) {
                    best = c;
                    bestEpoch = epoch;
                }
            }
            return best ?? { leaf: LEAF, lastRunISO: null, outcome: 'unknown' };
        }
        catch {
            return { leaf: LEAF, lastRunISO: null, outcome: 'unknown' };
        }
    }
    /**
     * ALWAYS []. The AR rail is read-only BY TYPE in this phase: no fire
     * surface, therefore no approval queue. (Phase-4 --json retrofit graduates
     * AR to ArmableLeaf, where reminder-sends become real ApprovalCards.)
     */
    async pendingApprovals() {
        return [];
    }
    async spend() {
        try {
            const b = this.brief();
            return {
                leaf: LEAF,
                currency: b?.currency ?? 'USD',
                amount: b?.outstanding ?? 0,
                basis: 'outstanding_ar',
                asOfISO: b?.date ? dateToISO(b.date) : null,
            };
        }
        catch {
            return { leaf: LEAF, currency: 'USD', amount: 0, basis: 'outstanding_ar', asOfISO: null };
        }
    }
    /**
     * Receipts from BOTH files, whitelist-projected (invoice numbers, amounts,
     * currencies, dates, statuses — NEVER recipients/client names/ids/bodies):
     *   • brief OVERDUE rows  → invoice_overdue (at the brief date, UTC midnight)
     *   • brief PAID rows     → invoice_paid (at the payment date)
     *   • billing log entries → invoice_created / invoice_sent / invoice_skipped /
     *                           billing_error / billing_run_complete
     * Filtered by EPOCH against sinceISO (sources carry different UTC offsets);
     * an unparseable sinceISO degrades to "return all", never a throw.
     */
    async receipts(sinceISO) {
        try {
            const receipts = [];
            const b = this.brief();
            if (b !== null && b.date !== null) {
                const briefISO = dateToISO(b.date);
                for (const o of b.overdue) {
                    receipts.push({
                        leaf: LEAF,
                        atISO: briefISO,
                        kind: 'invoice_overdue',
                        detail: `${o.invoiceNumber} ${o.currency} ${o.amount.toFixed(2)} — ${o.daysOverdue} days overdue`,
                        ref: o.invoiceNumber,
                    });
                }
                for (const p of b.paid) {
                    receipts.push({
                        leaf: LEAF,
                        atISO: dateToISO(p.paymentDate),
                        kind: 'invoice_paid',
                        detail: `${p.invoiceNumber} ${p.currency} ${p.amount.toFixed(2)} paid`,
                        ref: p.invoiceNumber,
                    });
                }
            }
            for (const e of this.billing())
                receipts.push(billingReceipt(e));
            const sinceEpoch = Date.parse(sinceISO);
            const filtered = Number.isNaN(sinceEpoch)
                ? receipts
                : receipts.filter((r) => {
                    const epoch = Date.parse(r.atISO);
                    return !Number.isNaN(epoch) && epoch >= sinceEpoch;
                });
            return filtered.sort((a, z) => Date.parse(a.atISO) - Date.parse(z.atISO));
        }
        catch {
            return [];
        }
    }
}
//# sourceMappingURL=ar-rail.js.map