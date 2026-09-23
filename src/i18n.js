// Player-facing text in English and Polish. The tuning panel is a developer
// tool and stays English. Language: an explicit choice (the PL/EN button,
// remembered) wins; otherwise Polish for a Polish device language, a Polish
// region (e.g. en-PL) or the Europe/Warsaw time zone; English elsewhere.

const STORE = 'sprinklePour.lang';

const STRINGS = {
  en: {
    level: 'Level',
    sandbox: 'Sandbox',
    holdToLift: 'Hold to lift',
    holdToStart: 'Hold to start',
    paused: 'Paused',
    retry: 'Retry',
    retryLevel: 'Retry level',
    nextLevel: 'Next level',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    language: 'Język: polski',
    canvas: 'Sprinkle Pour. Hold anywhere to lift the jar, release to let it tip.',
    points: '/ 100 points',
    starsOf: '{n} of 5 stars',
    titles: ['Not quite', 'Cakes decorated', 'Getting there', 'Nicely poured', 'Lovely work', 'Perfect pour!'],
    coverage: 'Coverage',
    coverageDetail: '{p} of the frosting',
    clean: 'Clean pour',
    cleanDetail: '{p} spilled',
    used: 'On the cakes',
    usedDetail: '{p} of the jar',
    bumps: 'Jar bumps',
    covered: '{p} covered',
    inJar: '{n} in jar',
    noteShort: '{name} is only {cov}% covered (needs {goal}%)',
    noteDry: 'The jar ran dry before the end',
    tipSpread: 'Pour along the whole cake: {name} is {cov}% covered',
    tipClean: 'Spill less: stop the stream before it reaches the table',
    tipUsed: "Don't hold back: {p}% of the jar is still unused",
    tipBumps: 'Keep the jar off the cakes',
    tipMore: '{n} more points for {s} stars.',
    cakes: {
      sheet: 'Sheet cake',
      round: 'Layer cake',
      cupcake: 'Cupcake',
      dome: 'Dome cake',
      bundt: 'Bundt',
      tiered: 'Tiered cake',
      donut: 'Donut',
      eclair: 'Éclair',
    },
    pieces: { bead: 'beads', rod: 'rods', heart: 'sequins', pearl: 'pearls' },
    levels: {
      0: ['Sandbox', 'Free pour with every piece type. Tune anything.'],
      1: ['Big Sheet Cake', 'Learn to pour. Lots of room.'],
      2: ['Layer Cake', 'Smaller target, same jar.'],
      3: ['One Cupcake', 'A small target passes quickly.'],
      4: ['Two Cupcakes', 'Pour, catch, pour again.'],
      5: ['Three Cupcakes', 'Not a full jar. Make it last.'],
      6: ['Mind the Gap', 'Stop the stream over the table.'],
      7: ['Big Pearls', 'Big pieces leave late and bounce.'],
      8: ['Bundt', 'The hole in the middle eats sprinkles.'],
      9: ['Conveyor', 'The cupcakes move too.'],
      10: ['Tall Tiers', 'Tip too deep and the jar hits the cake.'],
    },
  },
  pl: {
    level: 'Poziom',
    sandbox: 'Piaskownica',
    holdToLift: 'Przytrzymaj, by podnieść',
    holdToStart: 'Przytrzymaj, by zacząć',
    paused: 'Pauza',
    retry: 'Jeszcze raz',
    retryLevel: 'Zagraj ponownie',
    nextLevel: 'Następny poziom',
    soundOn: 'Dźwięk włączony',
    soundOff: 'Dźwięk wyłączony',
    language: 'Language: English',
    canvas: 'Sprinkle Pour. Przytrzymaj ekran, by podnieść słoik; puść, by go przechylić.',
    points: '/ 100 pkt',
    starsOf: '{n} z 5 gwiazdek',
    titles: ['Jeszcze nie', 'Ciasta udekorowane', 'Coraz lepiej', 'Ładnie posypane', 'Pięknie!', 'Perfekcyjnie!'],
    coverage: 'Pokrycie',
    coverageDetail: '{p} powierzchni',
    clean: 'Czyste sypanie',
    cleanDetail: 'rozsypane: {p}',
    used: 'Na ciastach',
    usedDetail: '{p} słoika',
    bumps: 'Uderzenia słoikiem',
    covered: 'pokrycie {p}',
    inJar: '{n} w słoiku',
    noteShort: '{name}: pokrycie tylko {cov}% (potrzeba {goal}%)',
    noteDry: 'Słoik opustoszał przed końcem',
    tipSpread: 'Sypnij wzdłuż całego ciasta — {name}: pokrycie {cov}%',
    tipClean: 'Mniej rozsypuj: zatrzymaj strumień, zanim trafi na stół',
    tipUsed: 'Nie żałuj posypki: {p}% słoika zostało niewykorzystane',
    tipBumps: 'Nie uderzaj słoikiem w ciasta',
    tipMore: 'Jeszcze {n} pkt do {s} gwiazdek.',
    cakes: {
      sheet: 'Ciasto z blachy',
      round: 'Tort warstwowy',
      cupcake: 'Babeczka',
      dome: 'Tort kopułka',
      bundt: 'Babka',
      tiered: 'Tort piętrowy',
      donut: 'Donut',
      eclair: 'Ekler',
    },
    // Polish counts need three forms: 1 / 2–4 (not 12–14) / 5+.
    pieces: {
      bead: ['kuleczka', 'kuleczki', 'kuleczek'],
      rod: ['pałeczka', 'pałeczki', 'pałeczek'],
      heart: ['cekin', 'cekiny', 'cekinów'],
      pearl: ['perła', 'perły', 'pereł'],
    },
    levels: {
      0: ['Piaskownica', 'Swobodne sypanie wszystkimi rodzajami posypki.'],
      1: ['Wielkie ciasto z blachy', 'Naucz się sypać. Dużo miejsca.'],
      2: ['Tort warstwowy', 'Mniejszy cel, ten sam słoik.'],
      3: ['Jedna babeczka', 'Mały cel szybko ucieka.'],
      4: ['Dwie babeczki', 'Sypnij, złap, sypnij znowu.'],
      5: ['Trzy babeczki', 'Słoik nie jest pełny. Oszczędzaj.'],
      6: ['Uważaj na przerwę', 'Zatrzymaj strumień nad stołem.'],
      7: ['Duże perły', 'Duże kawałki wypadają później i się odbijają.'],
      8: ['Babka', 'Dziura w środku zjada posypkę.'],
      9: ['Taśmociąg', 'Babeczki też się ruszają.'],
      10: ['Tort piętrowy', 'Przechyl za mocno, a słoik uderzy w tort.'],
    },
  },
};

