import { describe, expect, it } from 'vitest';
import {
  AI_CONSENT_KINDS,
  AI_CONSENT_WORDING_VERSIONS,
  CONSENT_LANGS,
  renderAiConsentWording,
  sha256Hex,
  type AiConsentKind,
  type ConsentLang,
} from '../ai-improvement.js';
import { GMAIL_DISCLOSURE_VERSION, renderGmailDisclosure } from '../gmail-disclosure.js';

/**
 * INDEPENDENT WORDING BASELINE.
 *
 * Every version this package has defined, with the full canonical text
 * written out as a literal (not built from the wording constants) and the
 * SHA-256 of that literal. It was generated once from the source at each
 * version (2026-11-22.1 from PR #8 head 6f70a79, 2026-11-22.2 from the
 * review repair) and cross-checked with node:crypto.
 *
 * What this catches that the pin tests in the other files cannot: changing a
 * word in ai-improvement.ts or gmail-disclosure.ts AND its pin together. The
 * current text must still equal the literal below for the current version,
 * so that edit fails here.
 *
 * Rules: never edit an existing entry. A wording change means a new version
 * in the source and a NEW entry here (text + hash), appended last.
 */
type Entry = Record<ConsentLang, { text: string; sha256: string }>;

const AI_BASELINE: Record<AiConsentKind, Record<string, Entry>> = {
  service_improvement: {
    "2026-11-22.1": {
      en: {
        text: "lang:en\nkind:service_improvement\nAI improvement program\nOff unless you turn it on. If you turn it on, we use only your work steps (what was done, in what order, and how long it took), with names, contact details, prices and message text taken out, to improve and train mpowerio's own models and services, on mpowerio's own hardware. Nothing from before you turn it on is used. It never includes your customer content, call recordings or transcripts, or anything from a connected Gmail account or Google Drive, including summaries or fields our software makes from it. It is never sold, never shared with other clients or anyone else, and never used for advertising. If you turn it on, you are responsible for telling the people who work for you that their work steps, with names removed, are used this way. You can turn it off at any time; we then delete the service-improvement data we hold from your system. Choosing not to take part never changes your price or service.\nRead the details <https://mpowerio.ai/privacy#ai-improvement-program>\nI'm authorized to accept agreements for this business.\nTurn on\nTurn off\nTurning off deletes the service-improvement data we hold from your system.",
        sha256: "dad3621d1d421dba553ec4523ce53dfa820914deb65d6be573c86a6d5980d9c4",
      },
      es: {
        text: "lang:es\nkind:service_improvement\nPrograma de mejora de IA\nEstá desactivado a menos que tú lo actives. Si lo activas, usamos solo los pasos de trabajo de tu negocio (qué se hizo, en qué orden y cuánto tiempo tomó), sin nombres, datos de contacto, precios ni texto de mensajes, para mejorar y entrenar los modelos y servicios propios de mpowerio, en equipos de mpowerio. No se usa nada de antes de que lo actives. Nunca incluye el contenido de tus clientes, grabaciones ni transcripciones de llamadas, ni nada de una cuenta de Gmail o de Google Drive conectada, incluidos los resúmenes o campos que nuestro software crea a partir de ellos. Nunca se vende, nunca se comparte con otros clientes ni con nadie más, y nunca se usa para publicidad. Si lo activas, te corresponde avisar a las personas que trabajan para ti que sus pasos de trabajo, sin nombres, se usan de esta forma. Puedes desactivarlo cuando quieras; entonces borramos los datos de mejora del servicio que tenemos de tu sistema. Decidir no participar nunca cambia tu precio ni tu servicio.\nLee los detalles <https://mpowerio.ai/privacy#ai-improvement-program>\nTengo autorización para aceptar acuerdos en nombre de este negocio.\nActivar\nDesactivar\nAl desactivarlo, borramos los datos de mejora del servicio que tenemos de tu sistema.",
        sha256: "0e8656cf6ac66406b157fbe04559047e954a8ca64c083af2a4d6208c6557cf81",
      },
    },
    "2026-11-22.2": {
      en: {
        text: "lang:en\nkind:service_improvement\nAI improvement program\nOff unless you turn it on. If you turn it on, we use only your work steps (what was done, in what order, and how long it took), with names, email addresses, phone numbers, street addresses, prices and other dollar amounts, and any message or note text taken out, to improve and train mpowerio's own models and services, which we use for all our clients, on hardware mpowerio owns and controls. Nothing from before you turn it on is used. It never includes your customer content, call recordings or transcripts, or anything from a connected Gmail account or Google Drive, including summaries or fields our software makes from it. It is never sold, never shared with other clients or anyone else, never used for advertising, and never used to identify a person. If you turn it on, you are responsible for telling the people who work for you that their work steps, with names removed, are used this way. You can turn it off at any time, here or by emailing us. We then stop adding your activity and delete the service-improvement data we hold from your system. Models trained before you turned it off are not retrained right away, but your data is not used in any training after you turn it off, and those older models are replaced as we retrain on our normal schedule. You can also ask to see what is used, or ask us to delete it without turning it off. Choosing not to take part never changes your price or service.\nRead the details <https://mpowerio.ai/privacy#service-improvement>\nI'm authorized to accept agreements for this business.\nTurn on\nTurn off\nTurning off deletes the service-improvement data we hold from your system. Models trained before then are replaced as we retrain on our normal schedule.",
        sha256: "a17b2305dccdcd09e38b38ef9f334dafe89db4c192e1e4e1e8b46bdff4b41213",
      },
      es: {
        text: "lang:es\nkind:service_improvement\nPrograma de mejora de IA\nEstá desactivado a menos que tú lo actives. Si lo activas, usamos solo los pasos de trabajo de tu negocio (qué se hizo, en qué orden y cuánto tiempo tomó), sin nombres, direcciones de correo electrónico, números de teléfono, direcciones postales, precios ni otras cantidades de dinero, ni texto de mensajes o notas, para mejorar y entrenar los modelos y servicios propios de mpowerio, que usamos con todos nuestros clientes, en equipos que son propiedad de mpowerio y que mpowerio controla. No se usa nada de antes de que lo actives. Nunca incluye el contenido de tus clientes, grabaciones ni transcripciones de llamadas, ni nada de una cuenta de Gmail o de Google Drive conectada, incluidos los resúmenes o campos que nuestro software crea a partir de ellos. Nunca se vende, nunca se comparte con otros clientes ni con nadie más, nunca se usa para publicidad y nunca se usa para identificar a una persona. Si lo activas, te corresponde avisar a las personas que trabajan para ti que sus pasos de trabajo, sin nombres, se usan de esta forma. Puedes desactivarlo cuando quieras, aquí o escribiéndonos por correo. Entonces dejamos de agregar tu actividad y borramos los datos de mejora del servicio que tenemos de tu sistema. Los modelos entrenados antes de que lo desactives no se vuelven a entrenar de inmediato, pero tus datos no se usan en ningún entrenamiento después de que lo desactives, y esos modelos anteriores se reemplazan cuando volvemos a entrenar según nuestro calendario normal. También puedes pedirnos ver qué se usa, o pedirnos que lo borremos sin desactivarlo. Decidir no participar nunca cambia tu precio ni tu servicio.\nLee los detalles <https://mpowerio.ai/privacy#service-improvement>\nTengo autorización para aceptar acuerdos en nombre de este negocio.\nActivar\nDesactivar\nAl desactivarlo, borramos los datos de mejora del servicio que tenemos de tu sistema. Los modelos entrenados antes se reemplazan cuando volvemos a entrenar según nuestro calendario normal.",
        sha256: "72bd5a39fda9ad5d15be01313d2fb58b5d9228a1962b2fa5fb8f53b3df2bc603",
      },
    },
  },
  own_records_training: {
    "2026-11-22.1": {
      en: {
        text: "lang:en\nkind:own_records_training\nTraining on your own records\nNot offered yet\nOff unless you turn it on. If you turn it on, mpowerio may use your business's own records to train a model. Names, email addresses, phone numbers, street addresses and all free text (notes, descriptions and message text) are always left out, and nothing from call recordings, transcripts, a connected Gmail account or Google Drive, including summaries or fields our software makes from it, is ever used. This is separate from the AI improvement program.\nRead the details <https://mpowerio.ai/privacy#ai-improvement-program>\nI'm authorized to accept agreements for this business.\nTurn on\nTurn off\nTurning off stops this use from then on.",
        sha256: "b89b675d2af49f478342a6ca8c5a8c5ebedbe9b22e1bca68c2a7640eb46d6c13",
      },
      es: {
        text: "lang:es\nkind:own_records_training\nEntrenamiento con tus propios registros\nTodavía no se ofrece\nEstá desactivado a menos que tú lo actives. Si lo activas, mpowerio puede usar los registros propios de tu negocio para entrenar un modelo. Siempre se dejan fuera los nombres, correos electrónicos, números de teléfono, direcciones postales y todo el texto libre (notas, descripciones y texto de mensajes), y nunca se usa nada de grabaciones o transcripciones de llamadas, ni de una cuenta de Gmail o de Google Drive conectada, incluidos los resúmenes o campos que nuestro software crea a partir de ellos. Esto es aparte del programa de mejora de IA.\nLee los detalles <https://mpowerio.ai/privacy#ai-improvement-program>\nTengo autorización para aceptar acuerdos en nombre de este negocio.\nActivar\nDesactivar\nAl desactivarlo, este uso se detiene desde ese momento.",
        sha256: "3af1aff2981c31efa5a168d4d2a6decdd474571dcff71002c8a947f60544ba92",
      },
    },
    "2026-11-22.2": {
      en: {
        text: "lang:en\nkind:own_records_training\nTraining on your own records\nNot offered yet\nOff unless you turn it on. If you turn it on, mpowerio may use your business's own records to train a model. Names, email addresses, phone numbers, street addresses and all free text (notes, descriptions and message text) are always left out, and nothing from call recordings, transcripts, a connected Gmail account or Google Drive, including summaries or fields our software makes from it, is ever used. This is separate from the AI improvement program.\nRead the details <https://mpowerio.ai/privacy#service-improvement>\nI'm authorized to accept agreements for this business.\nTurn on\nTurn off\nTurning off stops this use from then on.",
        sha256: "9a13feb4707e771b02601158b208b56405df6569474c6c05017c48c4e64a27a2",
      },
      es: {
        text: "lang:es\nkind:own_records_training\nEntrenamiento con tus propios registros\nTodavía no se ofrece\nEstá desactivado a menos que tú lo actives. Si lo activas, mpowerio puede usar los registros propios de tu negocio para entrenar un modelo. Siempre se dejan fuera los nombres, direcciones de correo electrónico, números de teléfono, direcciones postales y todo el texto libre (notas, descripciones y texto de mensajes), y nunca se usa nada de grabaciones o transcripciones de llamadas, ni de una cuenta de Gmail o de Google Drive conectada, incluidos los resúmenes o campos que nuestro software crea a partir de ellos. Esto es aparte del programa de mejora de IA.\nLee los detalles <https://mpowerio.ai/privacy#service-improvement>\nTengo autorización para aceptar acuerdos en nombre de este negocio.\nActivar\nDesactivar\nAl desactivarlo, este uso se detiene desde ese momento.",
        sha256: "df3e2fc62887e42b9cacb6d34e3e05fc6a85b157e3d06e440faeeb47e46162a1",
      },
    },
  },
};

