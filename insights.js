/*
 * Regner ut tallene bak Innsikt- og Sparing-fanene: månedssummer, utvikling
 * over tid, sparetabell og de konkrete rådene. Ingen DOM her – bare tall inn
 * og tall ut, så logikken kan testes for seg.
 */
const Insights = (() => {
  const shortMonth = new Intl.DateTimeFormat('nb-NO', { month: 'short', year: '2-digit' });
  const longMonth = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' });

  const sum = (list) => list.reduce((a, b) => a + b, 0);

  function monthDate(key) {
    const [year, mon] = key.split('-').map(Number);
    return new Date(year, mon - 1, 1);
  }

  function shortLabel(key) {
    return shortMonth.format(monthDate(key)).replace('.', '');
  }

  function longLabel(key) {
    return longMonth.format(monthDate(key));
  }

  function shiftMonth(key, delta) {
    const [year, mon] = key.split('-').map(Number);
    const date = new Date(year, mon - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  const goalIds = (state) => new Set(state.categories.filter((c) => c.goal).map((c) => c.id));

  /* ---------- Månedssummer ---------- */

  /**
   * Alt som er ført ut regnes som «ut» – også overføringer til sparing, slik at
   * netto stemmer med det som faktisk forsvinner fra kontoen. Hvor mye av det
   * som var sparing ligger i `saved`.
   */
  function monthSummary(state, key) {
    const m = state.months[key] || { income: [], budgets: {}, expenses: [] };
    const goals = goalIds(state);

    let spent = 0;
    let saved = 0;
    for (const e of m.expenses) {
      if (goals.has(e.categoryId)) saved += e.amount;
      else spent += e.amount;
    }

    const income = sum(m.income.map((i) => i.amount));
    const outgoing = spent + saved;

    return {
      key,
      label: shortLabel(key),
      longLabel: longLabel(key),
      income,
      spent,
      saved,
      outgoing,
      net: income - outgoing,
      goalTarget: sum(state.categories.filter((c) => c.goal).map((c) => m.budgets[c.id] || 0)),
    };
  }

  /** Månedene det finnes tall for, eldste først. */
  function monthsWithData(state) {
    return Object.keys(state.months)
      .filter((k) => {
        const m = state.months[k];
        return m.income.length > 0 || m.expenses.length > 0;
      })
      .sort();
  }

  /**
   * De siste `count` månedene fram til og med `key` – også de tomme, slik at
   * en måned uten registreringer synes som et hull i utviklingen.
   */
  function recentMonths(state, key, count = 6) {
    const withData = monthsWithData(state);
    const earliest = withData.length ? withData[0] : key;

    const keys = [];
    for (let i = count - 1; i >= 0; i--) {
      const k = shiftMonth(key, -i);
      if (k >= earliest || k === key) keys.push(k);
    }
    return keys.map((k) => monthSummary(state, k));
  }

  /* ---------- Kategorier ---------- */

  /** Forbruket per utgiftskategori i én måned, størst først. Mål holdes utenfor. */
  function categoryBreakdown(state, key) {
    const m = state.months[key] || { budgets: {}, expenses: [] };

    return state.categories
      .filter((c) => !c.goal)
      .map((c) => {
        const spent = sum(m.expenses.filter((e) => e.categoryId === c.id).map((e) => e.amount));
        const budget = m.budgets[c.id] || 0;
        return { id: c.id, name: c.name, spent, budget, over: budget > 0 && spent > budget };
      })
      .filter((c) => c.spent > 0 || c.budget > 0)
      .sort((a, b) => b.spent - a.spent);
  }

  /** Forbruk uten kategori – utgifter som mistet kategorien sin. */
  function uncategorised(state, key) {
    const m = state.months[key] || { expenses: [] };
    const known = new Set(state.categories.map((c) => c.id));
    return sum(m.expenses.filter((e) => !known.has(e.categoryId)).map((e) => e.amount));
  }

  /** De største enkeltutgiftene i måneden. */
  function topExpenses(state, key, count = 5) {
    const m = state.months[key] || { expenses: [] };
    return [...m.expenses]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, count)
      .map((e) => ({
        amount: e.amount,
        note: e.note || state.categories.find((c) => c.id === e.categoryId)?.name || 'Utgift',
        date: e.date,
      }));
  }

  /* ---------- Sparing ---------- */

  /** Én rad per måned: mål, spart, avvik og hvor mye som har hopet seg opp. */
  function savingsRows(state, key, count = 12) {
    const withData = monthsWithData(state);
    const start = withData.length ? withData[0] : key;

    const keys = [];
    let k = start;
    while (k <= key) {
      keys.push(k);
      k = shiftMonth(k, 1);
    }
    const trimmed = keys.slice(-count);

    // Det som ble spart før utsnittet teller med i den oppsamlede summen.
    let running = sum(
      keys.slice(0, keys.length - trimmed.length).map((mk) => monthSummary(state, mk).saved)
    );

    return trimmed.map((mk) => {
      const s = monthSummary(state, mk);
      running += s.saved;
      return {
        key: mk,
        label: s.label,
        longLabel: s.longLabel,
        target: s.goalTarget,
        saved: s.saved,
        diff: s.saved - s.goalTarget,
        reached: s.goalTarget > 0 && s.saved >= s.goalTarget,
        cumulative: running,
        rate: s.income > 0 ? s.saved / s.income : null,
      };
    });
  }

  /** Snitt av de siste månedene med tall, brukt til å anslå et år fram. */
  function savingsForecast(state, key, months = 3) {
    const rows = savingsRows(state, key, 24).filter((r) => r.saved > 0 || r.target > 0);
    if (rows.length === 0) return null;

    const siste = rows.slice(-months);
    const average = sum(siste.map((r) => r.saved)) / siste.length;
    const total = rows.length ? rows[rows.length - 1].cumulative : 0;

    return {
      average,
      months: siste.length,
      perYear: average * 12,
      total,
      inTwelveMonths: total + average * 12,
    };
  }

  /* ---------- Tempo ---------- */

  /**
   * Hvor måneden ender om forbruket fortsetter i samme takt. Gir null for
   * måneder som ikke er inneværende, eller når det er for tidlig til å si noe.
   */
  function pace(state, key, todayIso) {
    if (todayIso.slice(0, 7) !== key) return null;

    const day = Number(todayIso.slice(8, 10));
    const [year, mon] = key.split('-').map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    if (day < 5 || day >= daysInMonth) return null;

    const factor = daysInMonth / day;
    const summary = monthSummary(state, key);

    return {
      day,
      daysInMonth,
      projectedSpent: Math.round(summary.spent * factor),
      categories: categoryBreakdown(state, key)
        .filter((c) => c.budget > 0 && c.spent > 0)
        .map((c) => ({ ...c, projected: Math.round(c.spent * factor) }))
        .filter((c) => c.projected > c.budget && c.spent <= c.budget)
        .sort((a, b) => b.projected - b.budget - (a.projected - a.budget)),
    };
  }

  /* ---------- Råd ---------- */

  /**
   * Konkrete funn, mest alvorlige først. Hvert råd har et nivå som styrer
   * ikon og farge – aldri farge alene.
   */
  function advice(state, key, todayIso) {
    const out = [];
    const now = monthSummary(state, key);
    const prevKey = shiftMonth(key, -1);
    const harForrige = Boolean(state.months[prevKey]);
    const prev = harForrige ? monthSummary(state, prevKey) : null;
    const breakdown = categoryBreakdown(state, key);

    // Bruker mer enn det kommer inn
    if (now.income > 0 && now.outgoing > now.income) {
      out.push({
        level: 'critical',
        title: 'Du bruker mer enn du får inn',
        text: `${fmt(now.outgoing)} ut mot ${fmt(now.income)} inn – ${fmt(now.outgoing - now.income)} mer enn du har.`,
        action: 'Se på de største kategoriene under og finn ett beløp å kutte.',
      });
    }

    // Kategorier over budsjett
    const over = breakdown.filter((c) => c.over);
    if (over.length > 0) {
      const verst = over[0];
      out.push({
        level: 'critical',
        title:
          over.length === 1
            ? `${verst.name} er over budsjett`
            : `${over.length} kategorier er over budsjett`,
        text: over
          .slice(0, 3)
          .map((c) => `${c.name}: ${fmt(c.spent - c.budget)} over`)
          .join(' · '),
        action: `Enten kutte forbruket, eller sette et budsjett som stemmer med virkeligheten.`,
      });
    }

    // Tempo: på vei til å sprekke
    const tempo = pace(state, key, todayIso);
    if (tempo && tempo.categories.length > 0) {
      const c = tempo.categories[0];
      out.push({
        level: 'warning',
        title: `${c.name} ligger an til å sprekke`,
        text: `${fmt(c.spent)} brukt på ${tempo.day} dager. I samme takt ender måneden på ${fmt(c.projected)} – ${fmt(c.projected - c.budget)} over budsjettet på ${fmt(c.budget)}.`,
        action: `Det tilsvarer ${fmt(Math.round((c.budget - c.spent) / (tempo.daysInMonth - tempo.day)))} per dag resten av måneden.`,
      });
    }

    // Forbruk uten budsjett
    const utenBudsjett = breakdown.filter((c) => c.budget === 0 && c.spent > 0);
    if (utenBudsjett.length > 0) {
      const total = sum(utenBudsjett.map((c) => c.spent));
      out.push({
        level: 'warning',
        title: 'Forbruk uten budsjett',
        text: `${fmt(total)} er brukt i ${utenBudsjett.length} ${
          utenBudsjett.length === 1 ? 'kategori' : 'kategorier'
        } uten beløp: ${utenBudsjett.slice(0, 3).map((c) => c.name).join(', ')}.`,
        action: 'Sett et beløp på dem – uten et tak vet du ikke om det er mye eller lite.',
      });
    }

    // Utgifter som mistet kategorien sin
    const ukjent = uncategorised(state, key);
    if (ukjent > 0) {
      out.push({
        level: 'warning',
        title: 'Utgifter uten kategori',
        text: `${fmt(ukjent)} er ikke plassert i noen kategori og telles ikke med i noe budsjett.`,
        action: 'Slett dem eller legg dem inn på nytt med kategori.',
      });
    }

    // Kategorier som øker flere måneder på rad
    for (const stigning of risingCategories(state, key)) {
      out.push({
        level: 'warning',
        title: `${stigning.name} har økt ${stigning.months} måneder på rad`,
        text: stigning.values.map((v) => fmt(v)).join(' → '),
        action: 'Verdt å sjekke om noe har sneket seg inn – særlig faste trekk.',
      });
    }

    // Sparing
    if (now.goalTarget > 0 && now.saved < now.goalTarget) {
      out.push({
        level: 'warning',
        title: 'Sparemålet er ikke nådd',
        text: `${fmt(now.saved)} spart av ${fmt(now.goalTarget)} – ${fmt(now.goalTarget - now.saved)} igjen.`,
        action:
          now.net > 0
            ? `Du har ${fmt(now.net)} igjen denne måneden som kan gå rett til sparing.`
            : 'Det er ikke noe igjen å spare av denne måneden – se på kategoriene over.',
      });
    } else if (now.goalTarget > 0 && now.saved >= now.goalTarget) {
      out.push({
        level: 'good',
        title: 'Sparemålet er nådd',
        text: `${fmt(now.saved)} spart mot et mål på ${fmt(now.goalTarget)}.`,
      });
    }

    // Sparerate
    if (now.income > 0) {
      const rate = now.saved / now.income;
      if (rate < 0.1) {
        out.push({
          level: 'warning',
          title: `Du sparer ${Math.round(rate * 100)} % av inntekten`,
          text: 'En vanlig tommelfingerregel er 10–20 %.',
          action: `10 % ville vært ${fmt(Math.round(now.income * 0.1))} i måneden.`,
        });
      } else {
        out.push({
          level: 'good',
          title: `Du sparer ${Math.round(rate * 100)} % av inntekten`,
          text: `${fmt(now.saved)} av ${fmt(now.income)}.`,
        });
      }
    }

    // Sammenlignet med forrige måned
    if (prev && prev.spent > 0 && now.spent > 0) {
      const endring = (now.spent - prev.spent) / prev.spent;
      if (endring <= -0.05) {
        out.push({
          level: 'good',
          title: `Forbruket er ned ${Math.abs(Math.round(endring * 100))} % fra forrige måned`,
          text: `${fmt(now.spent)} mot ${fmt(prev.spent)} i ${prev.longLabel}.`,
        });
      } else if (endring >= 0.15) {
        out.push({
          level: 'serious',
          title: `Forbruket er opp ${Math.round(endring * 100)} % fra forrige måned`,
          text: `${fmt(now.spent)} mot ${fmt(prev.spent)} i ${prev.longLabel}.`,
          action: 'Sammenlign kategoriene i diagrammet over for å se hvor økningen ligger.',
        });
      }
    }

    const rang = { critical: 0, serious: 1, warning: 2, good: 3 };
    return out.sort((a, b) => rang[a.level] - rang[b.level]);
  }

  /** Kategorier som har økt tre måneder eller mer på rad. */
  function risingCategories(state, key, minMonths = 3) {
    const keys = [];
    for (let i = minMonths - 1; i >= 0; i--) keys.push(shiftMonth(key, -i));
    if (!keys.every((k) => state.months[k])) return [];

    const treff = [];
    for (const cat of state.categories) {
      if (cat.goal) continue;
      const values = keys.map((k) =>
        sum(state.months[k].expenses.filter((e) => e.categoryId === cat.id).map((e) => e.amount))
      );
      if (values[0] <= 0) continue;

      let stiger = true;
      for (let i = 1; i < values.length; i++) {
        if (values[i] <= values[i - 1]) stiger = false;
      }
      if (stiger) treff.push({ name: cat.name, months: values.length, values });
    }
    return treff;
  }

  /** Hele kroner med mellomrom – «12 400 kr». */
  function fmt(amount) {
    return `${Math.round(amount).toLocaleString('nb-NO').replace(/ /g, ' ')} kr`;
  }

  return {
    monthSummary,
    monthsWithData,
    recentMonths,
    categoryBreakdown,
    uncategorised,
    topExpenses,
    savingsRows,
    savingsForecast,
    pace,
    advice,
    risingCategories,
    shortLabel,
    longLabel,
    shiftMonth,
    fmt,
  };
})();

if (typeof module !== 'undefined') module.exports = Insights;