function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && STRINGS[q]) return q;
  } catch {
    /* no location (headless) */
  }
  try {
    const saved = localStorage.getItem(STORE);
    if (saved && STRINGS[saved]) return saved;
  } catch {
    /* storage blocked */
  }
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const langs = nav.languages?.length ? nav.languages : [nav.language || 'en'];
  if (langs.some((l) => /^pl\b/i.test(l) || /-pl$/i.test(l))) return 'pl';
  try {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Warsaw') return 'pl';
  } catch {
    /* no Intl */
  }
  return 'en';
}

let lang = detect();

export const getLang = () => lang;

export function setLang(next) {
  if (!STRINGS[next]) return;
  lang = next;
  try {
    localStorage.setItem(STORE, next);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
}

// t('tipMore', {n: 5, s: 3}) → "5 more points for 3 stars."
export function t(key, vars = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : s;
}

export function levelName(level) {
  return (STRINGS[lang].levels[level.id] ?? [level.name])[0];
}

export function levelBlurb(level) {
  return (STRINGS[lang].levels[level.id] ?? [null, level.blurb])[1] ?? level.blurb;
}

// "Cupcake 2" when a level has more than one of a kind.
export function cakeName(kind, index) {
  const base = STRINGS[lang].cakes[kind] ?? kind;
  return index ? `${base} ${index}` : base;
}

// "40 rods" / "40 pałeczek"
export function pieceCount(type, n) {
  const w = STRINGS[lang].pieces[type];
  if (typeof w === 'string') return `${n} ${w}`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  const form = n === 1 ? 0 : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 1 : 2;
  return `${n} ${w[form]}`;
}
