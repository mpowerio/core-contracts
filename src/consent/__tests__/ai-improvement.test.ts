import { describe, expect, it } from 'vitest';
import {
  AI_CONSENT_COPY,
  AI_CONSENT_KINDS,
  AI_CONSENT_OFFERED,
  AI_CONSENT_WORDING_VERSIONS,
  AI_IMPROVEMENT_DETAILS_URL,
  CONSENT_LANGS,
  formatStateOn,
  renderAiConsentWording,
  sha256Hex,
  validateAiConsentEvent,
  wordingSha256,
  type AiConsentEvent,
  type AiConsentKind,
  type ConsentLang,
} from '../ai-improvement.js';

/**
 * PINNED WORDING. One entry per kind: the current version and the SHA-256 of
 * each language's canonical text.
 *
 * If a test below fails because a hash changed, the wording changed. Do NOT
 * just paste the new hash under the old version. Bump that kind's version in
 * ai-improvement.ts (YYYY-MM-DD.N), then pin the new hashes under the new
 * version. Ledger rows already written point at the old version and hash;
 * reusing a version string would make those rows ambiguous.
 */
const PINNED: Record<AiConsentKind, { version: string } & Record<ConsentLang, string>> = {
  service_improvement: {
    version: '2026-11-22.1',
    en: 'dad3621d1d421dba553ec4523ce53dfa820914deb65d6be573c86a6d5980d9c4',
    es: '0e8656cf6ac66406b157fbe04559047e954a8ca64c083af2a4d6208c6557cf81',
  },
  own_records_training: {
    version: '2026-11-22.1',
    en: 'b89b675d2af49f478342a6ca8c5a8c5ebedbe9b22e1bca68c2a7640eb46d6c13',
    es: '3af1aff2981c31efa5a168d4d2a6decdd474571dcff71002c8a947f60544ba92',
  },
};

describe('pinned wording hashes', () => {
  for (const kind of AI_CONSENT_KINDS) {
    for (const lang of CONSENT_LANGS) {
      it(`${kind}/${lang} text matches its pinned hash`, () => {
        expect(wordingSha256(kind, lang)).toBe(PINNED[kind][lang]);
      });
    }
  }
});

describe('a text change requires a version bump', () => {
  for (const kind of AI_CONSENT_KINDS) {
    it(`${kind}: the current version is the pinned version, and the text still hashes to its pin`, () => {
      const pin = PINNED[kind];
      const version = AI_CONSENT_WORDING_VERSIONS[kind];
      const changed = CONSENT_LANGS.filter((lang) => wordingSha256(kind, lang) !== pin[lang]);
      // Same version + different text = a silent change. Fail with directions.
      if (version === pin.version && changed.length > 0) {
        throw new Error(
          `${kind} wording changed (${changed.join(', ')}) but its version is still ${version}. ` +
            'Bump the version in ai-improvement.ts and pin the new hashes under the new version.',
        );
      }
      // New version without new pins = the pin table is stale.
      expect(version).toBe(pin.version);
    });
  }

  it('versions use the YYYY-MM-DD.N format', () => {
    for (const kind of AI_CONSENT_KINDS) {
      expect(AI_CONSENT_WORDING_VERSIONS[kind]).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    }
  });

  it('the hash covers the language: EN and ES hashes differ', () => {
    for (const kind of AI_CONSENT_KINDS) {
      expect(wordingSha256(kind, 'en')).not.toBe(wordingSha256(kind, 'es'));
    }
  });

  it('a one-word change in the body changes the hash (the pin can catch an edit)', () => {
    const original = renderAiConsentWording('service_improvement', 'en');
    const edited = original.replace('never sold', 'not sold');
    expect(edited).not.toBe(original);
    expect(sha256Hex(original)).toBe(PINNED.service_improvement.en);
    expect(sha256Hex(edited)).not.toBe(PINNED.service_improvement.en);
  });

  it('the copy is frozen, so a consumer cannot change it at runtime', () => {
    const en = AI_CONSENT_COPY.service_improvement.en as { body: string };
    expect(() => {
      en.body = 'changed';
    }).toThrow(TypeError);
    expect(wordingSha256('service_improvement', 'en')).toBe(PINNED.service_improvement.en);
  });
});