const GMAIL_BASELINE: Record<string, Entry> = {
  "2026-11-22.1": {
    en: {
      text: "lang:en\nkind:gmail_disclosure\nConnecting copies messages from the last 14 days into your CRM, stored by our database and hosting providers for us. We never use them for training or ads.\nI agree\nConnect Google",
      sha256: "f7734e51e480bec7bbff2995eafa1d9157c7d0b914d741f492ac4597534d8bd4",
    },
    es: {
      text: "lang:es\nkind:gmail_disclosure\nAl conectar, se copian a tu CRM los mensajes de los últimos 14 días. Los guardan para nosotros nuestros proveedores de base de datos y de alojamiento. Nunca los usamos para entrenar modelos de IA ni para publicidad.\nAcepto\nConectar Google",
      sha256: "c906b4f448db5b89325da4b30e6f11c75f760dc2543327488f01d0a7c7bc54c0",
    },
  },
  "2026-11-22.2": {
    en: {
      text: "lang:en\nkind:gmail_disclosure\nConnecting copies messages from the last 14 days into your CRM, stored by our database and hosting providers for us. We never use them for training or ads.\nI agree\nConnect Google",
      sha256: "f7734e51e480bec7bbff2995eafa1d9157c7d0b914d741f492ac4597534d8bd4",
    },
    es: {
      text: "lang:es\nkind:gmail_disclosure\nAl conectar, se copian a tu CRM los mensajes de los últimos 14 días. Los guardan para nosotros nuestros proveedores de base de datos y de alojamiento. Nunca los usamos para entrenar modelos ni para publicidad.\nAcepto\nConectar Google",
      sha256: "86ab905cf48de0e804112b266c84c62d8d0fa0f7fe24cf94f0853e6dc9aa86b3",
    },
  },
};

