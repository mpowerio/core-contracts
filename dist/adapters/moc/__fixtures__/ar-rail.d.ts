/**
 * Fixtures for the AR rail READ-ONLY shim tests (lane 2 of the 48h
 * contract-variance test). ALL identities here are FAKE (\.example domains,
 * invented client names) — they exist precisely so the tests can prove the
 * shim's PII firewall: none of these strings may ever appear in a projected
 * output. Shapes are pinned to the REAL emitters:
 *
 *   • brief  — ar-watch.sh print block (mpowerio-ar), as on the operator's
 *              2026-07-10 latest-brief.txt
 *   • billing log — ar-monthly-billing.sh `log()` lines (CREATED / SENT /
 *              SKIP / ERROR / FATAL / `=== run complete … ===`), `date -Iseconds`
 *              timestamps with a UTC offset
 *
 * NOTE: this module ships in `dist` because tsconfig.build only excludes
 * *.test.ts — it is inert exported strings; reviewers may relocate it.
 */
/** A full healthy Daily Money Brief with overdue + paid rows (fake recipients). */
export declare const FIXTURE_BRIEF = "================================================================\n mpowerio \u2014 DAILY MONEY BRIEF  (2026-07-10)\n PayPal AR / Invoice-Watch  \u00B7  READ-ONLY\n================================================================\n\n Invoices scanned : 22\n Outstanding      : USD 6627.01  across 5 open invoice(s)\n Overdue          : 2 invoice(s)\n Paid (last 48h)  : 1 payment(s)\n Paid this month  : USD 200.00\n\n----------------------------------------------------------------\n OVERDUE  (status SENT/UNPAID/PARTIALLY_PAID, past due date)\n----------------------------------------------------------------\n   #0010            USD 4147.01    57 days  ap@fake-client-alpha.example\n   #0011             USD 750.00    39 days  billing@fake-client-beta.example\n\n----------------------------------------------------------------\n PAID \u2014 last 48h\n----------------------------------------------------------------\n   #0012             USD 200.00  2026-07-09  payer@fake-client-gamma.example\n\n----------------------------------------------------------------\n REMINDER-ELIGIBLE  (overdue \u2192 would nudge with --send)\n NOTE: PayPal caps reminders at 2/day per invoice.\n       DRY-RUN: nothing sent. Use:  ar-watch.sh --send <invoice_number>\n----------------------------------------------------------------\n   would remind  #0010            ap@fake-client-alpha.example  (57 days overdue)\n   would remind  #0011            billing@fake-client-beta.example  (39 days overdue)\n\n================================================================\n";
/** A brief with nothing overdue. */
export declare const FIXTURE_BRIEF_CLEAN = "================================================================\n mpowerio \u2014 DAILY MONEY BRIEF  (2026-07-10)\n PayPal AR / Invoice-Watch  \u00B7  READ-ONLY\n================================================================\n\n Invoices scanned : 22\n Outstanding      : USD 950.00  across 2 open invoice(s)\n Overdue          : 0 invoice(s)\n Paid (last 48h)  : 0 payment(s)\n Paid this month  : USD 0.00\n\n----------------------------------------------------------------\n OVERDUE  (status SENT/UNPAID/PARTIALLY_PAID, past due date)\n----------------------------------------------------------------\n   (none \u2014 nothing past due)\n\n----------------------------------------------------------------\n PAID \u2014 last 48h\n----------------------------------------------------------------\n   (none)\n\n================================================================\n";
/**
 * A staged (mode=draft) monthly-billing run — the "staged invoice
 * numbers/amounts" surface. Mirrors the real 2026-07-04 log shape, with FAKE
 * client names + emails inside the parens the shim must never re-emit.
 */
export declare const FIXTURE_BILLING_LOG_DRAFT = "[2026-07-04T08:18:24-04:00] CREATED MPIO-202607-AAA id=INV2-2W2A-LCSM-4VSJ-3QMB (Fake Client Alpha $750.00 \u2192 ap@fake-client-alpha.example)\n[2026-07-04T08:18:25-04:00] CREATED MPIO-202607-BBB id=INV2-2M4K-SLMY-37ZZ-RBRN (Fake Client Beta $750.00 \u2192 billing@fake-client-beta.example)\n[2026-07-04T08:18:25-04:00] CREATED MPIO-202607-CCC id=INV2-K8NG-QNQF-ZS8V-8PDG (Fake Client Gamma $200.00 \u2192 payer@fake-client-gamma.example)\n[2026-07-04T08:18:26-04:00] === run complete mode=draft month=2026-07 ===\n";
/**
 * A later send-mode run with every other verb the script logs: SKIP
 * (idempotency guard), SENT, ERROR (whose HTTP body can carry recipient
 * emails — the projection must drop the body entirely), and FATAL (whose
 * detail carries a secrets path — same rule).
 */
export declare const FIXTURE_BILLING_LOG_MIXED = "[2026-07-04T08:18:24-04:00] CREATED MPIO-202607-AAA id=INV2-2W2A-LCSM-4VSJ-3QMB (Fake Client Alpha $750.00 \u2192 ap@fake-client-alpha.example)\n[2026-07-04T08:18:26-04:00] === run complete mode=draft month=2026-07 ===\n[2026-08-01T08:00:00-04:00] SKIP MPIO-202608-AAA already exists \u2014 idempotency guard held\n[2026-08-01T08:00:01-04:00] CREATED MPIO-202608-BBB id=INV2-MMMM-NNNN-OOOO-PPPP (Fake Client Beta $750.00 \u2192 billing@fake-client-beta.example)\n[2026-08-01T08:00:02-04:00] SENT MPIO-202608-BBB (HTTP 202)\n[2026-08-01T08:00:03-04:00] ERROR create MPIO-202608-CCC HTTP 422: {\"name\":\"INVALID_REQUEST\",\"details\":\"recipient payer@fake-client-gamma.example rejected\"}\n[2026-08-01T08:00:04-04:00] === run complete mode=send month=2026-08 ===\n";
/** A run that died before its `run complete` marker (FATAL, secrets path in detail). */
export declare const FIXTURE_BILLING_LOG_FATAL = "[2026-07-04T08:18:26-04:00] === run complete mode=draft month=2026-07 ===\n[2026-09-01T08:00:00-04:00] FATAL: creds unreadable at /home/fake/.secrets/paypal.env\n";
/** Garbage that must parse to nothing without throwing. */
export declare const FIXTURE_GARBAGE = "PK\u0003\u0004 \0\0 not a log at all\nrandom ] [ CREATED without shape\n";
/** Every fake identity above — the PII-firewall tests assert none ever leaks. */
export declare const FIXTURE_PII_STRINGS: string[];
//# sourceMappingURL=ar-rail.d.ts.map