describe('EN/ES parity', () => {
  for (const kind of AI_CONSENT_KINDS) {
    it(`${kind}: both languages have the same keys, none empty`, () => {
      const en = AI_CONSENT_COPY[kind].en;
      const es = AI_CONSENT_COPY[kind].es;
      expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
      for (const lang of CONSENT_LANGS) {
        for (const [key, value] of Object.entries(AI_CONSENT_COPY[kind][lang])) {
          expect(typeof value, `${kind}/${lang}/${key}`).toBe('string');
          expect((value as string).trim(), `${kind}/${lang}/${key}`).not.toBe('');
        }
      }
    });

    it(`${kind}: the ES text is not the EN text`, () => {
      const en = AI_CONSENT_COPY[kind].en;
      const es = AI_CONSENT_COPY[kind].es;
      for (const key of ['title', 'body', 'attestation', 'turnOn', 'turnOff', 'turnOffNotice'] as const) {
        expect(es[key], key).not.toBe(en[key]);
      }
    });

    it(`${kind}: the stateOn template has the same placeholders in both languages`, () => {
      const ph = (s: string): string[] => (s.match(/\{[a-z]+\}/g) ?? []).sort();
      expect(ph(AI_CONSENT_COPY[kind].es.stateOn)).toEqual(ph(AI_CONSENT_COPY[kind].en.stateOn));
      expect(ph(AI_CONSENT_COPY[kind].en.stateOn)).toEqual(['{date}', '{name}', '{role}']);
    });
  }
});

/**
 * KNOWN-ANSWER: the policy sentences the switch must carry. Each phrase is
 * quoted from mpowerio-substrate PR #376 at 6652ab8 (privacy/page.tsx and
 * terms/page.tsx), with HTML entities decoded and curly apostrophes written
 * straight. If the policy changes, update this list from the new policy text
 * first, then the wording.
 */
const POLICY_PHRASES_SERVICE_IMPROVEMENT_EN: Array<[string, string]> = [
  ['off by default (privacy: "It is off unless the business opts in")', 'Off unless you turn it on'],
  ['what is used (privacy: "Only the work steps")', 'what was done, in what order, and how long it took'],
  ['what is taken out (terms)', 'with names, contact details, prices and message text taken out'],
  ['whose models, where (terms)', "to improve and train mpowerio's own models and services, on mpowerio's own hardware"],
  ['nothing from before opt-in (privacy)', 'Nothing from before you turn it on is used'],
  ['customer content excluded (terms)', 'never includes your customer content'],
  ['call recordings and transcripts excluded (privacy)', 'call recordings or transcripts'],
  ['Gmail and Drive excluded (privacy)', 'a connected Gmail account or Google Drive'],
  ['derived summaries and fields excluded (privacy)', 'including summaries or fields our software makes from it'],
  ['never sold or shared (privacy)', 'never sold, never shared with other clients or anyone else'],
  ['never advertising (privacy)', 'never used for advertising'],
  [
    'telling staff (terms)',
    'you are responsible for telling the people who work for you that their work steps, with names removed, are used this way',
  ],
  ['withdraw anytime (privacy: "can switch off at any time")', 'You can turn it off at any time'],
  ['deletion on withdraw (privacy)', 'delete the service-improvement data we hold from'],
  ['no price or service change (privacy, verbatim)', 'Choosing not to take part never changes your price or service.'],
];

