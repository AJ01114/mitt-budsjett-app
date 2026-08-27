/*
 * Diagrammene, tegnet som SVG uten noe bibliotek. Fargene hentes fra CSS-
 * variabler, så lys og mørk modus følger resten av appen.
 *
 * Farger etter jobb: forbruk per kategori er magnitude (én blå hue), delen
 * som ligger over budsjett er status (rød, alltid sammen med ordet «over»),
 * og inn/ut er to serier som skal skilles fra hverandre (blå og oransje).
 */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function node(tag, attrs = {}) {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      element.setAttribute(key, String(value));
    }
    return element;
  }

  function text(content, attrs) {
    const element = node('text', attrs);
    element.textContent = content;
    return element;
  }

  /** Tooltip på et enkelt merke – nettleserens egen, uten ekstra maskineri. */
  function tip(element, label) {
    const title = node('title');
    title.textContent = label;
    element.append(title);
    return element;
  }

  function frame(width, height, label) {
    const svg = node('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width: '100%',
      height: 'auto',
      role: 'img',
      'aria-label': label,
      class: 'chart',
    });
    return svg;
  }

  /** Stolpe med avrundet dataende og flat fot mot grunnlinja. */
  function barPathH(x, y, w, h, r = 4) {
    if (w <= 0.5) return '';
    const rr = Math.max(0, Math.min(r, w, h / 2));
    return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} H${x} Z`;
  }

  function barPathV(x, yTop, w, h, r = 4) {
    if (h <= 0.5) return '';
    const rr = Math.max(0, Math.min(r, h, w / 2));
    const bottom = yTop + h;
    return `M${x},${bottom} V${yTop + rr} Q${x},${yTop} ${x + rr},${yTop} H${x + w - rr} Q${x + w},${yTop} ${x + w},${yTop + rr} V${bottom} Z`;
  }

  const kort = (s, maks) => (s.length > maks ? `${s.slice(0, maks - 1)}…` : s);

  /** Pen øvre grense på aksen: 1, 2 eller 5 ganger en tierpotens. */
  function niceMax(value) {
    if (value <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(value)));
    for (const step of [1, 2, 2.5, 5, 10]) {
      if (value <= step * exp) return step * exp;
    }
    return 10 * exp;
  }

  const kompakt = (v) =>
    Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v));

  /* ---------- Forbruk per kategori ---------- */

  /**
   * Liggende stolper, størst først. Blått fram til budsjettet, rødt for det
   * som ligger over, med en markør der budsjettet går.
   */
  function categoryBars(items, fmt) {
    const rows = items.filter((c) => c.spent > 0);
    if (rows.length === 0) return tomtDiagram('Ingen utgifter å vise ennå.');

    const W = 560;
    const rowH = 34;
    const barH = 13;
    const labelW = 148;
    const valueW = 96;
    const plotX = labelW;
    const plotW = W - labelW - valueW;
    const H = rows.length * rowH + 8;

    const maks = niceMax(Math.max(...rows.map((c) => Math.max(c.spent, c.budget))));
    const svg = frame(W, H, 'Forbruk per kategori denne måneden');

    rows.forEach((c, i) => {
      const y = i * rowH + 8;
      const barY = y + 3;

      svg.append(
        text(kort(c.name, 20), {
          x: labelW - 10,
          y: barY + barH - 2,
          'text-anchor': 'end',
          class: 'chart-label',
        })
      );

      // Sporet bak stolpen viser hvor mye plass budsjettet tar.
      svg.append(
        node('rect', { x: plotX, y: barY, width: plotW, height: barH, rx: 4, class: 'chart-track' })
      );

      const innenfor = c.budget > 0 ? Math.min(c.spent, c.budget) : c.spent;
      const wInnenfor = (innenfor / maks) * plotW;
      const bar = node('path', { d: barPathH(plotX, barY, wInnenfor, barH), class: 'chart-fill-1' });
      svg.append(tip(bar, `${c.name}: ${fmt(c.spent)}`));

      if (c.over) {
        // 2px luft mellom de to delene, så overskridelsen leses som sin egen bit.
        const xOver = plotX + wInnenfor + 2;
        const wOver = Math.max(((c.spent - c.budget) / maks) * plotW - 2, 1);
        svg.append(
          tip(
            node('path', { d: barPathH(xOver, barY, wOver, barH), class: 'chart-fill-over' }),
            `${fmt(c.spent - c.budget)} over budsjettet på ${fmt(c.budget)}`
          )
        );
      } else if (c.budget > 0) {
        const xTarget = plotX + (c.budget / maks) * plotW;
        svg.append(
          tip(
            node('line', {
              x1: xTarget,
              x2: xTarget,
              y1: barY - 4,
              y2: barY + barH + 4,
              class: 'chart-target',
            }),
            `Budsjett: ${fmt(c.budget)}`
          )
        );
      }

      svg.append(
        text(c.over ? `${fmt(c.spent)} over` : fmt(c.spent), {
          x: W,
          y: barY + barH - 2,
          'text-anchor': 'end',
          class: c.over ? 'chart-value over' : 'chart-value',
        })
      );
    });

    return svg;
  }

  /* ---------- Inn og ut per måned ---------- */

  function incomeVsSpending(months, fmt) {
    if (months.length === 0) return tomtDiagram('Ingen måneder å sammenligne ennå.');

    const W = 560;
    const H = 210;
    const padT = 12;
    const padB = 26;
    const padL = 42;
    const padR = 8;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const maks = niceMax(Math.max(1, ...months.flatMap((m) => [m.income, m.outgoing])));
    const svg = frame(W, H, 'Inntekt og utgifter per måned');

    // Grunnlinje og to hjelpelinjer – tilbaketrukne med vilje.
    for (const andel of [0, 0.5, 1]) {
      const y = padT + plotH - andel * plotH;
      svg.append(
        node('line', {
          x1: padL,
          x2: W - padR,
          y1: y,
          y2: y,
          class: andel === 0 ? 'chart-baseline' : 'chart-grid',
        })
      );
      svg.append(
        text(kompakt(maks * andel), {
          x: padL - 8,
          y: y + 4,
          'text-anchor': 'end',
          class: 'chart-tick',
        })
      );
    }

    const slotW = plotW / months.length;
    const barW = Math.min(16, (slotW - 8) / 2);

    months.forEach((m, i) => {
      const midt = padL + slotW * (i + 0.5);
      const xInn = midt - barW - 1;
      const xUt = midt + 1;

      const hInn = (m.income / maks) * plotH;
      const hUt = (m.outgoing / maks) * plotH;

      svg.append(
        tip(
          node('path', {
            d: barPathV(xInn, padT + plotH - hInn, barW, hInn),
            class: 'chart-fill-1',
          }),
          `${m.longLabel} – inn: ${fmt(m.income)}`
        )
      );
      svg.append(
        tip(
          node('path', { d: barPathV(xUt, padT + plotH - hUt, barW, hUt), class: 'chart-fill-2' }),
          `${m.longLabel} – ut: ${fmt(m.outgoing)}`
        )
      );

      svg.append(
        text(m.label, { x: midt, y: H - 8, 'text-anchor': 'middle', class: 'chart-tick' })
      );
    });

    return svg;
  }

  /* ---------- Oppspart over tid ---------- */

  function savingsArea(rows, fmt) {
    const punkter = rows.filter((r) => r.cumulative > 0 || r.saved > 0);
    if (punkter.length === 0) return tomtDiagram('Ingen sparing registrert ennå.');

    const W = 560;
    const H = 200;
    const padT = 16;
    const padB = 26;
    const padL = 46;
    const padR = 56;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const maks = niceMax(Math.max(1, ...rows.map((r) => r.cumulative)));
    const svg = frame(W, H, 'Oppspart beløp over tid');

    for (const andel of [0, 0.5, 1]) {
      const y = padT + plotH - andel * plotH;
      svg.append(
        node('line', {
          x1: padL,
          x2: W - padR,
          y1: y,
          y2: y,
          class: andel === 0 ? 'chart-baseline' : 'chart-grid',
        })
      );
      svg.append(
        text(kompakt(maks * andel), {
          x: padL - 8,
          y: y + 4,
          'text-anchor': 'end',
          class: 'chart-tick',
        })
      );
    }

    const steg = rows.length > 1 ? plotW / (rows.length - 1) : 0;
    const xFor = (i) => (rows.length > 1 ? padL + i * steg : padL + plotW / 2);
    const yFor = (v) => padT + plotH - (v / maks) * plotH;

    const linje = rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(r.cumulative)}`).join(' ');
    const areal = `${linje} L${xFor(rows.length - 1)},${padT + plotH} L${xFor(0)},${padT + plotH} Z`;

    svg.append(node('path', { d: areal, class: 'chart-area' }));
    svg.append(node('path', { d: linje, class: 'chart-line', fill: 'none' }));

    rows.forEach((r, i) => {
      svg.append(
        tip(
          node('circle', { cx: xFor(i), cy: yFor(r.cumulative), r: 4, class: 'chart-dot' }),
          `${r.longLabel}: ${fmt(r.cumulative)} oppspart`
        )
      );
      svg.append(
        text(r.label, { x: xFor(i), y: H - 8, 'text-anchor': 'middle', class: 'chart-tick' })
      );
    });

    // Bare siste punkt får tall på seg – resten ligger i tabellen under.
    const siste = rows[rows.length - 1];
    svg.append(
      text(fmt(siste.cumulative), {
        x: Math.min(xFor(rows.length - 1) + 10, W - 4),
        y: yFor(siste.cumulative) + 4,
        class: 'chart-value',
      })
    );

    return svg;
  }

  function tomtDiagram(melding) {
    const svg = frame(560, 60, melding);
    svg.append(
      text(melding, { x: 280, y: 34, 'text-anchor': 'middle', class: 'chart-empty' })
    );
    return svg;
  }

  return { categoryBars, incomeVsSpending, savingsArea };
})();

if (typeof module !== 'undefined') module.exports = Charts;
