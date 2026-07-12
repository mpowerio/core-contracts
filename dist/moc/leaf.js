/**
 * MOC leaf contract — the honest, roast-hardened split for the 🍀 clover.
 *
 * MOC = the operator-facing STEM (arm / approve / watch) sitting over four
 * engine-LEAVES (content · packet · AR · reaction). The stem READS status and
 * DISPATCHES approved actions; it NEVER reasons or generates — that keeps the
 * doer≠reviewer moat intact.
 *
 * THE KEYSTONE: split the contract HONESTLY into two interfaces, not one leaky
 * interface whose mutation methods throw on the read-only leaves.
 *
 *   • ReadableLeaf — total, read-only, implemented by EVERY leaf. None of its
 *     methods may throw BY DESIGN: a broken/absent data source degrades to a
 *     safe envelope (health 'unknown'), it never rejects. A dead leaf must not
 *     crash the stem's status sweep.
 *   • ArmableLeaf  — extends ReadableLeaf with arm/fire. ONLY content, reaction,
 *     and AR-once-retrofitted implement it. The packet leaf is ReadableLeaf
 *     ONLY — it has NO fire surface BY TYPE (the PII firewall is a property of
 *     the type, not a runtime landmine). In THIS phase AR is also ReadableLeaf
 *     only (no --json fire surface yet — Phase 4).
 *
 * The stem discriminates with the `isArmable` type guard (presence of arm/fire),
 * NEVER with try/catch. A ReadableLeaf[] can hold both shapes cleanly; only the
 * ones that narrow to ArmableLeaf expose arm/fire — enforced by the compiler.
 *
 * Read methods are async: the stem consumes them from a Next.js server /
 * cron surface, and future leaves (content/packet) read over network/db. The
 * mutation methods (arm/fire) MAY reject — firing an unknown approval SHOULD
 * error — because they are NOT part of the non-throwing read contract.
 */
/**
 * NOMINAL BRAND for ArmableLeaf. A leaf becomes armable ONLY by deliberately
 * carrying this symbol — you cannot set it without importing it, so a plain
 * object that merely happens to expose `arm`/`fire` methods (accidental duck-
 * typing) can never masquerade as armable and slip past `isArmable` into the
 * fire dispatch. This makes the money/PII firewall a DELIBERATE opt-in, not an
 * accident of method names: an implementor who did not mean to be armable will
 * not be, and `arm`/`fire` typos on a read-only leaf stay inert.
 */
export const ARMABLE_BRAND = Symbol('mpowerio.core-contracts/ArmableLeaf');
/**
 * Discriminate an ArmableLeaf from a plain ReadableLeaf. The test is the
 * NOMINAL BRAND plus the presence of both arm and fire — NOT a try/catch on a
 * method that throws, and NOT bare structural duck-typing (which would let an
 * accidental arm/fire pair pass). This is how the stem decides whether to
 * render arm/fire controls: no exceptions, and TypeScript narrows the type for
 * callers inside the guard.
 */
export function isArmable(leaf) {
    const maybe = leaf;
    return (maybe[ARMABLE_BRAND] === true &&
        typeof maybe.arm === 'function' &&
        typeof maybe.fire === 'function');
}
//# sourceMappingURL=leaf.js.map