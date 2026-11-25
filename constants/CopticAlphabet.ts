import { Lang } from "@/contexts/LanguageContext";

export type CopticLetterCategory = "vowel" | "guttural" | "labial" | "egyptian" | "greek" | "none";

export interface CopticLetterDetails {
  char: string;
  name: Record<Lang, string>;
  sound: Record<Lang, string>;
  rule: Record<Lang, string>;
  category: CopticLetterCategory;
}

export const COPTIC_ALPHABET: CopticLetterDetails[] = [
  {
    char: "Ⲁ",
    name: { ar: "أَلْفَا", en: "Alpha", fr: "Alpha", de: "Alpha" },
    sound: { ar: "'آ'", en: "'A'", fr: "'A'", de: "'A'" },
    rule: {
      ar: "'آ' كما في كلمة (آه)",
      en: "'A' like in 'Ah'",
      fr: "'A' comme dans 'Ah'",
      de: "'A' wie in 'Ah'"
    },
    category: "vowel"
  },
  {
    char: "Ⲃ",
    name: { ar: "ڤِيتَا", en: "Veta / Beta", fr: "Veta / Beta", de: "Veta / Beta" },
    sound: { ar: "'ڤ' / 'ب'", en: "'V' / 'B'", fr: "'V' / 'B'", de: "'V' / 'B'" },
    rule: {
      ar: "'ڤ' إذا جاء بعده حرف متحرك | 'ب' فيما عدا ذلك",
      en: "'V' if followed by a vowel | 'B' otherwise",
      fr: "'V' s'il est suivi d'une voyelle | 'B' sinon",
      de: "'V', wenn ein Vokal folgt | 'B' sonst"
    },
    category: "labial"
  },
  {
    char: "Ⲅ",
    name: { ar: "غَمَّا", en: "Gamma", fr: "Gamma", de: "Gamma" },
    sound: { ar: "'ج' / 'ن' / 'غ'", en: "'G' / 'N' / 'Gh'", fr: "'G' / 'N' / 'Gh'", de: "'G' / 'N' / 'Gh'" },
    rule: {
      ar: "'ج' إذا جاء بعده حرف متحرك للكسر | 'ن' إذا جاء بعده حرف حلقي | 'غ' فيما عدا ذلك",
      en: "'G' (before e/i/y) | 'N' (before gutturals) | 'Gh' otherwise",
      fr: "'G' (devant e/i/y) | 'N' (devant gutturales) | 'Gh' sinon",
      de: "'G' (vor e/i/y) | 'N' (vor Gutturalen) | 'Gh' sonst"
    },
    category: "guttural"
  },
  {
    char: "Ⲇ",
    name: { ar: "دَلْتَا", en: "Delta", fr: "Delta", de: "Delta" },
    sound: { ar: "'د' / 'ذ'", en: "'D' / 'Dh'", fr: "'D' / 'Dh'", de: "'D' / 'Dh'" },
    rule: {
      ar: "'د' في أسماء الأعلام | 'ذ' فيما عدا ذلك",
      en: "'D' in proper names | 'Th' otherwise",
      fr: "'D' dans les noms propres | 'Th' sinon",
      de: "'D' in Eigennamen | 'Th' sonst"
    },
    category: "none"
  },
  {
    char: "Ⲉ",
    name: { ar: "إِي", en: "Ei", fr: "Ei", de: "Ei" },
    sound: { ar: "'ي'", en: "'E'", fr: "'E'", de: "'E'" },
    rule: {
      ar: "'ي' مثل الياء في 'بيت' بالعامية",
      en: "'E' like in 'Bed'",
      fr: "'E' comme dans 'Belle'",
      de: "'E' wie in 'Bett'"
    },
    category: "vowel"
  },
  {
    char: "Ⲋ",
    name: { ar: "سُو", en: "So", fr: "So", de: "So" },
    sound: { ar: "'6'", en: "'6'", fr: "'6'", de: "'6'" },
    rule: {
      ar: "يستخدم كرقم '6' فقط",
      en: "Used as the number '6' only",
      fr: "Utilisé comme le chiffre '6' uniquement",
      de: "Wird nur als Zahl '6' verwendet"
    },
    category: "none"
  },
  {
    char: "Ⲍ",
    name: { ar: "زِيتَا", en: "Zeta", fr: "Zeta", de: "Zeta" },
    sound: { ar: "'ز'", en: "'Z'", fr: "'Z'", de: "'Z'" },
    rule: {
      ar: "'ز' دائماً",
      en: "'Z' always",
      fr: "'Z' toujours",
      de: "'Z' immer"
    },
    category: "none"
  },
  {
    char: "Ⲏ",
    name: { ar: "إِيتَا", en: "Eta", fr: "Eta", de: "Eta" },
    sound: { ar: "'ي' (طويلة)", en: "'EE'", fr: "'EE'", de: "'EE'" },
    rule: {
      ar: "'ي' طويلة كما في كلمة (فيل)",
      en: "'EE' long as in 'See'",
      fr: "'EE' long comme dans 'Si'",
      de: "'EE' langes wie in 'Sie'"
    },
    category: "vowel"
  },
  {
    char: "Ⲑ",
    name: { ar: "ثِيتَا", en: "Theta", fr: "Theta", de: "Theta" },
    sound: { ar: "'ت' / 'ث'", en: "'Th'", fr: "'Th'", de: "'Th'" },
    rule: {
      ar: "'ت' إذا جاء قبله (ⲥ أو ϣ) | 'ث' فيما عدا ذلك",
      en: "'T' after S or Sh | 'Th' otherwise",
      fr: "'T' après S ou Sh | 'Th' sinon",
      de: "'T' nach S oder Sh | 'Th' sonst"
    },
    category: "none"
  },
  {
    char: "Ⲓ",
    name: { ar: "يُوطَا", en: "Iota", fr: "Iota", de: "Iota" },
    sound: { ar: "'ي' (قصيرة)", en: "'I'", fr: "'I'", de: "'I'" },
    rule: {
      ar: "'ي' قصيرة",
      en: "'I' short as in 'It'",
      fr: "'I' court comme dans 'Lit'",
      de: "'I' kurzes wie in 'Ist'"
    },
    category: "vowel"
  },
  {
    char: "ⲑ",
    name: { ar: "كَبَّا", en: "Kappa", fr: "Kappa", de: "Kappa" },
    sound: { ar: "'ك'", en: "'K'", fr: "'K'", de: "'K'" },
    rule: {
      ar: "'ك' دائماً",
      en: "'K' always",
      fr: "'K' toujours",
      de: "'K' immer"
    },
    category: "guttural"
  },
  {
    char: "Ⲗ",
    name: { ar: "لَڤْلَا", en: "Lavla", fr: "Lavla", de: "Lavla" },
    sound: { ar: "'ل'", en: "'L'", fr: "'L'", de: "'L'" },
    rule: {
      ar: "'ل' دائماً",
      en: "'L' always",
      fr: "'L' toujours",
      de: "'L' immer"
    },
    category: "none"
  },
  {
    char: "Ⲙ",
    name: { ar: "مِي", en: "Me", fr: "Me", de: "Me" },
    sound: { ar: "'م'", en: "'M'", fr: "'M'", de: "'M'" },
    rule: {
      ar: "'م' دائماً",
      en: "'M' always",
      fr: "'M' toujours",
      de: "'M' immer"
    },
    category: "labial"
  },
  {
    char: "Ⲛ",
    name: { ar: "نِي", en: "Ne", fr: "Ne", de: "Ne" },
    sound: { ar: "'ن'", en: "'N'", fr: "'N'", de: "'N'" },
    rule: {
      ar: "'ن' دائماً",
      en: "'N' always",
      fr: "'N' toujours",
      de: "'N' immer"
    },
    category: "none"
  },
  {
    char: "Ⲝ",
    name: { ar: "إِكْسِي", en: "Exi", fr: "Exi", de: "Exi" },
    sound: { ar: "'(ك + س)'", en: "'X' / 'Ks'", fr: "'X' / 'Ks'", de: "'X' / 'Ks'" },
    rule: {
      ar: "'(ك + س)' دائماً",
      en: "'X' (KS) always",
      fr: "'X' (KS) toujours",
      de: "'X' (KS) immer"
    },
    category: "none"
  },
  {
    char: "Ⲟ",
    name: { ar: "أُومِيكْرُون", en: "Omicron", fr: "Omicron", de: "Omicron" },
    sound: { ar: "'أو' (قصيرة)", en: "'O'", fr: "'O'", de: "'O'" },
    rule: {
      ar: "'أو' قصيرة",
      en: "'O' short as in 'Not'",
      fr: "'O' court comme dans 'Bol'",
      de: "'O' kurzes wie in 'Ob'"
    },
    category: "vowel"
  },
  {
    char: "Ⲡ",
    name: { ar: "پِي", en: "Pi", fr: "Pi", de: "Pi" },
    sound: { ar: "'ب'", en: "'P'", fr: "'P'", de: "'P'" },
    rule: {
      ar: "'ب' دائماً",
      en: "'P' always",
      fr: "'P' toujours",
      de: "'P' immer"
    },
    category: "labial"
  },
  {
    char: "Ⲣ",
    name: { ar: "رُو", en: "Ro", fr: "Ro", de: "Ro" },
    sound: { ar: "'ر'", en: "'R'", fr: "'R'", de: "'R'" },
    rule: {
      ar: "'ر' دائماً",
      en: "'R' always",
      fr: "'R' toujours",
      de: "'R' immer"
    },
    category: "none"
  },
  {
    char: "Ⲥ",
    name: { ar: "سِيمَا", en: "Sima", fr: "Sima", de: "Sima" },
    sound: { ar: "'س'", en: "'S'", fr: "'S'", de: "'S'" },
    rule: {
      ar: "'س' دائماً",
      en: "'S' always",
      fr: "'S' toujours",
      de: "'S' immer"
    },
    category: "none"
  },
  {
    char: "Ⲧ",
    name: { ar: "تَاف", en: "Tav", fr: "Tav", de: "Tav" },
    sound: { ar: "'ت'", en: "'T'", fr: "'T'", de: "'T'" },
    rule: {
      ar: "'ت' دائماً",
      en: "'T' always",
      fr: "'T' toujours",
      de: "'T' immer"
    },
    category: "none"
  },
  {
    char: "Ⲩ",
    name: { ar: "إِبْسِلُن", en: "Upsilon", fr: "Upsilon", de: "Upsilon" },
    sound: { ar: "'ڤ' / 'أوو' / 'ي'", en: "'V' / 'I' / 'OO'", fr: "'V' / 'I' / 'OO'", de: "'V' / 'I' / 'OO'" },
    rule: {
      ar: "'ڤ' إذا جاء قبله (Ⲁ أو Ⲉ) | 'أوو' إذا جاء قبله (Ⲟ) | 'ي' فيما عدا ذلك",
      en: "'V' if preceded by (A or E) | 'OO' if preceded by (O) | 'I' otherwise",
      fr: "'V' si précédé par (A ou E) | 'OO' si précédé par (O) | 'I' sinon",
      de: "'V' wenn (A oder E) vorangeht | 'OO' wenn (O) vorangeht | 'I' sonst"
    },
    category: "vowel"
  },
  {
    char: "Ⲫ",
    name: { ar: "فِي", en: "Phi", fr: "Phi", de: "Phi" },
    sound: { ar: "'ف'", en: "'Ph' / 'F'", fr: "'Ph' / 'F'", de: "'Ph' / 'F'" },
    rule: {
      ar: "'ف' دائماً",
      en: "'F' always",
      fr: "'F' toujours",
      de: "'F' immer"
    },
    category: "labial"
  },
  {
    char: "Ⲭ",
    name: { ar: "كِي", en: "Chi", fr: "Chi", de: "Chi" },
    sound: { ar: "'ك' / 'ش' / 'خ'", en: "'K' / 'Sh' / 'Kh'", fr: "'K' / 'Sh' / 'Kh'", de: "'K' / 'Sh' / 'Kh'" },
    rule: {
      ar: "'ك' في الكلمات القبطية | 'ش' في الكلمات اليونانية إذا جاء بعده كسر | 'خ' فيما عدا ذلك",
      en: "'K' in Coptic words | 'Sh' in Greek words if followed by a vowel | 'Kh' otherwise",
      fr: "'K' dans les mots coptes | 'Sh' dans les mots grecs si suivi d'une voyelle | 'Kh' sinon",
      de: "'K' in koptischen Wörtern | 'Sch' in griechischen Wörtern wenn ein Vokal folgt | 'Ch' sonst"
    },
    category: "guttural"
  },
  {
    char: "Ⲯ",
    name: { ar: "إِبْسِي", en: "Psi", fr: "Psi", de: "Psi" },
    sound: { ar: "'بس'", en: "'Ps'", fr: "'Ps'", de: "'Ps'" },
    rule: {
      ar: "'بس' دائماً",
      en: "'Ps' always",
      fr: "'Ps' toujours",
      de: "'Ps' immer"
    },
    category: "labial"
  },
  {
    char: "Ⲱ",
    name: { ar: "أُومِيجَا", en: "Omega", fr: "Omega", de: "Omega" },
    sound: { ar: "'أو' (طويلة)", en: "'O'", fr: "'O'", de: "'O'" },
    rule: {
      ar: "أو طويلة كما في 'خوخ'",
      en: "long 'O' as in 'Boat'",
      fr: "'O' long comme dans 'Dos'",
      de: "langes 'O' wie in 'Boot'"
    },
    category: "vowel"
  },
  {
    char: "Ϣ",
    name: { ar: "شَاي", en: "Shai", fr: "Shai", de: "Shai" },
    sound: { ar: "'ش'", en: "'Sh'", fr: "'Sh'", de: "'Sh'" },
    rule: {
      ar: "'ش' دائماً",
      en: "'Sh' always",
      fr: "'Sh' toujours",
      de: "'Sch' immer"
    },
    category: "egyptian"
  },
  {
    char: "Ϥ",
    name: { ar: "فَاي", en: "Fai", fr: "Fai", de: "Fai" },
    sound: { ar: "'ف'", en: "'F'", fr: "'F'", de: "'F'" },
    rule: {
      ar: "'ف' دائماً",
      en: "'F' always",
      fr: "'F' toujours",
      de: "'F' immer"
    },
    category: "egyptian"
  },
  {
    char: "Ϧ",
    name: { ar: "خَاي", en: "Khai", fr: "Khai", de: "Khai" },
    sound: { ar: "'خ'", en: "'Kh'", fr: "'Kh'", de: "'Kh'" },
    rule: {
      ar: "'خ' دائماً",
      en: "'Kh' always",
      fr: "'Kh' toujours",
      de: "'Ch' immer"
    },
    category: "egyptian"
  },
  {
    char: "Ϩ",
    name: { ar: "هُورِي", en: "Hori", fr: "Hori", de: "Hori" },
    sound: { ar: "'هـ'", en: "'H'", fr: "'H'", de: "'H'" },
    rule: {
      ar: "'هـ' دائماً",
      en: "'H' always",
      fr: "'H' toujours",
      de: "'H' immer"
    },
    category: "egyptian"
  },
  {
    char: "ϫ",
    name: { ar: "جَنْجَا", en: "Ganga", fr: "Ganga", de: "Ganga" },
    sound: { ar: "'ج' / 'چ'", en: "'J' / 'G'", fr: "'J' / 'G'", de: "'J' / 'G'" },
    rule: {
      ar: "'ج' إذا جاء بعده حرف متحرك للكسر | 'چ' فيما عدا ذلك",
      en: "'J' if followed by a vowel for E/I/Y | 'G' otherwise",
      fr: "'J' si suivi d'une voyelle de E/I/Y | 'G' sinon",
      de: "'J' wenn ein Vokal von E/I/Y folgt | 'G' sonst"
    },
    category: "egyptian"
  },
  {
    char: "Ϭ",
    name: { ar: "تَشِيمَا", en: "Shima", fr: "Shima", de: "Shima" },
    sound: { ar: "'تش'", en: "'Ch'", fr: "'Ch'", de: "'Ch'" },
    rule: {
      ar: "'تش' دائماً",
      en: "'Ch' always",
      fr: "'Tch' toujours",
      de: "'Tsch' immer"
    },
    category: "egyptian"
  },
  {
    char: "Ϯ",
    name: { ar: "تِي", en: "Ti", fr: "Ti", de: "Ti" },
    sound: { ar: "'تي'", en: "'Ti'", fr: "'Ti'", de: "'Ti'" },
    rule: {
      ar: "'تي' دائماً",
      en: "'Ti' always",
      fr: "'Ti' toujours",
      de: "'Ti' immer"
    },
    category: "egyptian"
  }
];