describe('known-answer: policy-required phrases are present', () => {
  const si = AI_CONSENT_COPY.service_improvement;

  for (const [why, phrase] of POLICY_PHRASES_SERVICE_IMPROVEMENT_EN) {
    it(`service_improvement/en body: ${why}`, () => {
      expect(si.en.body).toContain(phrase);
    });
  }

  it('attestation: authority to accept agreements for the business (privacy)', () => {
    expect(si.en.attestation).toBe("I'm authorized to accept agreements for this business.");
    expect(AI_CONSENT_COPY.own_records_training.en.attestation).toBe(si.en.attestation);
  });

  it('turn-off notice repeats the deletion promise', () => {
    expect(si.en.turnOffNotice).toContain('deletes the service-improvement data we hold');
  });

  it('links to the policy anchor that exists at #376', () => {
    expect(AI_IMPROVEMENT_DETAILS_URL).toBe('https://mpowerio.ai/privacy#ai-improvement-program');
    for (const kind of AI_CONSENT_KINDS) {
      for (const lang of CONSENT_LANGS) {
        expect(AI_CONSENT_COPY[kind][lang].detailsUrl).toBe(AI_IMPROVEMENT_DETAILS_URL);
      }
    }
  });

  it('service_improvement/es carries the same exclusions and promises', () => {
    for (const phrase of [
      'Está desactivado a menos que tú lo actives',
      'qué se hizo, en qué orden y cuánto tiempo tomó',
      'No se usa nada de antes de que lo actives',
      'grabaciones ni transcripciones de llamadas',
      'Gmail',
      'Google Drive',
      'incluidos los resúmenes o campos que nuestro software crea a partir de ellos',
      'Nunca se vende',
      'nunca se usa para publicidad',
      'Puedes desactivarlo cuando quieras',
      'borramos los datos de mejora del servicio',
      'Decidir no participar nunca cambia tu precio ni tu servicio.',
    ]) {
      expect(si.es.body).toContain(phrase);
    }
  });

  it('own_records_training lists what is always left out (privacy), both languages', () => {
    const o = AI_CONSENT_COPY.own_records_training;
    for (const phrase of [
      'Names, email addresses, phone numbers, street addresses and all free text (notes, descriptions and message text) are always left out',
      'call recordings, transcripts, a connected Gmail account or Google Drive',
      'including summaries or fields our software makes from it',
      'separate from the AI improvement program',
    ]) {
      expect(o.en.body).toContain(phrase);
    }
    for (const phrase of ['grabaciones o transcripciones de llamadas', 'Gmail', 'Google Drive', 'aparte del programa de mejora de IA']) {
      expect(o.es.body).toContain(phrase);
    }
  });
});

describe('own-records training is not offered yet (Chair ruling 3)', () => {
  it('is in the contract but not offered', () => {
    expect(AI_CONSENT_KINDS).toContain('own_records_training');
    expect(AI_CONSENT_OFFERED.own_records_training).toBe(false);
    expect(AI_CONSENT_OFFERED.service_improvement).toBe(true);
  });

  it('carries "Not offered yet" in both languages; the program does not', () => {
    expect(AI_CONSENT_COPY.own_records_training.en.notOffered).toBe('Not offered yet');
    expect(AI_CONSENT_COPY.own_records_training.es.notOffered).toBe('Todavía no se ofrece');
    expect(AI_CONSENT_COPY.service_improvement.en.notOffered).toBeUndefined();
    expect(AI_CONSENT_COPY.service_improvement.es.notOffered).toBeUndefined();
  });

  it('the "Not offered yet" line is part of the hashed text', () => {
    expect(renderAiConsentWording('own_records_training', 'en')).toContain('Not offered yet');
  });
});

describe('formatStateOn', () => {
  it('fills date, name and role', () => {
    expect(
      formatStateOn(AI_CONSENT_COPY.service_improvement.en, { date: 'Dec 1, 2026', name: 'Pat Owner', role: 'owner' }),
    ).toBe('On since Dec 1, 2026, turned on by Pat Owner (owner)');
    expect(
      formatStateOn(AI_CONSENT_COPY.service_improvement.es, { date: '1 dic 2026', name: 'Pat Owner', role: 'dueño' }),
    ).toBe('Activado desde el 1 dic 2026; lo activó Pat Owner (dueño)');
  });
});