/** Order versions by date, then by the number after the dot, numerically. */
function compareVersions(a: string, b: string): number {
  const [da, na] = a.split('.');
  const [db, nb] = b.split('.');
  if (da !== db) return (da ?? '') < (db ?? '') ? -1 : 1;
  return Number(na) - Number(nb);
}

function checkHistory(name: string, versions: string[]): void {
  expect(versions.length, name).toBeGreaterThan(0);
  for (const v of versions) expect(v, name).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  expect([...versions].sort(compareVersions), `${name}: entries must be in version order`).toEqual(versions);
  expect(new Set(versions).size, name).toBe(versions.length);
}

describe('independent wording baseline', () => {
  it('compareVersions orders .10 after .9', () => {
    expect(['2026-11-22.10', '2026-11-22.9', '2026-11-21.3'].sort(compareVersions)).toEqual([
      '2026-11-21.3',
      '2026-11-22.9',
      '2026-11-22.10',
    ]);
  });

  for (const kind of AI_CONSENT_KINDS) {
    it(`${kind}: history is in version order and the current version is the last entry`, () => {
      const versions = Object.keys(AI_BASELINE[kind]);
      checkHistory(kind, versions);
      expect(versions[versions.length - 1]).toBe(AI_CONSENT_WORDING_VERSIONS[kind]);
    });

    it(`${kind}: every baseline literal hashes to its recorded SHA-256`, () => {
      for (const [version, entry] of Object.entries(AI_BASELINE[kind])) {
        for (const lang of CONSENT_LANGS) {
          expect(sha256Hex(entry[lang].text), `${kind} ${version} ${lang}`).toBe(entry[lang].sha256);
        }
      }
    });

    for (const lang of CONSENT_LANGS) {
      it(`${kind}/${lang}: the current text equals the literal recorded for its version`, () => {
        const entry = AI_BASELINE[kind][AI_CONSENT_WORDING_VERSIONS[kind]];
        if (entry === undefined) {
          throw new Error(`${kind}: no baseline for ${AI_CONSENT_WORDING_VERSIONS[kind]}. Append one.`);
        }
        expect(renderAiConsentWording(kind, lang)).toBe(entry[lang].text);
      });
    }
  }

  it('gmail: history is in version order and the current version is the last entry', () => {
    const versions = Object.keys(GMAIL_BASELINE);
    checkHistory('gmail', versions);
    expect(versions[versions.length - 1]).toBe(GMAIL_DISCLOSURE_VERSION);
  });

  it('gmail: every baseline literal hashes to its recorded SHA-256', () => {
    for (const [version, entry] of Object.entries(GMAIL_BASELINE)) {
      for (const lang of CONSENT_LANGS) {
        expect(sha256Hex(entry[lang].text), `gmail ${version} ${lang}`).toBe(entry[lang].sha256);
      }
    }
  });

  for (const lang of CONSENT_LANGS) {
    it(`gmail/${lang}: the current text equals the literal recorded for its version`, () => {
      const entry = GMAIL_BASELINE[GMAIL_DISCLOSURE_VERSION];
      if (entry === undefined) throw new Error(`gmail: no baseline for ${GMAIL_DISCLOSURE_VERSION}. Append one.`);
      expect(renderGmailDisclosure(lang)).toBe(entry[lang].text);
    });
  }
});
