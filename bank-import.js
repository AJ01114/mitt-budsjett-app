/*
 * Leser kontoutskrifter fra nettbanken (CSV) og gjør dem om til transaksjoner.
 * Holder seg unna DOM-en med vilje, slik at logikken kan testes for seg.
 *
 * Formatene varierer mye mellom banker – Nordea bruker semikolon og komma som
 * desimaltegn, Revolut bruker komma og punktum, DNB har egne kolonner for inn
 * og ut. Derfor gjettes både skilletegn, kolonner, dato- og tallformat.
 */
const BankImport = (() => {
  /* ---------- CSV ---------- */

  /** Deler råteksten i rader og felter. Håndterer anførselstegn og felter med linjeskift. */
  function parseCsvText(text, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
        continue;
      }

      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }

    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

    return rows
      .map((r) => r.map((c) => c.trim()))
      .filter((r) => r.some((c) => c !== ''));
  }

  /** Gjetter skilletegnet ut fra hvilket som forekommer oftest i overskriftslinja. */
  function detectDelimiter(text) {
    const firstLine = text.split('\n')[0] || '';
    const counts = [';', ',', '\t', '|'].map((d) => ({
      d,
      n: firstLine.split(d).length - 1,
    }));
    counts.sort((a, b) => b.n - a.n);
    return counts[0].n > 0 ? counts[0].d : ';';
  }

  /* ---------- Tall og datoer ---------- */

  /**
   * Tolker beløp uansett om det står som "1 234,56", "1,234.56", "-412.00"
   * eller "(412)". Returnerer null når feltet ikke er et tall.
   */
  function parseAmount(raw) {
    if (raw === null || raw === undefined) return null;

    let s = String(raw).replace(/[\s ]/g, '').replace(/kr\.?|NOK/gi, '');
    if (!s) return null;

    let negative = false;
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
    if (s.startsWith('-')) { negative = true; s = s.slice(1); }
    else if (s.startsWith('+')) s = s.slice(1);
    if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }

    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');

    // Skilletegnet lengst til høyre er desimaltegnet – men bare hvis det har
    // høyst to siffer etter seg, ellers er det et tusenskilletegn.
    let decimal = null;
    if (lastComma >= 0 && lastDot >= 0) decimal = lastComma > lastDot ? ',' : '.';
    else if (lastComma >= 0) decimal = s.length - lastComma - 1 <= 2 ? ',' : null;
    else if (lastDot >= 0) decimal = s.length - lastDot - 1 <= 2 ? '.' : null;

    let cleaned;
    if (decimal) {
      const at = s.lastIndexOf(decimal);
      cleaned = s.slice(0, at).replace(/[.,]/g, '') + '.' + s.slice(at + 1);
    } else {
      cleaned = s.replace(/[.,]/g, '');
    }

    if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
    const value = Number(cleaned);
    if (!isFinite(value)) return null;
    return negative ? -value : value;
  }

  const pad = (n) => String(n).padStart(2, '0');

  /** Tolker dato og returnerer yyyy-mm-dd, eller null. */
  function parseDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    let m;

    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
      return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    }
    if ((m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/))) {
      return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    }
    if ((m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2})(?!\d)/))) {
      return `20${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    }
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
    return null;
  }

  /* ---------- Kolonner ---------- */

  /** Til sammenligning: små bokstaver uten aksenter, så «GRÜNERLØKKA» blir «grunerlokka». */
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ø/g, 'o')
      .replace(/æ/g, 'a')
      .trim();

  // Rekkefølgen er prioritert: bokføringsdato slår rentedato, "completed" slår "started".
  const DATE_COLUMNS = ['bokforingsdato', 'transaksjonsdato', 'betalingsdato', 'completed date', 'kjopsdato', 'dato', 'date', 'started date', 'valuteringsdato', 'rentedato'];
  const TEXT_COLUMNS = ['beskrivelse', 'forklaring', 'description', 'tittel', 'tekst', 'melding', 'betalingsmottaker', 'mottaker', 'navn', 'merchant', 'reference', 'referanse'];
  const AMOUNT_COLUMNS = ['belop', 'amount', 'sum', 'transaksjonsbelop'];
  const OUT_COLUMNS = ['ut fra konto', 'uttak', 'debet', 'withdrawal', 'belop ut'];
  const IN_COLUMNS = ['inn pa konto', 'innskudd', 'kredit', 'deposit', 'belop inn'];

  /** Finner kolonneindeksen som passer best – eksakt treff går foran delvis treff. */
  function findColumn(headers, candidates) {
    for (const candidate of candidates) {
      const exact = headers.findIndex((h) => h === candidate);
      if (exact >= 0) return exact;
    }
    for (const candidate of candidates) {
      const partial = headers.findIndex((h) => h.includes(candidate));
      if (partial >= 0) return partial;
    }
    return -1;
  }

  /** Alle kolonner som kan inneholde en beskrivelse, i prioritert rekkefølge. */
  function findTextColumns(headers) {
    const found = [];
    for (const candidate of TEXT_COLUMNS) {
      headers.forEach((h, i) => {
        if ((h === candidate || h.includes(candidate)) && !found.includes(i)) found.push(i);
      });
    }
    return found;
  }

  /* ---------- Selve importen ---------- */

  /**
   * Leser en kontoutskrift og returnerer
   * { transactions: [{date, text, amount, currency}], skipped, warnings }
   * Kaster Error med en forklarende tekst hvis fila ikke lar seg tolke.
   */
  function parseStatement(text) {
    if (!text || !text.trim()) throw new Error('Fila er tom.');

    const delimiter = detectDelimiter(text);
    const rows = parseCsvText(text, delimiter);
    if (rows.length < 2) throw new Error('Fant ingen rader med transaksjoner i fila.');

    const headers = rows[0].map(norm);
    const dateCol = findColumn(headers, DATE_COLUMNS);
    const textCols = findTextColumns(headers);
    const amountCol = findColumn(headers, AMOUNT_COLUMNS);
    const outCol = findColumn(headers, OUT_COLUMNS);
    const inCol = findColumn(headers, IN_COLUMNS);
    const stateCol = findColumn(headers, ['state', 'status']);
    const currencyCol = findColumn(headers, ['currency', 'valuta']);

    if (dateCol < 0) throw new Error('Fant ingen datokolonne. Er dette en kontoutskrift?');
    if (amountCol < 0 && outCol < 0 && inCol < 0) {
      throw new Error('Fant ingen beløpskolonne. Er dette en kontoutskrift?');
    }

    const transactions = [];
    const currencies = new Set();
    let skipped = 0;

    for (const row of rows.slice(1)) {
      const date = parseDate(row[dateCol]);

      let amount = null;
      if (amountCol >= 0) {
        amount = parseAmount(row[amountCol]);
      }
      if (amount === null && (outCol >= 0 || inCol >= 0)) {
        // Egne kolonner for inn og ut: uttak blir negative beløp.
        const out = outCol >= 0 ? parseAmount(row[outCol]) : null;
        const into = inCol >= 0 ? parseAmount(row[inCol]) : null;
        if (out !== null && out !== 0) amount = -Math.abs(out);
        else if (into !== null && into !== 0) amount = Math.abs(into);
      }

      if (date === null || amount === null || amount === 0) { skipped++; continue; }

      // Avviste og reverserte transaksjoner (Revolut) skal ikke telle med.
      if (stateCol >= 0) {
        const state = norm(row[stateCol]);
        if (state && !['completed', 'fullfort', 'booked', 'bokfort', 'ok'].includes(state)) {
          skipped++;
          continue;
        }
      }

      const label = textCols.map((i) => row[i]).find((v) => v && v.trim()) || 'Ukjent';
      const currency = currencyCol >= 0 ? row[currencyCol].toUpperCase() : '';
      if (currency) currencies.add(currency);

      transactions.push({
        date,
        text: label.trim(),
        amount: Math.round(amount * 100) / 100,
        currency,
      });
    }

    if (transactions.length === 0) {
      throw new Error('Fant ingen transaksjoner å importere i fila.');
    }

    const warnings = [];
    const foreign = [...currencies].filter((c) => c && c !== 'NOK');
    if (foreign.length > 0) {
      warnings.push(`Fila inneholder beløp i ${foreign.join(', ')} – disse legges inn slik de står.`);
    }

    return { transactions, skipped, warnings };
  }

  /* ---------- Kategorisering ---------- */

  // Nøkkelord knyttet til standardkategoriene. Treffer bare kategorier
  // brukeren faktisk har; egne kategorier lærer appen underveis.
  const CATEGORY_RULES = [
    { category: 'Mat og dagligvarer', keywords: ['rema', 'kiwi', 'coop', 'extra', 'meny', 'bunnpris', 'joker', 'matkroken', 'spar', 'obs', 'oda', 'holdbart', 'bakeri', 'baker', 'narvesen', 'deli de luca', '7-eleven', 'foodora', 'wolt', 'restaurant', 'pizza', 'burger', 'mcdonald', 'sushi', 'kebab', 'cafe', 'kafe', 'espresso'] },
    { category: 'Bolig og strøm', keywords: ['husleie', 'obos', 'usbl', 'tibber', 'fjordkraft', 'elvia', 'hafslund', 'fortum', 'lyse', 'glitre', 'statkraft', 'agva', 'norgesenergi', 'gjensidige', 'tryg', 'fremtind', 'storebrand', 'forsikring', 'kommunale avgifter', 'boligalarm', 'sector alarm'] },
    { category: 'Transport', keywords: ['ruter', 'vy ', 'vygruppen', 'flytoget', 'entur', 'atb', 'skyss', 'kolumbus', 'circle k', 'shell', 'esso', 'uno-x', 'unox', 'yx ', 'bilkollektivet', 'hyre', 'bolt', 'uber', 'taxi', 'bysykkel', 'voi', 'ryde', 'parkering', 'easypark', 'autopass', 'ferge', 'sas ', 'norwegian air', 'wideroe'] },
    { category: 'Abonnementer', keywords: ['netflix', 'spotify', 'hbo', 'max.com', 'disney', 'viaplay', 'skyshowtime', 'youtube', 'storytel', 'fabel', 'apple.com', 'itunes', 'google', 'microsoft', 'adobe', 'openai', 'anthropic', 'claude', 'dropbox', 'telenor', 'telia', 'ice ', 'altibox', 'strim', 'tv 2', 'schibsted', 'aftenposten', 'vg+', 'dagbladet', 'nrk'] },
    { category: 'Klær', keywords: ['h&m', 'hm ', 'zara', 'zalando', 'cubus', 'bikbok', 'bik bok', 'dressmann', 'lindex', 'kappahl', 'weekday', 'monki', 'uniqlo', 'nike', 'adidas', 'jack & jones', 'vero moda', 'skoringen', 'eurosko', 'boozt'] },
    { category: 'Fritid', keywords: ['sats', 'elixia', 'evo fitness', 'treningssenter', 'kino', 'nordisk film', 'odeon', 'steam', 'playstation', 'nintendo', 'xbox', 'vinmonopolet', 'ticketmaster', 'billettservice', 'xxl', 'sport', 'intersport', 'biltema', 'clas ohlson', 'jula', 'bokhandel', 'ark ', 'norli'] },
    { category: 'Annet', keywords: ['apotek', 'vitusapotek', 'boots', 'farmasiet', 'legevakt', 'tannlege', 'frisor', 'posten', 'postnord', 'europris', 'normal', 'nille', 'kicks', 'vitaminer'] },
  ];

  const STOP_WORDS = new Set(['as', 'asa', 'a/s', 'ab', 'ltd', 'no', 'nok', 'oslo', 'bergen', 'trondheim', 'stavanger', 'norge', 'norway', 'kjop', 'kort', 'vipps', 'betaling', 'overforing', 'til', 'fra', 'the', 'and', 'butikk', 'avd']);

  /**
   * Trekker ut et gjenkjennelig butikknavn fra transaksjonsteksten, slik at
   * "REMA 1000 STORO 12.08" og "REMA 1000 GRÜNERLØKKA" gir samme nøkkel.
   */
  function merchantKey(text) {
    const words = norm(text)
      .replace(/[*_/\\|]+/g, ' ')
      .replace(/[^a-z0-9&.\- ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !/^\d/.test(w) && !STOP_WORDS.has(w));

    if (words.length === 0) return norm(text).slice(0, 20);

    // Ett ord holder når det er langt nok til å peke ut kjeden («rema», «kiwi»).
    // Korte navn som «vy» trenger ordet etter for å bli entydige.
    return words[0].length >= 4 ? words[0] : words.slice(0, 2).join(' ');
  }

  /** Matcher korte nøkkelord på ordgrense for å unngå tilfeldige treff inni andre ord. */
  function matchesKeyword(haystack, keyword) {
    const k = norm(keyword).trim();
    if (!k) return false;
    if (k.length >= 5 || k.includes(' ')) return haystack.includes(k);
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-zæøå0-9])${escaped}([^a-zæøå0-9]|$)`).test(haystack);
  }

  /**
   * Foreslår kategori-id for en transaksjon. Regler brukeren har lært appen
   * (nøkkel -> kategori-id) går foran de innebygde nøkkelordene.
   */
  function suggestCategory(text, categories, learnedRules = {}) {
    const haystack = norm(text);

    const learned = learnedRules[merchantKey(text)];
    if (learned && categories.some((c) => c.id === learned)) return learned;

    for (const rule of CATEGORY_RULES) {
      if (!rule.keywords.some((k) => matchesKeyword(haystack, k))) continue;
      const category = categories.find((c) => norm(c.name) === norm(rule.category));
      if (category) return category.id;
    }
    return null;
  }

  /** Nøkkel som identifiserer en transaksjon på tvers av importer. */
  function importKey(transaction) {
    return `${transaction.date}|${transaction.amount}|${merchantKey(transaction.text)}`;
  }

  return {
    parseStatement,
    parseAmount,
    parseDate,
    parseCsvText,
    detectDelimiter,
    suggestCategory,
    merchantKey,
    importKey,
    CATEGORY_RULES,
  };
})();

if (typeof module !== 'undefined') module.exports = BankImport;
