/*
 * Owed prototype: core logic, no UI.
 *
 * - parseIEP(text): finds the services an IEP promises (service, group, frequency, length).
 * - computeOwed(services, data, today): compares the promised sessions with the parent's
 *   weekly check-ins and works out what was missed.
 * - buildLetter(data, owed, today, lang): drafts a letter to the school asking for make-up sessions.
 *
 * Every function that produces words takes a language: 'en' (English), 'es' (Spanish)
 * or 'zh' (Simplified Chinese). English is the default.
 *
 * Runs in the browser (window.OwedCore) and in Node (require) so it can be tested.
 * The IEP reader uses simple text rules. The real product would swap parseIEP for an AI call.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OwedCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LANGS = ['en', 'es', 'zh'];
  const pickLang = lang => (LANGS.includes(lang) ? lang : 'en');

  // ---------------------------------------------------------------------------
  // Service catalog. Overlapping matches keep the longest one, so
  // "Parent Counseling and Training" wins over the "Counseling" inside it.
  // ---------------------------------------------------------------------------
  const CATALOG = [
    { key: 'parent', name: 'Parent counseling and training', related: false,
      patterns: [/parent\s+counseling(?:\s*(?:and|&)\s*training)?/gi],
      plain: 'Sessions that teach you, the parent, ways to support your child at home.',
      es: { name: 'Asesoramiento y capacitación para padres', plain: 'Sesiones que le enseñan a usted, como padre o madre, maneras de apoyar a su hijo en casa.' },
      zh: { name: '家长指导与培训', plain: '教您（家长）在家帮助孩子的方法。' } },
    { key: 'speech', name: 'Speech-language therapy', related: true,
      patterns: [/speech[\s-]*(?:and[\s-]*)?language\s+therapy/gi, /speech\s+therapy/gi],
      plain: 'Help with saying sounds clearly, understanding and using language, and talking with others.',
      es: { name: 'Terapia del habla y lenguaje', plain: 'Ayuda para pronunciar bien los sonidos, entender y usar el lenguaje, y conversar con otros.' },
      zh: { name: '言语语言治疗', plain: '帮助孩子发音清楚、理解和使用语言，以及与人交流。' } },
    { key: 'ot', name: 'Occupational therapy', related: true,
      patterns: [/occupational\s+therapy/gi, /\bOT\b/g],
      plain: 'Help with hand skills like handwriting and using scissors, self-care, and handling sensory input.',
      es: { name: 'Terapia ocupacional', plain: 'Ayuda con destrezas de las manos, como escribir y usar tijeras, el cuidado personal y el manejo de los sentidos.' },
      zh: { name: '职能治疗', plain: '帮助孩子练习手部技能（如写字、用剪刀）、生活自理，以及处理感官刺激。' } },
    { key: 'pt', name: 'Physical therapy', related: true,
      patterns: [/physical\s+therapy/gi, /\bPT\b/g],
      plain: 'Help with big-muscle skills like walking, balance, stairs and moving safely around school.',
      es: { name: 'Terapia física', plain: 'Ayuda con movimientos grandes, como caminar, el equilibrio, subir escaleras y moverse con seguridad en la escuela.' },
      zh: { name: '物理治疗', plain: '帮助孩子练习大肌肉动作，如走路、平衡、上下楼梯，以及在学校安全地活动。' } },
    { key: 'counseling', name: 'Counseling', related: true,
      patterns: [/counseling(?:\s+services?)?/gi],
      plain: 'Sessions with a counselor, social worker or psychologist about feelings, behavior and getting along with others.',
      es: { name: 'Consejería', plain: 'Sesiones con un consejero, trabajador social o psicólogo sobre emociones, conducta y cómo llevarse bien con otros.' },
      zh: { name: '心理辅导服务', plain: '由辅导员、社工或心理学家帮助孩子处理情绪、行为和人际关系。' } },
    { key: 'setss', name: 'SETSS teacher support', related: false,
      patterns: [/special\s+education\s+teacher\s+support\s+services?/gi, /\bSETSS\b/gi],
      plain: 'Extra teaching from a special education teacher, in class or in a small group, to help your child keep up.',
      es: { name: 'Apoyo de maestro SETSS', plain: 'Enseñanza adicional de un maestro de educación especial, en la clase o en un grupo pequeño, para que su hijo no se quede atrás.' },
      zh: { name: 'SETSS特教老师支援', plain: '特殊教育老师在课堂上或小组里给孩子额外辅导，帮助孩子跟上进度。' } },
    { key: 'hearing', name: 'Hearing education services', related: true,
      patterns: [/hearing\s+education\s+services?/gi],
      plain: 'Support from a teacher of the deaf and hard of hearing.',
      es: { name: 'Servicios de educación auditiva', plain: 'Apoyo de un maestro para estudiantes sordos o con pérdida auditiva.' },
      zh: { name: '听力教育服务', plain: '由听障教育老师提供的支持。' } },
    { key: 'vision', name: 'Vision education services', related: true,
      patterns: [/vision\s+education\s+services?/gi],
      plain: 'Support from a teacher of students with vision loss.',
      es: { name: 'Servicios de educación visual', plain: 'Apoyo de un maestro para estudiantes con pérdida de la visión.' },
      zh: { name: '视力教育服务', plain: '由视障教育老师提供的支持。' } },
    { key: 'om', name: 'Orientation and mobility', related: true,
      patterns: [/orientation\s*(?:and|&)\s*mobility/gi],
      plain: 'Training to move around school and the neighborhood safely, for students with vision loss.',
      es: { name: 'Orientación y movilidad', plain: 'Entrenamiento para moverse con seguridad en la escuela y el vecindario, para estudiantes con pérdida de la visión.' },
      zh: { name: '定向与行动训练', plain: '帮助视障学生在学校和社区里安全行动的训练。' } },
    { key: 'at', name: 'Assistive technology services', related: false,
      patterns: [/assistive\s+technology\s+services?/gi],
      plain: 'Help using devices or software that support learning or communication.',
      es: { name: 'Servicios de tecnología de asistencia', plain: 'Ayuda para usar aparatos o programas que apoyan el aprendizaje o la comunicación.' },
      zh: { name: '辅助技术服务', plain: '帮助孩子使用支持学习或沟通的设备或软件。' } },
    { key: 'nurse', name: 'School nurse services', related: false,
      patterns: [/school\s+(?:health|nurse|nursing)\s+services?/gi],
      plain: 'Health care during the school day, such as medication or monitoring.',
      es: { name: 'Servicios de enfermería escolar', plain: 'Atención de salud durante el día escolar, como medicamentos o vigilancia.' },
      zh: { name: '学校护理服务', plain: '上学期间的健康护理，例如服药或健康监测。' } },
  ];
  const CATALOG_BY_KEY = Object.fromEntries(CATALOG.map(c => [c.key, c]));

  // Names of the languages a service can be given in, as they appear in an IEP.
  const LANGUAGE_NAMES = {
    English: { es: 'inglés', zh: '英语' }, Spanish: { es: 'español', zh: '西班牙语' },
    Chinese: { es: 'chino', zh: '中文' }, Mandarin: { es: 'mandarín', zh: '普通话' },
    Cantonese: { es: 'cantonés', zh: '粤语' }, Bengali: { es: 'bengalí', zh: '孟加拉语' },
    Bangla: { es: 'bengalí', zh: '孟加拉语' }, Russian: { es: 'ruso', zh: '俄语' },
    Arabic: { es: 'árabe', zh: '阿拉伯语' }, 'Haitian Creole': { es: 'criollo haitiano', zh: '海地克里奥尔语' },
    French: { es: 'francés', zh: '法语' }, Korean: { es: 'coreano', zh: '韩语' },
    Urdu: { es: 'urdu', zh: '乌尔都语' }, Polish: { es: 'polaco', zh: '波兰语' },
    Yiddish: { es: 'ídish', zh: '意第绪语' }, Uzbek: { es: 'uzbeko', zh: '乌兹别克语' },
  };
  function languageName(name, lang) {
    lang = pickLang(lang);
    if (lang === 'en' || !LANGUAGE_NAMES[name]) return name;
    return LANGUAGE_NAMES[name][lang];
  }

  // ---------------------------------------------------------------------------
  // Dates (all ISO 'YYYY-MM-DD' strings, computed in UTC so time zones don't shift days)
  // ---------------------------------------------------------------------------
  const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  };
  const MON = {
    en: MONTHS.en.map(m => m.slice(0, 3)),
    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  };

  const pad = n => String(n).padStart(2, '0');
  function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  const toISO = dt => dt.toISOString().slice(0, 10);
  function addDays(iso, n) { const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
  const weekdayIndex = iso => (parseISO(iso).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const mondayOf = iso => addDays(iso, -weekdayIndex(iso));
  function todayISO(now = new Date()) {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  function usDateToISO(s) {
    const m = String(s || '').match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (!m) return '';
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return `${y}-${pad(m[1])}-${pad(m[2])}`;
  }
  // If tracking starts on a weekend, the first school day is the next Monday.
  function firstSchoolDay(startISO) {
    const wd = weekdayIndex(startISO);
    return wd >= 5 ? addDays(startISO, 7 - wd) : startISO;
  }
  function listWeeks(startISO, endISO) {
    if (!startISO || !endISO) return [];
    const out = [];
    let w = mondayOf(firstSchoolDay(startISO));
    const last = mondayOf(endISO);
    while (w <= last) { out.push(w); w = addDays(w, 7); }
    return out;
  }
  function listMonths(startISO, endISO) {
    if (!startISO || !endISO || startISO > endISO) return [];
    const out = [];
    let y = +startISO.slice(0, 4), m = +startISO.slice(5, 7);
    const ey = +endISO.slice(0, 4), em = +endISO.slice(5, 7);
    while (y < ey || (y === ey && m <= em)) {
      out.push(`${y}-${pad(m)}`);
      if (++m > 12) { m = 1; y++; }
    }
    return out;
  }
  function longDate(iso, lang) {
    if (!iso) return '';
    lang = pickLang(lang);
    const d = parseISO(iso);
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
    if (lang === 'zh') return `${y}年${m + 1}月${day}日`;
    if (lang === 'es') return `${day} de ${MONTHS.es[m]} de ${y}`;
    return `${MONTHS.en[m]} ${day}, ${y}`;
  }
  // Monday-to-Friday span, e.g. "Sep 14–18", "14 al 18 de sep", "9月14日–18日".
  function weekLabel(monday, lang) {
    lang = pickLang(lang);
    const a = parseISO(monday), b = parseISO(addDays(monday, 4));
    const am = a.getUTCMonth(), bm = b.getUTCMonth(), ad = a.getUTCDate(), bd = b.getUTCDate();
    if (lang === 'zh') return am === bm ? `${am + 1}月${ad}日–${bd}日` : `${am + 1}月${ad}日–${bm + 1}月${bd}日`;
    if (lang === 'es') return am === bm ? `${ad} al ${bd} de ${MON.es[am]}` : `${ad} de ${MON.es[am]} al ${bd} de ${MON.es[bm]}`;
    return am === bm ? `${MON.en[am]} ${ad}–${bd}` : `${MON.en[am]} ${ad} – ${MON.en[bm]} ${bd}`;
  }
  function weekTitle(monday, lang) {
    lang = pickLang(lang);
    const span = weekLabel(monday, lang);
    if (lang === 'zh') return `${span}这一周`;
    if (lang === 'es') return `Semana del ${span}`;
    return `Week of ${span}`;
  }
  function monthLabel(mk, lang) {
    lang = pickLang(lang);
    const y = mk.slice(0, 4), m = +mk.slice(5, 7);
    if (lang === 'zh') return `${y}年${m}月`;
    if (lang === 'es') return `${MONTHS.es[m - 1]} de ${y}`;
    return `${MONTHS.en[m - 1]} ${y}`;
  }
  function fmtMinutes(min, lang) {
    lang = pickLang(lang);
    min = Math.round(min);
    const h = Math.floor(min / 60), r = min % 60;
    if (lang === 'zh') return h ? `${h}小时${r ? `${r}分钟` : ''}` : `${r}分钟`;
    if (lang === 'es') {
      const mins = n => `${n} minuto${n === 1 ? '' : 's'}`;
      if (!h) return mins(r);
      return `${h} hora${h === 1 ? '' : 's'}` + (r ? ` y ${mins(r)}` : '');
    }
    if (!h) return `${r} minute${r === 1 ? '' : 's'}`;
    return `${h} hour${h === 1 ? '' : 's'}` + (r ? ` ${r} minute${r === 1 ? '' : 's'}` : '');
  }

  // ---------------------------------------------------------------------------
  // Reading the IEP (English text)
  // ---------------------------------------------------------------------------
  const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)';
  const UNIT = '(weekly|week|wk|monthly|month|mo|daily|day)';
  const FREQ_RE = new RegExp(NUM + '\\s*(?:x|×|times?)\\s*(?:a|an|per|each|/)?\\s*' + UNIT + '\\b', 'i');
  const PERIODS_RE = new RegExp(NUM + '\\s*periods?\\s*(?:a|an|per|each|/)?\\s*' + UNIT + '\\b', 'i');
  const ONCE_RE = /\b(once|twice)\s*(?:a|an|per|each)\s*(week|month|day)\b/i;
  const DAILY_RE = /\bdaily\b/i;
  const MIN_RE = /(\d+)\s*-?\s*(?:minutes?|mins?)\b/i;
  const HOUR_RE = /(\d+(?:\.\d+)?)\s*-?\s*(?:hours?|hrs?)\b/i;
  const LANG_RE = /\b(English|Spanish|Chinese|Mandarin|Cantonese|Bengali|Bangla|Russian|Arabic|Haitian Creole|French|Korean|Urdu|Polish|Yiddish|Uzbek)\b/i;
  const MAX_WINDOW_LINES = 8;

  const toNum = s => NUMBER_WORDS[String(s).toLowerCase()] || parseInt(s, 10);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function unitize(n, unit) {
    const u = unit.toLowerCase();
    if (u.startsWith('d')) return { freq: n * 5, per: 'week' };
    if (u.startsWith('m')) return { freq: n, per: 'month' };
    return { freq: n, per: 'week' };
  }

  function readFrequency(win) {
    let m;
    if ((m = win.match(PERIODS_RE))) return Object.assign(unitize(toNum(m[1]), m[2]), { periods: true });
    if ((m = win.match(FREQ_RE))) return unitize(toNum(m[1]), m[2]);
    if ((m = win.match(ONCE_RE))) return unitize(m[1].toLowerCase() === 'once' ? 1 : 2, m[2]);
    if (DAILY_RE.test(win)) return { freq: 5, per: 'week' };
    return null;
  }

  function readMinutes(win) {
    let m;
    if ((m = win.match(MIN_RE))) return parseInt(m[1], 10);
    if ((m = win.match(HOUR_RE))) return Math.round(parseFloat(m[1]) * 60);
    return null;
  }

  // Some IEPs put the length in a "Duration" column with no unit, e.g. "2 x weekly | 30".
  function guessMinutes(win) {
    const noDates = win.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ' ');
    const afterFreq = noDates.replace(FREQ_RE, ' ');
    const m = afterFreq.match(/\b(15|20|25|30|40|45|50|60|75|90)\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  function readGroup(win) {
    const m = win.match(/group[ \t]*(?:size)?[ \t]*(?:of|:)?[ \t]*\(?[ \t]*(\d{1,2})[ \t]*\)?(?![ \t]*(?:x\b|×|times?\b|periods?\b|min))/i);
    if (m) return 'Group of ' + m[1];
    if (/\bindividual\b|\b1\s*:\s*1\b|one[\s-]on[\s-]one/i.test(win)) return 'Individual';
    if (/\bgroup\b/i.test(win)) return 'Group';
    return '';
  }

  function readLanguage(win) {
    const m = win.match(LANG_RE);
    return m ? m[1].replace(/\b\w/g, c => c.toUpperCase()) : '';
  }

  function readLocation(win) {
    if (/separate\s+location|pull[\s-]?out/i.test(win)) return 'Outside the classroom';
    if (/classroom|in[\s-]class|push[\s-]?in/i.test(win)) return 'In the classroom';
    return '';
  }

  function findMentions(text) {
    const found = [];
    CATALOG.forEach(svc => {
      svc.patterns.forEach(pattern => {
        const re = new RegExp(pattern.source, pattern.flags);
        let m;
        while ((m = re.exec(text))) found.push({ start: m.index, end: m.index + m[0].length, svc });
      });
    });
    found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const kept = [];
    let lastEnd = -1;
    for (const f of found) {
      if (f.start >= lastEnd) { kept.push(f); lastEnd = f.end; }
    }
    return kept;
  }

  // The text after a service name, up to the next service name (or 8 lines).
  function windowAfter(text, from, to) {
    const lines = text.slice(from, to).split('\n');
    return lines.slice(0, MAX_WINDOW_LINES).join('\n');
  }

  function parseMeta(t) {
    const pick = re => { const m = t.match(re); return m ? m[1].trim() : ''; };
    const childName = pick(/student(?:'s)?\s+name\s*[:-]\s*([^\n]+)/i)
      .split(/\s+(?:DOB|D\.O\.B\.|Date of Birth|OSIS|ID|Grade)\b/i)[0].trim();
    const school = pick(/^\s*(?:school(?:\s+name)?|attending\s+school|school\s+of\s+attendance)\s*[:-]\s*([^\n]+)/im);
    const iepDate = usDateToISO(pick(/(?:IEP\s+)?(?:meeting\s+date|date\s+of\s+(?:IEP\s+)?meeting)\s*[:-]\s*([0-9/-]+)/i));
    const startDate = usDateToISO(pick(/(?:projected\s+)?implementation\s+date\s*[:-]\s*([0-9/-]+)/i));
    return { childName, school, iepDate, startDate };
  }

  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  // review codes: 'periods' (length assumed from class periods), 'guessed' (length guessed),
  // 'custom' (added by hand). The app turns them into sentences in the parent's language.
  function parseIEP(text) {
    const clean = String(text || '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ');
    const meta = parseMeta(clean);
    const mentions = findMentions(clean);
    const services = [];
    const seen = new Set();
    const usedIds = new Set();

    mentions.forEach((m, i) => {
      const next = mentions[i + 1];
      const win = windowAfter(clean, m.end, next ? next.start : clean.length);
      const freq = readFrequency(win);
      if (!freq) return; // a service named in the narrative, not a promised service

      const review = [];
      let minutes = readMinutes(win);
      if (minutes == null && freq.periods) { minutes = 45; review.push('periods'); }
      if (minutes == null) {
        minutes = guessMinutes(win);
        if (minutes != null) review.push('guessed');
      }
      if (minutes == null) return;

      const group = readGroup(win);
      const sig = [m.svc.key, group, freq.freq, freq.per, minutes].join('|');
      if (seen.has(sig)) return; // the same service listed twice in the document
      seen.add(sig);

      const base = m.svc.key + (group ? '-' + slug(group) : '');
      let id = base, k = 2;
      while (usedIds.has(id)) id = `${base}-${k++}`;
      usedIds.add(id);

      services.push({
        id, key: m.svc.key, name: m.svc.name, plain: m.svc.plain, related: m.svc.related,
        group, freq: freq.freq, per: freq.per, minutes,
        language: readLanguage(win), location: readLocation(win), review,
      });
    });
    return { meta, services };
  }

  // ---------------------------------------------------------------------------
  // Plain-language descriptions
  // ---------------------------------------------------------------------------
  const groupSize = g => { const m = (g || '').match(/Group of (\d+)/); return m ? Number(m[1]) : 0; };

  // A catalog service keeps its translated name unless the parent renamed it.
  function serviceName(s, lang) {
    lang = pickLang(lang);
    const cat = CATALOG_BY_KEY[s.key];
    if (lang !== 'en' && cat && s.name === cat.name) return cat[lang].name;
    return s.name;
  }
  function servicePlain(s, lang) {
    lang = pickLang(lang);
    const cat = CATALOG_BY_KEY[s.key];
    if (lang !== 'en' && cat) return cat[lang].plain;
    return s.plain || '';
  }
  function shortGroup(g, lang) {
    lang = pickLang(lang);
    if (!g) return '';
    const n = groupSize(g);
    if (g === 'Individual') return lang === 'zh' ? '一对一' : '1:1';
    if (lang === 'zh') return n ? `${n}人小组` : '小组';
    if (lang === 'es') return n ? `grupo de ${n}` : 'grupo';
    return n ? `group of ${n}` : 'group';
  }
  function displayName(s, lang) {
    const g = shortGroup(s.group, lang);
    if (!g) return serviceName(s, lang);
    return pickLang(lang) === 'zh' ? `${serviceName(s, lang)}（${g}）` : `${serviceName(s, lang)} (${g})`;
  }
  function timesPhrase(n, lang) {
    lang = pickLang(lang);
    if (lang === 'zh') return `${n}次`;
    if (lang === 'es') return n === 1 ? 'una vez' : n === 2 ? 'dos veces' : `${n} veces`;
    return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
  }
  // "twice a week" / "dos veces a la semana" / "每周2次"
  function howOften(s, lang) {
    lang = pickLang(lang);
    if (lang === 'zh') return `每${s.per === 'month' ? '月' : '周'}${s.freq}次`;
    if (lang === 'es') return `${timesPhrase(s.freq, 'es')} ${s.per === 'month' ? 'al mes' : 'a la semana'}`;
    return `${timesPhrase(s.freq, 'en')} ${s.per === 'month' ? 'a month' : 'a week'}`;
  }

  function describeService(s, lang) {
    lang = pickLang(lang);
    const n = groupSize(s.group);
    const lname = s.language && s.language !== 'English' ? languageName(s.language, lang) : '';
    if (lang === 'zh') {
      const who = s.group === 'Individual' ? '一对一' : n ? `最多${n}名学生的小组` : s.group ? '小组' : '';
      let t = `${who ? who + '，' : ''}${howOften(s, 'zh')}，每次${s.minutes}分钟。`;
      if (s.per === 'week') t += `每周共${fmtMinutes(s.freq * s.minutes, 'zh')}。`;
      if (lname) t += `使用${lname}。`;
      return t;
    }
    if (lang === 'es') {
      const who = s.group === 'Individual' ? 'Sesión individual' : n ? `En un grupo de hasta ${n} estudiantes` : s.group ? 'En un grupo pequeño' : '';
      let t = `${who ? who + ', ' : ''}${howOften(s, 'es')}, ${s.minutes} minutos cada vez.`;
      if (s.per === 'week') t += ` En total, ${fmtMinutes(s.freq * s.minutes, 'es')} por semana.`;
      if (lname) t += ` En ${lname}.`;
      return cap(t);
    }
    const who = s.group === 'Individual' ? 'One-on-one' : n ? `In a group of up to ${n} students` : s.group ? 'In a small group' : '';
    let t = `${who ? who + ', ' : ''}${howOften(s, 'en')}, ${s.minutes} minutes each.`;
    if (s.per === 'week') t += ` That's ${fmtMinutes(s.freq * s.minutes, 'en')} every week.`;
    if (lname) t += ` In ${lname}.`;
    return cap(t);
  }

  // ---------------------------------------------------------------------------
  // What's owed
  // ---------------------------------------------------------------------------

  // Sessions expected in a given week. The first week is prorated if the IEP
  // started mid-week, rounding down so the letter never claims too much.
  function expectedFor(s, weekMonday, startISO) {
    if (s.per !== 'week' || !startISO) return 0;
    const start = firstSchoolDay(startISO);
    if (weekMonday >= start) return s.freq;
    const days = 5 - weekdayIndex(start);
    return Math.floor((s.freq * days) / 5);
  }

  function computeOwed(services, data, today) {
    const start = data.startDate;
    const weeks = start ? listWeeks(start, today) : [];
    const months = start ? listMonths(firstSchoolDay(start), today) : [];
    const curMonth = today.slice(0, 7);
    const W = data.weeks || {}, M = data.months || {}, MR = data.monthReasons || {};
    const weekly = services.filter(s => s.per === 'week');
    const monthly = services.filter(s => s.per === 'month');

    let unansweredWeeks = 0, answeredWeeks = 0;
    weeks.forEach(w => {
      const st = W[w];
      if (st && st.closed) { answeredWeeks++; return; }
      const needed = weekly.filter(s => expectedFor(s, w, start) > 0);
      if (!needed.length) return;
      const done = needed.every(s => st && st.logs && st.logs[s.id] != null);
      if (done) answeredWeeks++; else unansweredWeeks++;
    });
    const unansweredMonths = monthly.length
      ? months.filter(mk => mk !== curMonth && monthly.some(s => !M[mk] || M[mk][s.id] == null)).length
      : 0;

    // A miss has a reason, matching the DOE's own session codes: 'provider' (therapist
    // absent), 'cancelled', 'student' (child absent) or 'unknown'. Sessions the child
    // missed are usually not owed, so they are counted apart ("excused").
    const rows = services.map(s => {
      let required = 0, delivered = 0, unanswered = 0, excused = 0;
      const misses = []; // { period, kind: 'week' | 'month', missed, reason }
      if (s.per === 'week') {
        weeks.forEach(w => {
          const st = W[w] || {};
          if (st.closed) return;
          const exp = expectedFor(s, w, start);
          if (!exp) return;
          const v = st.logs ? st.logs[s.id] : undefined;
          if (v == null) { unanswered++; return; }
          required += exp;
          delivered += Math.min(v, exp);
          if (v < exp) {
            const reason = (st.reasons && st.reasons[s.id]) || 'unknown';
            if (reason === 'student') excused += exp - v;
            else misses.push({ period: w, kind: 'week', missed: exp - v, reason });
          }
        });
      } else {
        months.forEach(mk => {
          const v = M[mk] ? M[mk][s.id] : undefined;
          if (v == null) { if (mk !== curMonth) unanswered++; return; }
          // The current month isn't over, so nothing counts as missed yet.
          const exp = mk === curMonth ? Math.min(s.freq, v) : s.freq;
          required += exp;
          delivered += Math.min(v, exp);
          if (v < exp) {
            const reason = (MR[mk] && MR[mk][s.id]) || 'unknown';
            if (reason === 'student') excused += exp - v;
            else misses.push({ period: mk, kind: 'month', missed: exp - v, reason });
          }
        });
      }
      const minutes = Number(s.minutes) || 0;
      const missedSessions = required - delivered - excused;
      return {
        service: s, required, delivered, missedSessions,
        missedMinutes: missedSessions * minutes, excused, excusedMinutes: excused * minutes, unanswered, misses,
      };
    });

    const logged = weeks.filter(w => W[w] && (W[w].closed || Object.values(W[w].logs || {}).some(v => v != null)));
    const lastFriday = logged.length ? addDays(logged[logged.length - 1], 4) : '';
    return {
      rows,
      weeks,
      months,
      totals: {
        missedMinutes: rows.reduce((a, r) => a + r.missedMinutes, 0),
        missedSessions: rows.reduce((a, r) => a + r.missedSessions, 0),
        excusedSessions: rows.reduce((a, r) => a + r.excused, 0),
        excusedMinutes: rows.reduce((a, r) => a + r.excusedMinutes, 0),
        answeredWeeks, unansweredWeeks, unansweredMonths,
        from: start ? firstSchoolDay(start) : '',
        to: lastFriday ? (lastFriday < today ? lastFriday : today) : '',
      },
    };
  }

  function periodLabel(miss, lang) {
    return miss.kind === 'month' ? monthLabel(miss.period, lang) : weekTitle(miss.period, lang);
  }

  // ---------------------------------------------------------------------------
  // Letter to the school
  // ---------------------------------------------------------------------------
  const LETTER = {
    en: {
      to: school => `To: The Principal and IEP Team${school ? ', ' + school : ''}`,
      re: name => `Re: Missed IEP services for ${name || 'my child'}`,
      dear: 'Dear Principal and IEP Team,',
      intro: (child, possessive, dated, range) =>
        `I am the parent of ${child}. ${possessive} IEP${dated ? `, dated ${dated},` : ''} says the school will provide the services below. ` +
        `I have kept a record of the sessions${range ? ` from ${range[0]} to ${range[1]}` : ''}. According to my record, these sessions did not happen:`,
      possessive: first => (first ? `${first}'s` : "My child's"),
      child: (full) => full || 'my child',
      first: first => first || 'my child',
      item: (name, often, minutes, missed, required, time) =>
        `• ${name}, ${often} for ${minutes} minutes: ${missed} of ${required} sessions missed (${time}).`,
      total: (first, time) => `In total, ${first} missed ${time} of services.`,
      ask: 'I am asking the school to:',
      why: 'Tell me in writing why these sessions did not happen.',
      makeup: 'Make up every missed session (compensatory services) and send me a schedule for when they will happen.',
      rsa: 'If the school cannot provide a therapy service, issue a Related Services Authorization (RSA) so I can arrange it with an outside provider.',
      meet: first => `Meet with me to make sure ${first} receives every service from now on.`,
      reply: 'Please reply in writing within two weeks. My session record is attached.',
      thanks: 'Thank you,',
      yourName: '[Your name]',
      yourContact: '[Your phone or email]',
    },
    es: {
      to: school => `Para: Director(a) y equipo del IEP${school ? ', ' + school : ''}`,
      re: name => `Asunto: Servicios del IEP que no recibió ${name || 'mi hijo/a'}`,
      dear: 'Estimado(a) director(a) y equipo del IEP:',
      intro: (child, possessive, dated, range) =>
        `Soy padre/madre de ${child}. ${possessive}${dated ? `, con fecha del ${dated},` : ''} dice que la escuela le dará los servicios que aparecen abajo. ` +
        `He llevado un registro de las sesiones${range ? ` del ${range[0]} al ${range[1]}` : ''}. Según mi registro, estas sesiones no se dieron:`,
      possessive: first => (first ? `El IEP de ${first}` : 'El IEP de mi hijo/a'),
      child: full => full || 'mi hijo/a',
      first: first => first || 'mi hijo/a',
      item: (name, often, minutes, missed, required, time) =>
        `• ${name}, ${often} de ${minutes} minutos: faltaron ${missed} de ${required} sesiones (${time}).`,
      total: (first, time) => `En total, ${first} no recibió ${time} de servicios.`,
      ask: 'Le pido a la escuela que:',
      why: 'Me explique por escrito por qué no se dieron estas sesiones.',
      makeup: 'Reponga todas las sesiones perdidas (servicios compensatorios) y me envíe un horario de cuándo se darán.',
      rsa: 'Si la escuela no puede dar una terapia, emita una Autorización de Servicios Relacionados (RSA, por sus siglas en inglés) para que yo pueda conseguirla con un proveedor externo.',
      meet: first => `Se reúna conmigo para asegurar que ${first} reciba todos los servicios de ahora en adelante.`,
      reply: 'Por favor, responda por escrito en un plazo de dos semanas. Adjunto mi registro de las sesiones.',
      thanks: 'Gracias,',
      yourName: '[Su nombre]',
      yourContact: '[Su teléfono o correo electrónico]',
    },
    zh: {
      to: school => `致：校长及IEP团队${school ? '，' + school : ''}`,
      re: name => `事由：${name || '我的孩子'}未获提供的IEP服务`,
      dear: '尊敬的校长及IEP团队：',
      intro: (child, possessive, dated, range) =>
        `我是${child}的家长。根据${possessive}${dated ? `（日期为${dated}）` : ''}，学校应提供以下服务。` +
        `我记录了${range ? `${range[0]}至${range[1]}期间` : ''}的课时情况。根据我的记录，以下课时没有提供：`,
      possessive: first => (first ? `${first}的IEP` : '孩子的IEP'),
      child: full => full || '孩子',
      first: first => first || '孩子',
      item: (name, often, minutes, missed, required, time) =>
        `• ${name}，${often}，每次${minutes}分钟：${required}次中缺少${missed}次（${time}）。`,
      total: (first, time) => `${first}总共缺少了${time}的服务。`,
      ask: '我请求学校：',
      why: '以书面形式说明这些课时为何没有提供。',
      makeup: '补上所有缺少的课时（补偿性服务），并给我一份补课时间表。',
      rsa: '如果学校无法提供某项治疗服务，请签发相关服务授权书（Related Services Authorization，简称RSA），让我可以找校外的服务提供者。',
      meet: first => `与我见面，确保${first}今后能得到所有服务。`,
      reply: '请在两周内以书面形式回复。随信附上我的课时记录。',
      thanks: '谢谢！',
      yourName: '[您的姓名]',
      yourContact: '[您的电话或电子邮箱]',
    },
  };

  function buildLetter(d, owed, today, lang) {
    lang = pickLang(lang);
    const T = LETTER[lang];
    const fullName = (d.child.name || '').trim();
    const first = fullName ? fullName.split(/\s+/)[0] : '';
    const school = (d.child.school || '').trim();
    const missed = owed.rows.filter(r => r.missedSessions > 0);
    const dated = d.child.iepDate ? longDate(d.child.iepDate, lang) : '';
    const range = owed.totals.from && owed.totals.to
      ? [longDate(owed.totals.from, lang), longDate(owed.totals.to, lang)] : null;
    const L = [];

    L.push(longDate(today, lang), '');
    L.push(T.to(school));
    L.push(T.re(fullName), '');
    L.push(T.dear, '');
    L.push(T.intro(T.child(fullName), T.possessive(first), dated, range), '');
    missed.forEach(r => {
      const s = r.service;
      L.push(T.item(displayName(s, lang), howOften(s, lang), s.minutes, r.missedSessions, r.required, fmtMinutes(r.missedMinutes, lang)));
    });
    L.push('', T.total(T.first(first), fmtMinutes(owed.totals.missedMinutes, lang)), '');
    L.push(T.ask);
    let n = 1;
    L.push(`${n++}. ${T.why}`);
    L.push(`${n++}. ${T.makeup}`);
    if (d.letter.rsa && missed.some(r => r.service.related)) L.push(`${n++}. ${T.rsa}`);
    if (d.letter.meeting) L.push(`${n++}. ${T.meet(T.first(first))}`);
    L.push('', T.reply, '');
    L.push(T.thanks, '', d.child.parentName || T.yourName, d.child.parentContact || T.yourContact);
    return L.join('\n');
  }

  // A request for the school's own session records (SESIS encounter attendance).
  const RECORDS = {
    en: {
      to: school => `To: The Principal${school ? ', ' + school : ''}`,
      re: name => `Re: Request for related service session records for ${name || 'my child'}`,
      dear: 'Dear Principal,',
      intro: (child, from, to) => `I am the parent of ${child}. I am asking for copies of my child's related service session records ` +
        `(the SESIS encounter attendance records)${from ? ` from ${from} to ${to}` : ''} for these services:`,
      details: 'For each session, please include the date, the time, the provider, and whether the session happened. If a session did not happen, please include the reason that was recorded.',
      law: "Under federal law (FERPA), parents have the right to see their child's education records, and the school must respond within 45 days.",
    },
    es: {
      to: school => `Para: Director(a)${school ? ', ' + school : ''}`,
      re: name => `Asunto: Solicitud de los registros de sesiones de servicios relacionados de ${name || 'mi hijo/a'}`,
      dear: 'Estimado(a) director(a):',
      intro: (child, from, to) => `Soy padre/madre de ${child}. Le pido copias de los registros de sesiones de servicios relacionados de mi hijo/a ` +
        `(los registros de asistencia de SESIS, "encounter attendance")${from ? ` del ${from} al ${to}` : ''}, para estos servicios:`,
      details: 'Para cada sesión, por favor incluya la fecha, la hora, el proveedor y si la sesión se dio. Si una sesión no se dio, por favor incluya el motivo registrado.',
      law: 'Según la ley federal (FERPA), los padres tienen derecho a ver los expedientes educativos de su hijo/a, y la escuela debe responder en un plazo de 45 días.',
    },
    zh: {
      to: school => `致：校长${school ? '，' + school : ''}`,
      re: name => `事由：申请${name || '我孩子'}的相关服务课时记录`,
      dear: '尊敬的校长：',
      intro: (child, from, to) => `我是${child}的家长。我希望取得孩子${from ? `${from}至${to}期间` : ''}以下相关服务的课时记录（SESIS出勤记录，即encounter attendance）：`,
      details: '请列出每次课的日期、时间、服务提供者，以及是否上了课。如果没有上课，请注明记录的原因。',
      law: '根据联邦法律（FERPA），家长有权查看孩子的教育记录，学校必须在45天内回复。',
    },
  };

  function buildRecordsRequest(d, owed, today, lang) {
    lang = pickLang(lang);
    const T = RECORDS[lang], B = LETTER[lang];
    const fullName = (d.child.name || '').trim();
    const school = (d.child.school || '').trim();
    const from = owed.totals.from ? longDate(owed.totals.from, lang) : '';
    const L = [longDate(today, lang), '', T.to(school), T.re(fullName), '', T.dear, '',
      T.intro(B.child(fullName), from, longDate(today, lang)), ''];
    owed.rows.forEach(r => L.push(`• ${displayName(r.service, lang)}`));
    L.push('', T.details, '', T.law, '', B.thanks, '', d.child.parentName || B.yourName, d.child.parentContact || B.yourContact);
    return L.join('\n');
  }

  // A short note asking the speech therapist how to practice at home.
  const NOTE = {
    en: {
      hello: 'Hello,',
      intro: (child, first) => `I am the parent of ${child}. I would like to help ${first} practice speech at home between sessions. Could you please tell me:`,
      q: first => ['Which words or sounds should we practice at home?', `How many times a day should ${first} practice them?`,
        'Is it OK for us to practice in our home language?', 'Could you send a short recording of how the words should sound?'],
      thanks: 'Thank you!',
    },
    es: {
      hello: 'Hola:',
      intro: (child, first) => `Soy padre/madre de ${child}. Me gustaría ayudar a ${first} a practicar el habla en casa entre sesiones. ¿Podría decirme por favor:`,
      q: first => ['¿Qué palabras o sonidos debemos practicar en casa?', `¿Cuántas veces al día debe practicarlos ${first}?`,
        '¿Está bien practicar en nuestro idioma de casa?', '¿Podría enviarme una grabación corta de cómo deben sonar las palabras?'],
      thanks: '¡Gracias!',
    },
    zh: {
      hello: '您好：',
      intro: (child, first) => `我是${child}的家长。我想在两次治疗之间帮助${first}在家练习说话。请问：`,
      q: first => ['我们在家应该练习哪些词语或发音？', `${first}每天应该练习几次？`, '我们可以用家里说的语言练习吗？', '能否发给我一段这些词语正确读音的简短录音？'],
      thanks: '谢谢！',
    },
  };

  function buildTherapistNote(d, lang) {
    lang = pickLang(lang);
    const T = NOTE[lang], B = LETTER[lang];
    const fullName = (d.child.name || '').trim();
    const first = fullName ? fullName.split(/\s+/)[0] : B.first('');
    const L = [T.hello, '', T.intro(B.child(fullName), first), ''];
    T.q(first).forEach((q, i) => L.push(`${i + 1}. ${q}`));
    L.push('', T.thanks, d.child.parentName || B.yourName);
    return L.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Sound match: how much a heard word sounds like the target word (0 to 1).
  // English words are turned into rough sound units (so "sun" = s-uh-n and
  // "soon" = s-oo-n), then compared. 0.75 or more counts as a good try.
  // ---------------------------------------------------------------------------
  const HOMOPHONES = [
    ['sun', 'son'], ['sea', 'see', 'c'], ['sail', 'sale'], ['seed', 'cede'], ['road', 'rode', 'rowed'], ['rose', 'rows'],
    ['rain', 'reign', 'rein'], ['red', 'read'], ['ring', 'wring'], ['shoe', 'shoo'], ['check', 'cheque', 'czech'],
    ['chew', 'choo'], ['beach', 'beech'], ['key', 'quay'], ['gate', 'gait'], ['feet', 'feat'], ['knife', 'nife'],
    ['six', 'sics'], ['two', 'to', 'too'], ['four', 'for', 'fore'], ['eight', 'ate'], ['bee', 'be', 'b'], ['eye', 'i', 'aye'],
  ];
  const HOMO = {};
  HOMOPHONES.forEach(set => set.forEach(w => { HOMO[w] = set; }));

  const RULES = [ // longest spellings first
    ['tch', 'CH'], ['dge', 'J'], ['igh', 'AI'], ['sh', 'SH'], ['ch', 'CH'], ['th', 'TH'], ['ph', 'F'], ['ck', 'K'],
    ['ng', 'NG'], ['qu', 'K W'], ['wh', 'W'], ['ee', 'II'], ['ea', 'II'], ['oo', 'UU'], ['ou', 'OW'], ['oa', 'OO'],
    ['ai', 'EI'], ['ay', 'EI'], ['oi', 'OI'], ['oy', 'OI'], ['au', 'AW'], ['aw', 'AW'], ['ew', 'UU'], ['ue', 'UU'],
    ['ar', 'AR'], ['or', 'OR'], ['er', 'ER'], ['ir', 'ER'], ['ur', 'ER'], ['ey', 'II'], ['ie', 'II'], ['mb', 'M'],
    ['ow', 'OO'], ['gh', ''],
  ];
  const SINGLE = { a: 'A', e: 'E', i: 'I', o: 'O', u: 'UH', b: 'B', d: 'D', f: 'F', g: 'G', h: 'H', j: 'J', k: 'K', l: 'L',
    m: 'M', n: 'N', p: 'P', r: 'R', s: 'S', t: 'T', v: 'V', w: 'W', z: 'Z' };
  const LONG = { a: 'EI', e: 'II', i: 'AI', o: 'OO', u: 'UU' };

  // Common words the spelling rules get wrong.
  const IRREGULAR = {
    shoe: 'SH UU', love: 'L UH V', some: 'S UH M', come: 'K UH M', giraffe: 'J I R A F', one: 'W UH N', done: 'D UH N',
    none: 'N UH N', two: 'T UU', do: 'D UU', to: 'T UU', who: 'H UU', said: 'S E D', says: 'S E Z', have: 'H A V',
    give: 'G I V', live: 'L I V', were: 'W ER', there: 'TH E R', where: 'W E R', four: 'F OR', door: 'D OR',
    lion: 'L AI UH N', comb: 'K OO M', sofa: 'S OO F UH', robot: 'R OO B O T',
  };

  function soundUnits(word) {
    let w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return [];
    if (IRREGULAR[w]) return IRREGULAR[w].split(' ');
    w = w.replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/([^aeiou])\1/g, '$1'); // merge double consonants only
    const out = [];
    for (let i = 0; i < w.length;) {
      // Silent final e makes the vowel before it long ("cake", "kite", "rope").
      if ('aeiou'.includes(w[i]) && i + 2 === w.length - 1 && w[w.length - 1] === 'e' && !'aeiou'.includes(w[i + 1])) {
        out.push(LONG[w[i]]);
        const c = w[i + 1];
        out.push(c === 'c' ? 'S' : c === 'x' ? 'K S' : (SINGLE[c] || c.toUpperCase()));
        break;
      }
      const rule = RULES.find(([spell]) => w.startsWith(spell, i));
      if (rule) { if (rule[1]) out.push(rule[1]); i += rule[0].length; continue; }
      const ch = w[i], next = w[i + 1] || '';
      if (ch === 'c') out.push('eiy'.includes(next) && next ? 'S' : 'K');
      else if (ch === 'x') out.push('K S');
      else if (ch === 'y') out.push(i === 0 ? 'Y' : (i === w.length - 1 ? (w.length <= 3 ? 'AI' : 'II') : 'I'));
      else if (SINGLE[ch] !== undefined) out.push(SINGLE[ch]);
      i++;
    }
    return out.join(' ').split(' ').filter(Boolean);
  }

  function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  const clean = w => String(w || '').toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim();

  // Similarity of one heard word to the target, 0..1.
  function wordSimilarity(target, heard, lang) {
    const t = clean(target), h = clean(heard);
    if (!t || !h) return 0;
    if (t === h || (HOMO[t] && HOMO[t].includes(h))) return 1;
    let a, b;
    if (pickLang(lang) === 'en') { a = soundUnits(t); b = soundUnits(h); }
    else { a = [...t.replace(/\s/g, '')]; b = [...h.replace(/\s/g, '')]; } // Spanish letters / Chinese characters
    if (!a.length || !b.length) return 0;
    return Math.max(0, 1 - editDistance(a, b) / Math.max(a.length, b.length));
  }

  // Best match across everything the recognizer offered ("the sun", "son", ...).
  function soundMatch(target, alternatives, lang) {
    let best = { score: 0, heard: '' };
    (alternatives || []).forEach(alt => {
      const phrase = clean(alt);
      if (!phrase) return;
      const words = phrase.split(' ');
      const cands = new Set([phrase, ...words]);
      for (let i = 0; i + 1 < words.length; i++) cands.add(words[i] + ' ' + words[i + 1]);
      cands.forEach(c => {
        const sc = wordSimilarity(target, c, lang);
        if (sc > best.score || (!best.heard && sc === best.score)) best = { score: sc, heard: c };
      });
    });
    return best;
  }
  const MATCH_GOOD = 0.75, MATCH_CLOSE = 0.5;
  const matchLevel = score => (score >= MATCH_GOOD ? 'great' : score >= MATCH_CLOSE ? 'close' : 'far');

  // ---------------------------------------------------------------------------
  // Sample data for demos
  // ---------------------------------------------------------------------------
  const SAMPLE_IEP = `SAMPLE IEP (fictional student, for demonstration only)

Student Name: Maya Rivera
Date of Birth: 03/14/2018
School: P.S. 999 (sample school), Brooklyn
Grade: 3
IEP Meeting Date: 06/02/2026
Projected Implementation Date: 09/10/2026
Disability Classification: Speech or Language Impairment

PRESENT LEVELS OF PERFORMANCE
Maya is a friendly student who loves drawing. She has trouble with some speech sounds and with following directions that have several steps. She benefits from speech-language therapy, and occupational therapy will support her handwriting.

RECOMMENDED SPECIAL EDUCATION PROGRAMS AND SERVICES
Program: General Education with SETSS
Special Education Teacher Support Services (SETSS)
Group (3)
5 periods per week
English
Location: General Education Classroom

RELATED SERVICES
Service | Group/Individual | Frequency | Duration | Location | Language
Speech-Language Therapy
Individual
2 x weekly
30 min
Separate Location
English
Speech-Language Therapy
Group (3)
1 x weekly
30 min
Separate Location
English
Occupational Therapy
Individual
2 x weekly
30 min
Separate Location
English
Counseling Services
Group (3)
1 x weekly
30 min
Separate Location
Spanish
Parent Counseling and Training
Group
1 x monthly
60 min

TESTING ACCOMMODATIONS
Extended time (1.5x), separate location, directions read aloud.`;

  // Example check-ins so the demo shows something on every screen: the therapists
  // start late, a few sessions get skipped, and the current week is left blank.
  function buildDemoLogs(services, startISO, today) {
    const weeks = listWeeks(startISO, today);
    const months = listMonths(firstSchoolDay(startISO), today);
    const thisWeek = mondayOf(today);
    const curMonth = today.slice(0, 7);
    const W = {}, M = {};
    weeks.forEach((w, i) => {
      if (w === thisWeek) return;
      const logs = {}, reasons = {};
      services.filter(s => s.per === 'week').forEach(s => {
        const exp = expectedFor(s, w, startISO);
        if (!exp) return;
        logs[s.id] = demoValue(s, i, exp);
        // The therapists started late (therapist absent); later misses were cancellations.
        if (logs[s.id] < exp) reasons[s.id] = i <= 3 ? 'provider' : 'cancelled';
      });
      W[w] = { closed: false, logs, reasons };
    });
    months.forEach((mk, i) => {
      if (mk === curMonth) return;
      const logs = {};
      services.filter(s => s.per === 'month').forEach(s => { logs[s.id] = i === 0 ? 0 : s.freq; });
      M[mk] = logs;
    });
    return { weeks: W, months: M };
  }
  function demoValue(s, i, exp) {
    switch (s.key) {
      case 'speech': return i <= 2 ? 0 : i === 6 ? Math.max(0, exp - 1) : exp;
      case 'ot': return i <= 3 ? 0 : i === 7 ? Math.max(0, exp - 1) : exp;
      case 'counseling': return i === 4 ? 0 : exp;
      case 'setss': return i === 5 ? Math.max(0, exp - 2) : exp;
      default: return exp;
    }
  }

  return {
    LANGS, CATALOG, SAMPLE_IEP,
    parseIEP, describeService, displayName, serviceName, servicePlain, howOften,
    computeOwed, expectedFor, periodLabel, buildLetter, buildRecordsRequest, buildTherapistNote, buildDemoLogs,
    soundUnits, wordSimilarity, soundMatch, matchLevel, MATCH_GOOD,
    todayISO, listWeeks, listMonths, mondayOf, firstSchoolDay, addDays,
    longDate, weekLabel, weekTitle, monthLabel, fmtMinutes,
  };
});