describe('validateAiConsentEvent', () => {
  const ok = (over: Partial<AiConsentEvent> = {}): AiConsentEvent => ({
    kind: 'service_improvement',
    action: 'opt_in',
    source: 'settings',
    actorUserId: 'user-1',
    actorName: 'Pat Owner',
    actorEmail: 'owner@example.test',
    actorRole: 'owner',
    authorityAttested: true,
    wordingVersion: AI_CONSENT_WORDING_VERSIONS.service_improvement,
    wordingSha256: wordingSha256('service_improvement', 'en'),
    lang: 'en',
    ...over,
  });
  const codes = (e: AiConsentEvent): string[] => validateAiConsentEvent(e).map((p) => p.code);

  it('accepts an owner opt-in from Settings with the box ticked and current wording', () => {
    expect(validateAiConsentEvent(ok())).toEqual([]);
  });

  it('accepts the Spanish wording with the Spanish hash', () => {
    expect(codes(ok({ lang: 'es', wordingSha256: wordingSha256('service_improvement', 'es') }))).toEqual([]);
  });

  it('refuses a non-owner', () => {
    expect(codes(ok({ actorRole: 'manager' }))).toEqual(['NOT_OWNER']);
  });

  it('refuses an unticked attestation', () => {
    expect(codes(ok({ authorityAttested: false }))).toEqual(['NOT_ATTESTED']);
  });

  it('refuses own-records training (not offered yet)', () => {
    expect(
      codes(
        ok({
          kind: 'own_records_training',
          wordingVersion: AI_CONSENT_WORDING_VERSIONS.own_records_training,
          wordingSha256: wordingSha256('own_records_training', 'en'),
        }),
      ),
    ).toEqual(['NOT_OFFERED']);
  });

  it('refuses staff opting a business in by email', () => {
    expect(codes(ok({ source: 'email_request', actorUserId: null, recordedByUserId: 'staff-1' }))).toEqual([
      'STAFF_CANNOT_OPT_IN',
    ]);
  });

  it('accepts an emailed withdrawal recorded by staff; refuses it without a recorder', () => {
    const w = ok({ action: 'withdraw', source: 'email_request', actorUserId: null, authorityAttested: false, recordedByUserId: 'staff-1', requestRef: 'msg-1' });
    expect(codes(w)).toEqual([]);
    expect(codes({ ...w, recordedByUserId: null })).toEqual(['MISSING_RECORDER']);
  });

  it('accepts an owner withdrawal from Settings; refuses a non-owner withdrawal from Settings', () => {
    const w = ok({ action: 'withdraw', authorityAttested: false });
    expect(codes(w)).toEqual([]);
    expect(codes({ ...w, actorRole: 'manager' })).toEqual(['NOT_OWNER']);
  });

  it('refuses a stale version and a mismatched hash', () => {
    expect(codes(ok({ wordingVersion: '2026-01-01.1' }))).toEqual(['STALE_WORDING_VERSION']);
    expect(codes(ok({ wordingSha256: wordingSha256('service_improvement', 'es') }))).toEqual(['WORDING_HASH_MISMATCH']);
  });

  it('refuses a missing actor once, not twice', () => {
    expect(codes(ok({ actorUserId: '', actorName: ' ' }))).toEqual(['MISSING_ACTOR']);
  });

  it('refuses unknown enum values without throwing', () => {
    const bad = { ...ok(), kind: 'everything', lang: 'fr' } as unknown as AiConsentEvent;
    expect(codes(bad)).toEqual(['UNKNOWN_KIND', 'UNKNOWN_LANG']);
  });

  it('every problem has a plain-words message for the red banner', () => {
    const all = validateAiConsentEvent(
      ok({ actorRole: 'manager', authorityAttested: false, wordingVersion: 'old' }),
    );
    expect(all.length).toBe(3);
    for (const p of all) expect(p.message.length).toBeGreaterThan(10);
  });
});
