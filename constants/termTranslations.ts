// ─── جدول ترجمة المصطلحات اللغوية (الأصل/النوع/الجنس/أصناف الكلمات) ─────────
// المصدر: القيم الفعلية الموجودة في شيت القاموس (dictionary.kind / .origin / .gender).
// المفتاح = الرمز بعد التطبيع (أحرف صغيرة + مسافات مفرودة).
// القيمة = الترجمة لكل لغة واجهة مدعومة.
import type { Lang } from "@/contexts/LanguageContext";

export const TERM_TRANSLATIONS: Record<string, Record<Lang, string>> = {
    // ── الأصل (origins) ──
    "قبطي": { ar: "قبطي", en: "Coptic", fr: "Copte", de: "Koptisch" },
    "coptic": { ar: "قبطي", en: "Coptic", fr: "Copte", de: "Koptisch" },
    "يوناني": { ar: "يوناني", en: "Greek", fr: "Grec", de: "Griechisch" },
    "greek": { ar: "يوناني", en: "Greek", fr: "Grec", de: "Griechisch" },
    "عبري": { ar: "عبري", en: "Hebrew", fr: "Hébreu", de: "Hebräisch" },
    "hebrew": { ar: "عبري", en: "Hebrew", fr: "Hébreu", de: "Hebräisch" },
    "لاتيني": { ar: "لاتيني", en: "Latin", fr: "Latin", de: "Lateinisch" },
    "latin": { ar: "لاتيني", en: "Latin", fr: "Latin", de: "Lateinisch" },
    "آرامي": { ar: "آرامي", en: "Aramaic", fr: "Araméen", de: "Aramäisch" },
    "aramaic": { ar: "آرامي", en: "Aramaic", fr: "Araméen", de: "Aramäisch" },
    "سرياني": { ar: "سرياني", en: "Syriac", fr: "Syriaque", de: "Syrisch" },
    "syriac": { ar: "سرياني", en: "Syriac", fr: "Syriaque", de: "Syrisch" },
    "مصري": { ar: "مصري", en: "Egyptian", fr: "Égyptien", de: "Ägyptisch" },
    "egyptian": { ar: "مصري", en: "Egyptian", fr: "Égyptien", de: "Ägyptisch" },

    // ── الجنس (gender) ──
    "مذكر": { ar: "مذكر", en: "Masculine", fr: "Masculin", de: "Maskulin" },
    "masculine": { ar: "مذكر", en: "Masculine", fr: "Masculin", de: "Maskulin" },
    "مؤنث": { ar: "مؤنث", en: "Feminine", fr: "Féminin", de: "Feminin" },
    "feminine": { ar: "مؤنث", en: "Feminine", fr: "Féminin", de: "Feminin" },
    "مذكر - مؤنث": { ar: "مذكر ومؤنث", en: "Masculine & Feminine", fr: "Masculin & Féminin", de: "Maskulin & Feminin" },
    "مذكر ومؤنث": { ar: "مذكر ومؤنث", en: "Masculine & Feminine", fr: "Masculin & Féminin", de: "Maskulin & Feminin" },

    // ── اسم (nouns) ──
    "اسم": { ar: "اسم", en: "Noun", fr: "Nom", de: "Nomen" },
    "noun": { ar: "اسم", en: "Noun", fr: "Nom", de: "Nomen" },
    "اسم مذكر": { ar: "اسم مذكر", en: "Masculine noun", fr: "Nom masculin", de: "Maskulines Nomen" },
    "اسم مؤنث": { ar: "اسم مؤنث", en: "Feminine noun", fr: "Nom féminin", de: "Weibliches Nomen" },
    "اسم جمع": { ar: "اسم جمع", en: "Plural noun", fr: "Nom pluriel", de: "Pluralnomen" },
    "اسم مذكر ومؤنث": { ar: "اسم مذكر ومؤنث", en: "Masculine & feminine noun", fr: "Nom masculin & féminin", de: "Maskulines & weibliches Nomen" },
    "اسم مذكر وجمع": { ar: "اسم مذكر وجمع", en: "Masculine & plural noun", fr: "Nom masculin & pluriel", de: "Maskulines & Pluralnomen" },
    "اسم مؤنث وجمع": { ar: "اسم مؤنث وجمع", en: "Feminine & plural noun", fr: "Nom féminin & pluriel", de: "Weibliches & Pluralnomen" },
    "اسم جمع ومذكر": { ar: "اسم جمع ومذكر", en: "Plural & masculine noun", fr: "Nom pluriel & masculin", de: "Plural- & Maskulinnomen" },
    "اسم أشارة": { ar: "اسم إشارة", en: "Demonstrative noun", fr: "Nom démonstratif", de: "Demonstrativnomen" },
    "اسم إشارة": { ar: "اسم إشارة", en: "Demonstrative noun", fr: "Nom démonstratif", de: "Demonstrativnomen" },
    "اسم إشارة مذكر": { ar: "اسم إشارة مذكر", en: "Masculine demonstrative noun", fr: "Nom démonstratif masculin", de: "Maskulines Demonstrativnomen" },
    "اسم إشارة مؤنث": { ar: "اسم إشارة مؤنث", en: "Feminine demonstrative noun", fr: "Nom démonstratif féminin", de: "Weibliches Demonstrativnomen" },
    "اسم إشارة جمع": { ar: "اسم إشارة جمع", en: "Plural demonstrative noun", fr: "Nom démonstratif pluriel", de: "Plural-Demonstrativnomen" },
    "اسم أشارة مذكر": { ar: "اسم إشارة مذكر", en: "Masculine demonstrative noun", fr: "Nom démonstratif masculin", de: "Maskulines Demonstrativnomen" },
    "اسم أشارة مؤنث": { ar: "اسم إشارة مؤنث", en: "Feminine demonstrative noun", fr: "Nom démonstratif féminin", de: "Weibliches Demonstrativnomen" },
    "اسم موصول": { ar: "اسم موصول", en: "Relative noun", fr: "Nom relatif", de: "Relativnomen" },

    // ── فعل (verbs) ──
    "فعل": { ar: "فعل", en: "Verb", fr: "Verbe", de: "Verb" },
    "verb": { ar: "فعل", en: "Verb", fr: "Verbe", de: "Verb" },
    "فعل أمر": { ar: "فعل أمر", en: "Imperative verb", fr: "Verbe impératif", de: "Imperativ" },
    "فعل مذكر": { ar: "فعل مذكر", en: "Masculine verb", fr: "Verbe masculin", de: "Maskulines Verb" },
    "فعل مؤنث": { ar: "فعل مؤنث", en: "Feminine verb", fr: "Verbe féminin", de: "Weibliches Verb" },
    "فعل مذكر ومؤنث": { ar: "فعل مذكر ومؤنث", en: "Masculine & feminine verb", fr: "Verbe masculin & féminin", de: "Maskulines & weibliches Verb" },
    "فعل جمع": { ar: "فعل جمع", en: "Plural verb", fr: "Verbe pluriel", de: "Pluralverb" },
    "فعل منعكس": { ar: "فعل منعكس", en: "Reflexive verb", fr: "Verbe réfléchi", de: "Reflexives Verb" },

    // ── صفة (adjectives) ──
    "صفة": { ar: "صفة", en: "Adjective", fr: "Adjectif", de: "Adjektiv" },
    "adjective": { ar: "صفة", en: "Adjective", fr: "Adjectif", de: "Adjektiv" },
    "صفة مذكر": { ar: "صفة مذكر", en: "Masculine adjective", fr: "Adjectif masculin", de: "Maskulines Adjektiv" },
    "صفة مؤنث": { ar: "صفة مؤنث", en: "Feminine adjective", fr: "Adjectif féminin", de: "Weibliches Adjektiv" },
    "صفة جمع": { ar: "صفة جمع", en: "Plural adjective", fr: "Adjectif pluriel", de: "Pluraladjektiv" },

    // ── ظرف (adverbs) ──
    "ظرف": { ar: "ظرف", en: "Adverb", fr: "Adverbe", de: "Adverb" },
    "adverb": { ar: "ظرف", en: "Adverb", fr: "Adverbe", de: "Adverb" },
    "adv.": { ar: "ظرف", en: "Adverb", fr: "Adverbe", de: "Adverb" },

    // ── ضمير (pronouns) ──
    "ضمير": { ar: "ضمير", en: "Pronoun", fr: "Pronom", de: "Pronomen" },
    "pronoun": { ar: "ضمير", en: "Pronoun", fr: "Pronom", de: "Pronomen" },
    "ضمير ملكية": { ar: "ضمير ملكية", en: "Possessive pronoun", fr: "Pronom possessif", de: "Possessivpronomen" },
    "ضمير ملكية مذكر": { ar: "ضمير ملكية مذكر", en: "Masculine possessive pronoun", fr: "Pronom possessif masculin", de: "Maskulines Possessivpronomen" },
    "ضمير ملكية مؤنث": { ar: "ضمير ملكية مؤنث", en: "Feminine possessive pronoun", fr: "Pronom possessif féminin", de: "Weibliches Possessivpronomen" },
    "ضمير وصل": { ar: "ضمير وصل", en: "Relative pronoun", fr: "Pronom relatif", de: "Relativpronomen" },
    "ضمير وصل مذكر": { ar: "ضمير وصل مذكر", en: "Masculine relative pronoun", fr: "Pronom relatif masculin", de: "Maskulines Relativpronomen" },
    "ضمير جمع": { ar: "ضمير جمع", en: "Plural pronoun", fr: "Pronom pluriel", de: "Pluralpronomen" },
    "ضمير مذكر": { ar: "ضمير مذكر", en: "Masculine pronoun", fr: "Pronom masculin", de: "Maskulines Pronomen" },
    "ضمير إشارة": { ar: "ضمير إشارة", en: "Demonstrative pronoun", fr: "Pronom démonstratif", de: "Demonstrativpronomen" },

    // ── أداة (particles) ──
    "أداة": { ar: "أداة", en: "Particle", fr: "Particule", de: "Partikel" },
    "particle": { ar: "أداة", en: "Particle", fr: "Particule", de: "Partikel" },
    "أداة ربط": { ar: "أداة ربط", en: "Linking particle", fr: "Particule de liaison", de: "Bindewort" },
    "أداة استفهام": { ar: "أداة استفهام", en: "Interrogative particle", fr: "Particule interrogative", de: "Fragewort" },
    "أداة أستفهام": { ar: "أداة استفهام", en: "Interrogative particle", fr: "Particule interrogative", de: "Fragewort" },
    "أداة نفي": { ar: "أداة نفي", en: "Negative particle", fr: "Particule de négation", de: "Negationspartikel" },
    "أداة ملكية": { ar: "أداة ملكية", en: "Possessive particle", fr: "Particule de possession", de: "Possessivpartikel" },
    "أداة ملكية مذكر": { ar: "أداة ملكية مذكر", en: "Masculine possessive particle", fr: "Particule de possession masculine", de: "Maskuline Possessivpartikel" },
    "أداة ملكية مؤنث": { ar: "أداة ملكية مؤنث", en: "Feminine possessive particle", fr: "Particule de possession féminine", de: "Weibliche Possessivpartikel" },
    "أداة تأكيد": { ar: "أداة تأكيد", en: "Emphatic particle", fr: "Particule d'emphase", de: "Betonungspartikel" },
    "أداة تعجب": { ar: "أداة تعجب", en: "Exclamatory particle", fr: "Particule exclamative", de: "Ausrufepartikel" },
    "أداة تعريف": { ar: "أداة تعريف", en: "Definite article", fr: "Article défini", de: "Bestimmter Artikel" },
    "أداة تعريف مذكر": { ar: "أداة تعريف مذكر", en: "Masculine definite article", fr: "Article défini masculin", de: "Maskuliner bestimmter Artikel" },
    "أداة تعريف مؤنث": { ar: "أداة تعريف مؤنث", en: "Feminine definite article", fr: "Article défini féminin", de: "Weiblicher bestimmter Artikel" },
    "أداة تعريف جمع": { ar: "أداة تعريف جمع", en: "Plural definite article", fr: "Article défini pluriel", de: "Pluralbestimmter Artikel" },
    "أداة تنكير": { ar: "أداة تنكير", en: "Indefinite article", fr: "Article indéfini", de: "Unbestimmter Artikel" },
    "أداة تنكير مذكر": { ar: "أداة تنكير مذكر", en: "Masculine indefinite article", fr: "Article indéfini masculin", de: "Maskuliner unbestimmter Artikel" },
    "أداة شرط": { ar: "أداة شرط", en: "Conditional particle", fr: "Particule conditionnelle", de: "Konditionalpartikel" },
    "أداة عطف": { ar: "أداة عطف", en: "Conjunction", fr: "Conjonction", de: "Konjunktion" },
    "أداة نداء": { ar: "أداة نداء", en: "Vocative particle", fr: "Particule vocative", de: "Anrufepartikel" },
    "أداة وصل": { ar: "أداة وصل", en: "Connective particle", fr: "Particule de liaison", de: "Verbindungspartikel" },
    "أداة إشارة": { ar: "أداة إشارة", en: "Demonstrative particle", fr: "Particule démonstrative", de: "Demonstrativpartikel" },
    "أداة أشارة": { ar: "أداة إشارة", en: "Demonstrative particle", fr: "Particule démonstrative", de: "Demonstrativpartikel" },
    "أداة أشارة مؤنث": { ar: "أداة إشارة مؤنث", en: "Feminine demonstrative particle", fr: "Particule démonstrative féminine", de: "Weibliche Demonstrativpartikel" },
    "أداة مؤنث": { ar: "أداة مؤنث", en: "Feminine particle", fr: "Particule féminine", de: "Weibliche Partikel" },
    "أداة مفعول": { ar: "أداة مفعول", en: "Object particle", fr: "Particule d'objet", de: "Objektpartikel" },
    "أداة مقارنة": { ar: "أداة مقارنة", en: "Comparative particle", fr: "Particule comparative", de: "Komparativpartikel" },
    "أداة جمع": { ar: "أداة جمع", en: "Plural particle", fr: "Particule de pluriel", de: "Pluralpartikel" },
    "أداة تمني": { ar: "أداة تمني", en: "Optative particle", fr: "Particule optative", de: "Optativpartikel" },
    "أداة تنبيه": { ar: "أداة تنبيه", en: "Attention particle", fr: "Particule d'attention", de: "Aufmerksamkeitspartikel" },

    // ── حرف (letters) ──
    "حرف": { ar: "حرف", en: "Letter", fr: "Lettre", de: "Buchstabe" },
    "حرف جر": { ar: "حرف جر", en: "Preposition", fr: "Préposition", de: "Präposition" },
    "preposition": { ar: "حرف جر", en: "Preposition", fr: "Préposition", de: "Präposition" },
    "حرف عطف": { ar: "حرف عطف", en: "Conjunction", fr: "Conjonction", de: "Konjunktion" },
    "conjunction": { ar: "حرف عطف", en: "Conjunction", fr: "Conjonction", de: "Konjunktion" },
    "حرف مذكر": { ar: "حرف مذكر", en: "Masculine letter", fr: "Lettre masculine", de: "Maskuliner Buchstabe" },
    "حرف مؤنث": { ar: "حرف مؤنث", en: "Feminine letter", fr: "Lettre féminine", de: "Weiblicher Buchstabe" },

    // ── أرقام (numbers) ──
    "رقم": { ar: "رقم", en: "Number", fr: "Nombre", de: "Zahl" },
    "رقم مذكر": { ar: "رقم مذكر", en: "Masculine number", fr: "Nombre masculin", de: "Maskuline Zahl" },
    "عدد": { ar: "عدد", en: "Numeral", fr: "Numéral", de: "Numerale" },

    // ── صيغ (forms) ──
    "صيغة مركبة": { ar: "صيغة مركبة", en: "Compound form", fr: "Forme composée", de: "Zusammengesetzte Form" },
    "صيغة تفضيل": { ar: "صيغة تفضيل", en: "Superlative form", fr: "Forme de supériorité", de: "Superlativform" },
    "صيغة ضميرية": { ar: "صيغة ضميرية", en: "Pronominal form", fr: "Forme pronominale", de: "Pronominale Form" },
    "صيغة وصفية - حال": { ar: "صيغة وصفية - حال", en: "Descriptive form - state", fr: "Forme descriptive - état", de: "Beschreibende Form - Zustand" },
    "صيغة ضميرية يأتي بعدها ضمير مفعول": { ar: "صيغة ضميرية يأتي بعدها ضمير مفعول", en: "Pronominal form followed by object pronoun", fr: "Forme pronominale suivie du pronom objet", de: "Pronominale Form mit Objektpronomen" },
    "صيغة للفعل يأتي بعدها المفعول مباشرة بدون أداة مفعول": { ar: "صيغة للفعل يأتي بعدها المفعول مباشرة بدون أداة مفعول", en: "Verb form followed directly by object without object particle", fr: "Forme verbale suivie directement de l'objet sans particule", de: "Verbform mit direkt folgendem Objekt ohne Partikel" },
    "صيغة مصدرية للفعل يأتي بعدها أداة المفعول ثم المفعول": { ar: "صيغة مصدرية للفعل يأتي بعدها أداة المفعول ثم المفعول", en: "Infinitive form followed by object particle then object", fr: "Forme infinitive suivie de la particule d'objet puis de l'objet", de: "Infinitivform mit Objektpartikel und Objekt" },
    "يأتي بعدها ضمير": { ar: "يأتي بعدها ضمير", en: "Followed by a pronoun", fr: "Suivie d'un pronom", de: "Gefolgt von einem Pronomen" },
    "يأتي قبلها الضمير": { ar: "يأتي قبلها الضمير", en: "Preceded by the pronoun", fr: "Précédée du pronom", de: "Vorangestelltes Pronomen" },
    "مؤنث صيغة للفعل يأتي بعدها المفعول مباشرة بدون أداة مفعول": { ar: "مؤنث صيغة للفعل يأتي بعدها المفعول مباشرة بدون أداة مفعول", en: "Feminine verb form followed directly by object", fr: "Forme verbale féminine suivie directement de l'objet", de: "Weibliche Verbform mit direkt folgendem Objekt" },

    // ── علامات (markers) ──
    "علامة المصدر": { ar: "علامة المصدر", en: "Infinitive marker", fr: "Marque d'infinitif", de: "Infinitivmarker" },
    "علامة الماضي": { ar: "علامة الماضي", en: "Past marker", fr: "Marque du passé", de: "Vergangenheitsmarker" },
    "علامة المفعول": { ar: "علامة المفعول", en: "Object marker", fr: "Marque d'objet", de: "Objektmarker" },
    "علامة المضاف إليه": { ar: "علامة المضاف إليه", en: "Genitive marker", fr: "Marque du génitif", de: "Genitivmarker" },
    "علامة الحال": { ar: "علامة الحال", en: "Adverbial marker", fr: "Marque d'adverbial", de: "Adverbialmarker" },
    "علامة اسم الفاعل": { ar: "علامة اسم الفاعل", en: "Active participle marker", fr: "Marque du participe actif", de: "Aktivpartizipmarker" },
    "علامة زمن المستقبل": { ar: "علامة زمن المستقبل", en: "Future marker", fr: "Marque du futur", de: "Zukunftsmarker" },

    // ── بادئات/لاحقات (prefixes/suffixes) ──
    "بادئة": { ar: "بادئة", en: "Prefix", fr: "Préfixe", de: "Präfix" },
    "بادئة prefix": { ar: "بادئة", en: "Prefix", fr: "Préfixe", de: "Präfix" },
    "prefix بادئة": { ar: "بادئة", en: "Prefix", fr: "Préfixe", de: "Präfix" },
    "prefix": { ar: "بادئة", en: "Prefix", fr: "Préfixe", de: "Präfix" },
    "زائدة": { ar: "زائدة", en: "Suffix", fr: "Suffixe", de: "Suffix" },
    "زائدة prefix": { ar: "زائدة", en: "Suffix", fr: "Suffixe", de: "Suffix" },
    "prefix زائدة": { ar: "زائدة", en: "Suffix", fr: "Suffixe", de: "Suffix" },
    "suffix": { ar: "لاحقة", en: "Suffix", fr: "Suffixe", de: "Suffix" },
    "لاحقة": { ar: "لاحقة", en: "Suffix", fr: "Suffixe", de: "Suffix" },
    "suffix لاحقة": { ar: "لاحقة", en: "Suffix", fr: "Suffixe", de: "Suffix" },

    // ── misc ──
    "جملة": { ar: "جملة", en: "Sentence", fr: "Phrase", de: "Satz" },
    "حال": { ar: "حال", en: "State", fr: "État", de: "Zustand" },
    "توكيد": { ar: "توكيد", en: "Emphasis", fr: "Emphase", de: "Betonung" },
    "جمع": { ar: "جمع", en: "Plural", fr: "Pluriel", de: "Plural" },
    "الحرف الثلاثون من الابجدية القبطية": { ar: "الحرف الثلاثون من الأبجدية القبطية", en: "The thirtieth letter of the Coptic alphabet", fr: "La trentième lettre de l'alphabet copte", de: "Der dreißigste Buchstabe des koptischen Alphabets" },
};
