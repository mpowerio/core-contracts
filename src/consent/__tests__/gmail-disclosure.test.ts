import { describe, expect, it } from 'vitest';
import { CONSENT_LANGS } from '../ai-improvement.js';
import {
  GMAIL_DISCLOSURE_COPY,
  GMAIL_DISCLOSURE_LOOKBACK_DAYS,
  GMAIL_DISCLOSURE_VERSION,
  gmailDisclosureSha256,
  renderGmailDisclosure,
} from '../gmail-disclosure.js';

/**
 * PINNED. If a hash changes, the disclosure changed: bump
 * GMAIL_DISCLOSURE_VERSION and pin the new hashes under the new version.
 * Never edit an existing entry; append a new one.
 */
const PIN_HISTORY = [
  {
    // PR #8 head 6f70a79; never released. ES wording narrowed in the review repair.
    version: '2026-11-22.1',
    en: 'f7734e51e480bec7bbff2995eafa1d9157c7d0b914d741f492ac4597534d8bd4',
    es: 'c906b4f448db5b89325da4b30e6f11c75f760dc2543327488f01d0a7c7bc54c0',
  },
  {
    version: '2026-11-22.2',
    en: 'f7734e51e480bec7bbff2995eafa1d9157c7d0b914d741f492ac4597534d8bd4',
    es: '86ab905cf48de0e804112b266c84c62d8d0fa0f7fe24cf94f0853e6dc9aa86b3',
  },
] as const;
const PINNED: { version: string; en: string; es: string } = PIN_HISTORY[PIN_HISTORY.length - 1] as (typeof PIN_HISTORY)[number];

describe('Gmail disclosure', () => {
  it('known-answer: the English text is exactly the legal-review sentence', () => {
    expect(GMAIL_DISCLOSURE_COPY.en.disclosure).toBe(
      'Connecting copies messages from the last 14 days into your CRM, stored by our database and hosting providers for us. We never use them for training or ads.',
    );
    expect(GMAIL_DISCLOSURE_COPY.en.agree).toBe('I agree');
    expect(GMAIL_DISCLOSURE_COPY.en.connect).toBe('Connect Google');
  });

  it('the Spanish text carries the same facts', () => {
    const es = GMAIL_DISCLOSURE_COPY.es.disclosure;
    for (const phrase of [
      'últimos 14 días',
      'tu CRM',
      'proveedores de base de datos y de alojamiento',
      'para nosotros',
      'Nunca los usamos para entrenar modelos ni para publicidad.',
    ]) {
      expect(es).toContain(phrase);
    }
    expect(GMAIL_DISCLOSURE_COPY.es.agree).toBe('Acepto');
    expect(GMAIL_DISCLOSURE_COPY.es.connect).toBe('Conectar Google');
  });

  it('the look-back constant matches the number in both texts', () => {
    expect(GMAIL_DISCLOSURE_LOOKBACK_DAYS).toBe(14);
    for (const lang of CONSENT_LANGS) {
      expect(GMAIL_DISCLOSURE_COPY[lang].disclosure).toContain(`${GMAIL_DISCLOSURE_LOOKBACK_DAYS} `);
    }
  });

  it('EN/ES parity: same keys, none empty', () => {
    expect(Object.keys(GMAIL_DISCLOSURE_COPY.es).sort()).toEqual(Object.keys(GMAIL_DISCLOSURE_COPY.en).sort());
    for (const lang of CONSENT_LANGS) {
      for (const v of Object.values(GMAIL_DISCLOSURE_COPY[lang])) expect(v.trim()).not.toBe('');
    }
  });

  for (const lang of CONSENT_LANGS) {
    it(`${lang} text matches its pinned hash`, () => {
      expect(gmailDisclosureSha256(lang)).toBe(PINNED[lang]);
    });
  }

  it('a text change requires a version bump', () => {
    const changed = CONSENT_LANGS.filter((lang) => gmailDisclosureSha256(lang) !== PINNED[lang]);
    if (GMAIL_DISCLOSURE_VERSION === PINNED.version && changed.length > 0) {
      throw new Error(
        `Gmail disclosure changed (${changed.join(', ')}) but GMAIL_DISCLOSURE_VERSION is still ${GMAIL_DISCLOSURE_VERSION}. Bump it and pin the new hashes.`,
      );
    }
    expect(GMAIL_DISCLOSURE_VERSION).toBe(PINNED.version);
    expect(GMAIL_DISCLOSURE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    const versions = PIN_HISTORY.map((p) => p.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(
        [...versions].sort((a, b) => {
          const [da, na] = a.split('.');
          const [db, nb] = b.split('.');
          return da === db ? Number(na) - Number(nb) : (da ?? '') < (db ?? '') ? -1 : 1;
        }),
      ).toEqual(versions);
  });

  it('the hashed text includes the language and the checkbox label', () => {
    expect(renderGmailDisclosure('en').startsWith('lang:en\n')).toBe(true);
    expect(renderGmailDisclosure('en')).toContain('\nI agree\n');
  });

  it('the copy is frozen', () => {
    const en = GMAIL_DISCLOSURE_COPY.en as { disclosure: string };
    expect(() => {
      en.disclosure = 'changed';
    }).toThrow(TypeError);
  });
});
