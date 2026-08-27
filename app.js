/* Mitt budsjett – enkel månedsbudsjettering. All data lagres i localStorage. */

const STORAGE_KEY = 'mitt-budsjett-v1';

// Kategorier er enten utgiftsposter man vil holde seg under, eller mål man
// vil komme over – som sparing. De to snur fargene i forhold til hverandre.
const DEFAULT_CATEGORIES = [
  { name: 'Mat og dagligvarer' },
  { name: 'Bolig og strøm' },
  { name: 'Transport' },
  { name: 'Abonnementer' },
  { name: 'Klær' },
  { name: 'Fritid' },
  { name: 'Sparing', goal: true },
  { name: 'Annet' },
];

const kr = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
});

const monthName = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' });

/* ---------- State ---------- */

let state = load();
let currentMonth = monthKey(new Date());
/** Hvilken måned som var «i dag» sist vi sjekket – brukes til å oppdage månedsskifte. */
let shownToday = currentMonth;

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Dagens dato som yyyy-mm-dd i lokal tid (toISOString ville brukt UTC). */
function todayIso() {
  const now = new Date();
  return `${monthKey(now)}-${String(now.getDate()).padStart(2, '0')}`;
}

function emptyMonth() {
  return { income: [], budgets: {}, expenses: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.categories) && parsed.months) return migrate(parsed);
    }
  } catch (err) {
    console.warn('Kunne ikke lese lagret data:', err);
  }
  return {
    categories: DEFAULT_CATEGORIES.map((c) => ({ id: newId(), name: c.name, goal: c.goal === true })),
    accounts: [],
    importRules: {},
    months: {},
  };
}

/** Fyller inn felter som mangler i data lagret av eldre versjoner. */
function migrate(data) {
  if (!Array.isArray(data.accounts)) data.accounts = [];
  if (!data.importRules || typeof data.importRules !== 'object') data.importRules = {};

  // Kategorier fra tidligere versjoner mangler goal-flagget. Sparing er et mål
  // man vil over, ikke en utgift man vil under – resten er utgifter.
  for (const category of data.categories) {
    if (typeof category.goal !== 'boolean') {
      category.goal = /sparing|sparekonto|spare/i.test(category.name);
    }
  }
  return data;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Henter måneden vi ser på, og oppretter den om den ikke finnes. */
function month() {
  if (!state.months[currentMonth]) state.months[currentMonth] = emptyMonth();
  return state.months[currentMonth];
}

function shiftMonth(key, delta) {
  const [year, mon] = key.split('-').map(Number);
  const date = new Date(year, mon - 1 + delta, 1);
  return monthKey(date);
}

/* ---------- Utregninger ---------- */

function totalIncome() {
  return month().income.reduce((sum, i) => sum + i.amount, 0);
}

function totalBudget() {
  return state.categories.reduce((sum, c) => sum + (month().budgets[c.id] || 0), 0);
}

function totalSpent() {
  return month().expenses.reduce((sum, e) => sum + e.amount, 0);
}

function spentInCategory(categoryId) {
  return month().expenses
    .filter((e) => e.categoryId === categoryId)
    .reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Saldo på en konto: startsaldoen pluss alle inntekter inn, minus alle
 * utgifter ut – på tvers av alle måneder, ikke bare den vi ser på.
 */
function accountBalance(account) {
  let balance = account.startBalance;
  for (const m of Object.values(state.months)) {
    for (const income of m.income) {
      if (income.accountId === account.id) balance += income.amount;
    }
    for (const expense of m.expenses) {
      if (expense.accountId === account.id) balance -= expense.amount;
    }
  }
  return balance;
}

function totalBalance() {
  return state.accounts.reduce((sum, a) => sum + accountBalance(a), 0);
}

/** Antall bevegelser på kontoen – vises som liten undertekst. */
function accountMovements(accountId) {
  let count = 0;
  for (const m of Object.values(state.months)) {
    count += m.income.filter((i) => i.accountId === accountId).length;
    count += m.expenses.filter((e) => e.accountId === accountId).length;
  }
  return count;
}

/* ---------- Rendering ---------- */

const $ = (id) => document.getElementById(id);

function render() {
  const [year, mon] = currentMonth.split('-').map(Number);
  $('month-label').textContent = monthName.format(new Date(year, mon - 1, 1));

  renderSummary();
  renderAccounts();
  renderAccountOptions();
  renderIncome();
  renderCategories();
  renderCategoryOptions();
  renderExpenses();
  renderInsights();
  renderSavings();
}

/* ---------- Faner ---------- */

function setTab(name) {
  for (const button of document.querySelectorAll('.tab')) {
    const valgt = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(valgt));
    $(`tab-${button.dataset.tab}`).hidden = !valgt;
  }
}

for (const button of document.querySelectorAll('.tab')) {
  button.addEventListener('click', () => setTab(button.dataset.tab));
}

/* ---------- Innsikt ---------- */

function renderInsights() {
  renderAdvice();

  const kategorier = Insights.categoryBreakdown(state, currentMonth);
  $('chart-categories').replaceChildren(Charts.categoryBars(kategorier, kr.format));

  const maaneder = Insights.recentMonths(state, currentMonth, 6);
  $('chart-months').replaceChildren(Charts.incomeVsSpending(maaneder, kr.format));

  buildTable(
    $('months-table'),
    ['Måned', 'Inn', 'Ut', 'Netto'],
    maaneder.map((m) => [
      { text: m.longLabel },
      { text: kr.format(m.income) },
      { text: kr.format(m.outgoing) },
      { text: kr.format(m.net), class: m.net < 0 ? 'neg' : 'pos' },
    ])
  );

  const storste = Insights.topExpenses(state, currentMonth, 5);
  const liste = $('top-expenses');
  liste.replaceChildren();
  if (storste.length === 0) {
    liste.append(el('li', { class: 'empty', text: 'Ingen utgifter denne måneden.' }));
  } else {
    for (const e of storste) {
      const li = el('li');
      const info = el('div', { class: 'grow' });
      info.append(el('span', { class: 'title', text: e.note }));
      info.append(el('span', { class: 'sub', text: formatDate(e.date) }));
      li.append(info, el('span', { class: 'amount', text: kr.format(e.amount) }));
      liste.append(li);
    }
  }
}

const ADVICE_ICONS = { critical: '🛑', serious: '⚠️', warning: '⚠️', good: '✅' };

function renderAdvice() {
  const list = $('advice-list');
  list.replaceChildren();

  const rad = Insights.advice(state, currentMonth, todayIso());
  if (rad.length === 0) {
    list.append(
      el('li', {
        class: 'empty',
        text: 'Legg inn inntekt, budsjett og noen utgifter, så kommer rådene her.',
      })
    );
    return;
  }

  for (const item of rad) {
    const li = el('li', { class: item.level });
    li.append(el('span', { class: 'advice-icon', text: ADVICE_ICONS[item.level] }));
    li.append(el('span', { class: 'advice-title', text: item.title }));
    li.append(el('span', { class: 'advice-text', text: item.text }));
    if (item.action) li.append(el('span', { class: 'advice-action', text: item.action }));
    list.append(li);
  }
}

/* ---------- Sparing ---------- */

function renderSavings() {
  const rader = Insights.savingsRows(state, currentMonth, 12);
  const prognose = Insights.savingsForecast(state, currentMonth);
  const nadd = rader.filter((r) => r.reached).length;
  const medMal = rader.filter((r) => r.target > 0).length;

  const stats = $('savings-stats');
  stats.replaceChildren();
  statTile(stats, 'Oppspart totalt', kr.format(prognose ? prognose.total : 0), true);
  statTile(stats, 'Snitt per måned', kr.format(prognose ? Math.round(prognose.average) : 0));
  statTile(stats, 'Mål nådd', medMal ? `${nadd} av ${medMal}` : '–');
  statTile(
    stats,
    'Spart siste 12 mnd',
    kr.format(rader.reduce((sum, r) => sum + r.saved, 0))
  );

  $('chart-savings').replaceChildren(Charts.savingsArea(rader, kr.format));

  buildTable(
    $('savings-table'),
    ['Måned', 'Mål', 'Spart', 'Avvik', 'Oppspart'],
    rader.map((r) => [
      { text: r.longLabel },
      { text: r.target > 0 ? kr.format(r.target) : '–' },
      { text: kr.format(r.saved) },
      {
        text: r.target > 0 ? `${r.diff >= 0 ? '+' : '−'}${kr.format(Math.abs(r.diff))}` : '–',
        class: r.target > 0 ? (r.diff >= 0 ? 'pos' : 'neg') : '',
      },
      { text: kr.format(r.cumulative) },
    ]),
    rader.length
      ? [
          { text: 'Sum' },
          { text: '' },
          { text: kr.format(rader.reduce((sum, r) => sum + r.saved, 0)) },
          { text: '' },
          { text: kr.format(rader[rader.length - 1].cumulative) },
        ]
      : null
  );

  $('savings-forecast').textContent = prognose
    ? `Snittet de siste ${prognose.months} ${
        prognose.months === 1 ? 'måneden' : 'månedene'
      } er ${kr.format(Math.round(prognose.average))} i måneden. Holder du det tempoet, står det ${kr.format(
        Math.round(prognose.inTwelveMonths)
      )} om ett år.`
    : 'Sett et sparemål og før opp en overføring, så regner appen ut tempoet ditt her.';
}

function statTile(parent, label, value, highlight = false) {
  const div = el('div', { class: highlight ? 'stat highlight' : 'stat' });
  div.append(el('span', { class: 'stat-label', text: label }));
  div.append(el('span', { class: 'stat-value', text: value }));
  parent.append(div);
}

/** Bygger en tabell fra overskrifter og rader med {text, class}. */
function buildTable(table, headers, rows, footer = null) {
  table.replaceChildren();

  const thead = el('thead');
  const headRow = el('tr');
  for (const h of headers) headRow.append(el('th', { text: h }));
  thead.append(headRow);

  const tbody = el('tbody');
  if (rows.length === 0) {
    const tr = el('tr');
    const td = el('td', { text: 'Ingen tall ennå.' });
    td.colSpan = headers.length;
    tr.append(td);
    tbody.append(tr);
  } else {
    for (const row of rows) {
      const tr = el('tr');
      for (const cell of row) tr.append(el('td', { class: cell.class || '', text: cell.text }));
      tbody.append(tr);
    }
  }

  table.append(thead, tbody);

  if (footer) {
    const tfoot = el('tfoot');
    const tr = el('tr');
    for (const cell of footer) tr.append(el('td', { class: cell.class || '', text: cell.text }));
    tfoot.append(tr);
    table.append(tfoot);
  }
}

function renderSummary() {
  const income = totalIncome();
  const spent = totalSpent();
  const left = income - spent;

  $('sum-income').textContent = kr.format(income);
  $('sum-budget').textContent = kr.format(totalBudget());
  $('sum-spent').textContent = kr.format(spent);

  const leftEl = $('sum-left');
  leftEl.textContent = kr.format(left);
  leftEl.classList.toggle('negative', left < 0);
  leftEl.classList.toggle('positive', left >= 0 && income > 0);

  const balance = totalBalance();
  const balanceEl = $('sum-balance');
  balanceEl.textContent = state.accounts.length ? kr.format(balance) : '–';
  balanceEl.classList.toggle('negative', state.accounts.length > 0 && balance < 0);
}

function renderAccounts() {
  const list = $('account-list');
  list.replaceChildren();

  if (state.accounts.length === 0) {
    list.append(el('li', { class: 'empty', text: 'Ingen kontoer lagt inn ennå.' }));
    return;
  }

  for (const account of state.accounts) {
    const balance = accountBalance(account);
    const movements = accountMovements(account.id);

    const li = el('li', { class: 'account' });

    const info = el('div', { class: 'grow' });
    info.append(el('span', { class: 'account-name', text: account.name }));
    info.append(
      el('span', {
        class: 'account-sub',
        text: `Start ${kr.format(account.startBalance)} · ${movements} ${
          movements === 1 ? 'bevegelse' : 'bevegelser'
        }`,
      })
    );

    const balanceEl = el('span', { class: 'balance', text: kr.format(balance) });
    balanceEl.classList.toggle('negative', balance < 0);

    li.append(
      info,
      balanceEl,
      deleteButton(
        `Slett kontoen «${account.name}»? Inntektene og utgiftene blir stående, men uten konto.`,
        () => {
          state.accounts = state.accounts.filter((a) => a.id !== account.id);
          for (const m of Object.values(state.months)) {
            for (const item of [...m.income, ...m.expenses]) {
              if (item.accountId === account.id) item.accountId = null;
            }
          }
        }
      )
    );
    list.append(li);
  }
}

/** Fyller begge konto-nedtrekkene, med «ingen konto» som første valg. */
function renderAccountOptions() {
  for (const id of ['income-account', 'expense-account', 'import-account']) {
    const select = $(id);
    const previous = select.value;
    select.replaceChildren();

    const none = el('option', { text: state.accounts.length ? '– ingen konto –' : 'Ingen konto lagt inn' });
    none.value = '';
    select.append(none);

    for (const account of state.accounts) {
      const option = el('option', { text: account.name });
      option.value = account.id;
      select.append(option);
    }

    if (previous && state.accounts.some((a) => a.id === previous)) select.value = previous;
    else if (state.accounts.length === 1) select.value = state.accounts[0].id;
  }
}

function renderIncome() {
  const list = $('income-list');
  list.replaceChildren();

  if (month().income.length === 0) {
    list.append(el('li', { class: 'empty', text: 'Ingen inntekt lagt inn ennå.' }));
    return;
  }

  for (const item of month().income) {
    const account = state.accounts.find((a) => a.id === item.accountId);
    const li = el('li');

    const info = el('div', { class: 'grow' });
    info.append(el('span', { class: 'title', text: item.label }));
    if (account) info.append(el('span', { class: 'sub', text: `Inn på ${account.name}` }));

    li.append(
      info,
      el('span', { class: 'amount', text: kr.format(item.amount) }),
      deleteButton(`Slett inntekten «${item.label}»?`, () => {
        month().income = month().income.filter((i) => i.id !== item.id);
      })
    );
    list.append(li);
  }
}

/** Utgiftspostene og målene bor i hver sin boks, men bygges av samme rad. */
function renderCategories() {
  const utgifter = state.categories.filter((c) => !c.goal);
  const mal = state.categories.filter((c) => c.goal);

  fillCategoryList($('category-list'), utgifter, 'Ingen kategorier. Legg til én under.');
  fillCategoryList($('goal-list'), mal, 'Ingen mål ennå. Legg til ett under.');
  renderGoalProgress(mal);
}

/** Kort status i overskriften på målboksen: «2 av 3 nådd». */
function renderGoalProgress(mal) {
  const medBelop = mal.filter((c) => (month().budgets[c.id] || 0) > 0);
  const nadd = medBelop.filter((c) => spentInCategory(c.id) >= month().budgets[c.id]).length;

  $('goal-progress').textContent = medBelop.length
    ? `${nadd} av ${medBelop.length} nådd`
    : '';
}

function fillCategoryList(list, categories, emptyText) {
  list.replaceChildren();

  if (categories.length === 0) {
    list.append(el('li', { class: 'empty', text: emptyText }));
    return;
  }

  for (const cat of categories) {
    const budget = month().budgets[cat.id] || 0;
    const spent = spentInCategory(cat.id);
    const rest = budget - spent;
    // Uten budsjett fylles baren helt så snart noe er brukt – da er alt "over".
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : spent > 0 ? 100 : 0;

    const li = el('li', { class: 'category' });

    const top = el('div', { class: 'category-top' });
    top.append(el('span', { class: 'category-name', text: cat.name }));

    // Veksler mellom «hold deg under» og «kom over» for denne kategorien.
    const goalToggle = el('button', { class: 'goal-toggle', text: '🎯' });
    goalToggle.type = 'button';
    goalToggle.classList.toggle('active', cat.goal);
    goalToggle.title = cat.goal
      ? `«${cat.name}» er et mål. Klikk for å flytte den tilbake til vanlige utgifter.`
      : `«${cat.name}» er en utgiftspost. Klikk for å flytte den til Mål og sparing.`;
    goalToggle.addEventListener('click', () => {
      cat.goal = !cat.goal;
      save();
      render();
    });
    top.append(goalToggle);

    const input = el('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.placeholder = '0';
    input.value = budget || '';
    input.title = cat.goal ? 'Sparemål for denne måneden' : 'Budsjett for denne måneden';
    input.addEventListener('change', () => {
      const value = Math.max(0, Number(input.value) || 0);
      if (value > 0) month().budgets[cat.id] = value;
      else delete month().budgets[cat.id];
      save();
      render();
    });
    top.append(input);

    top.append(
      deleteButton(
        cat.goal
          ? `Slett målet «${cat.name}»? Det du har lagt inn på det blir stående, men uten kategori.`
          : `Slett kategorien «${cat.name}»? Utgifter i den blir flyttet til «Ukategorisert».`,
        () => {
          state.categories = state.categories.filter((c) => c.id !== cat.id);
          for (const m of Object.values(state.months)) {
            delete m.budgets[cat.id];
            for (const e of m.expenses) {
              if (e.categoryId === cat.id) e.categoryId = null;
            }
          }
        }
      )
    );

    const reached = budget > 0 && spent >= budget;

    const bar = el('div', { class: 'bar' });
    const fill = el('div');
    fill.style.width = `${pct}%`;
    if (cat.goal) {
      // Målet er ikke nådd før du er over beløpet – da først blir den grønn.
      if (!reached) fill.classList.add('pending');
    } else if (spent > budget) {
      fill.classList.add('over');
    } else if (pct >= 80) {
      fill.classList.add('warn');
    }
    bar.append(fill);

    const meta = el('div', { class: 'category-meta' });
    meta.append(
      el('span', {
        text: cat.goal
          ? `${kr.format(spent)} spart av ${kr.format(budget)}`
          : `${kr.format(spent)} av ${kr.format(budget)}`,
      })
    );

    if (cat.goal) {
      if (budget <= 0) {
        meta.append(el('span', { text: 'Sett et mål' }));
      } else if (reached) {
        meta.append(
          el('span', {
            class: 'goal-text',
            text: rest === 0 ? 'Målet er nådd' : `${kr.format(Math.abs(rest))} over målet`,
          })
        );
      } else {
        meta.append(el('span', { class: 'over-text', text: `${kr.format(rest)} igjen til målet` }));
      }
    } else {
      meta.append(
        rest >= 0
          ? el('span', { text: `${kr.format(rest)} igjen` })
          : el('span', { class: 'over-text', text: `${kr.format(Math.abs(rest))} over` })
      );
    }

    li.append(top, bar, meta);
    list.append(li);
  }
}

function renderCategoryOptions() {
  const select = $('expense-category');
  const previous = select.value;
  select.replaceChildren();

  for (const cat of state.categories) {
    const option = el('option', { text: cat.name });
    option.value = cat.id;
    select.append(option);
  }

  if (state.categories.length === 0) {
    const option = el('option', { text: 'Legg til en kategori først' });
    option.value = '';
    select.append(option);
  }

  if (previous && state.categories.some((c) => c.id === previous)) select.value = previous;
}

function renderExpenses() {
  const list = $('expense-list');
  list.replaceChildren();

  const expenses = [...month().expenses].sort((a, b) => b.date.localeCompare(a.date));
  $('expense-count').textContent = expenses.length ? `${expenses.length} stk` : '';

  if (expenses.length === 0) {
    list.append(el('li', { class: 'empty', text: 'Ingen utgifter registrert denne måneden.' }));
    return;
  }

  for (const exp of expenses) {
    const cat = state.categories.find((c) => c.id === exp.categoryId);
    const account = state.accounts.find((a) => a.id === exp.accountId);
    const li = el('li');

    const info = el('div', { class: 'grow' });
    info.append(el('span', { class: 'title', text: exp.note || cat?.name || 'Utgift' }));
    info.append(
      el('span', {
        class: 'sub',
        text: `${cat ? cat.name : 'Ukategorisert'} · ${formatDate(exp.date)}${
          account ? ` · ${account.name}` : ''
        }`,
      })
    );

    li.append(
      info,
      el('span', { class: 'amount', text: kr.format(exp.amount) }),
      deleteButton(null, () => {
        month().expenses = month().expenses.filter((e) => e.id !== exp.id);
      })
    );
    list.append(li);
  }
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/* ---------- Små hjelpere ---------- */

function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  return node;
}

/** Sletteknapp som eventuelt spør først, lagrer og tegner på nytt. */
function deleteButton(confirmText, action) {
  const button = el('button', { class: 'del', text: '✕' });
  button.type = 'button';
  button.title = 'Slett';
  button.addEventListener('click', () => {
    if (confirmText && !confirm(confirmText)) return;
    action();
    save();
    render();
  });
  return button;
}

/* ---------- Hendelser ---------- */

$('prev-month').addEventListener('click', () => {
  currentMonth = shiftMonth(currentMonth, -1);
  render();
});

$('next-month').addEventListener('click', () => {
  currentMonth = shiftMonth(currentMonth, 1);
  render();
});

$('income-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const label = $('income-label').value.trim();
  const amount = Math.max(0, Number($('income-amount').value) || 0);
  const accountId = $('income-account').value || null;
  if (!label || amount <= 0) return;

  month().income.push({ id: newId(), label, amount, accountId });
  save();
  event.target.reset();
  render();
  $('income-account').value = accountId || '';
});

$('account-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('account-name').value.trim();
  const startBalance = Math.round(Number($('account-balance').value) || 0);
  if (!name) return;

  if (state.accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    alert('Du har allerede en konto med det navnet.');
    return;
  }

  state.accounts.push({ id: newId(), name, startBalance });
  save();
  event.target.reset();
  render();
});

$('category-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('category-name').value.trim();
  if (!name) return;

  if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    alert('Du har allerede en kategori med det navnet.');
    return;
  }

  state.categories.push({ id: newId(), name, goal: false });
  save();
  event.target.reset();
  render();
});

$('goal-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('goal-name').value.trim();
  const amount = Math.max(0, Number($('goal-amount').value) || 0);
  if (!name) return;

  if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    alert('Du har allerede en kategori eller et mål med det navnet.');
    return;
  }

  const goal = { id: newId(), name, goal: true };
  state.categories.push(goal);
  if (amount > 0) month().budgets[goal.id] = amount;

  save();
  event.target.reset();
  render();
});

$('expense-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const amount = Math.max(0, Number($('expense-amount').value) || 0);
  const categoryId = $('expense-category').value;
  const accountId = $('expense-account').value || null;
  const note = $('expense-note').value.trim();
  const date = $('expense-date').value;

  if (amount <= 0 || !categoryId || !date) return;

  // Utgiften havner i måneden datoen tilhører, ikke nødvendigvis den viste.
  const targetMonth = date.slice(0, 7);
  if (!state.months[targetMonth]) state.months[targetMonth] = emptyMonth();
  state.months[targetMonth].expenses.push({ id: newId(), amount, categoryId, accountId, note, date });

  save();
  currentMonth = targetMonth;
  event.target.reset();
  $('expense-date').value = date;
  render();
  // Behold kontoen som ble brukt sist – man handler stort sett fra samme konto.
  $('expense-account').value = accountId || '';
});

$('copy-prev').addEventListener('click', () => {
  const previous = state.months[shiftMonth(currentMonth, -1)];
  if (!previous || Object.keys(previous.budgets).length === 0) {
    alert('Fant ingen budsjettbeløp i forrige måned.');
    return;
  }
  month().budgets = { ...previous.budgets };
  save();
  render();
});

$('export-data').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = `budsjett-${currentMonth}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

$('import-data').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.categories) || !parsed.months) {
      throw new Error('Ugyldig format');
    }
    if (!confirm('Dette erstatter dataene du har nå. Fortsette?')) return;
    state = migrate(parsed);
    save();
    render();
  } catch (err) {
    alert('Klarte ikke å lese filen: ' + err.message);
  } finally {
    event.target.value = '';
  }
});

$('reset-data').addEventListener('click', () => {
  if (!confirm('Slette alt av budsjett, inntekt og utgifter? Dette kan ikke angres.')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = load();
  currentMonth = monthKey(new Date());
  render();
});

/* ---------- Import fra banken ---------- */

/** Radene som venter på å bli lagt inn, mens forhåndsvisningen står åpen. */
let pendingRows = null;

/** Alle importnøkler som allerede finnes, brukt til å hoppe over duplikater. */
function existingImportKeys() {
  const keys = new Set();
  for (const m of Object.values(state.months)) {
    for (const item of [...m.income, ...m.expenses]) {
      if (item.importKey) keys.add(item.importKey);
    }
  }
  return keys;
}

function readStatement(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onerror = () => alert('Klarte ikke å lese fila.');
  reader.onload = () => {
    try {
      showImportPreview(BankImport.parseStatement(String(reader.result)));
    } catch (err) {
      alert(err.message);
      closeImportPreview();
    }
  };
  reader.readAsText(file, 'utf-8');
}

function showImportPreview({ transactions, skipped, warnings }) {
  const seen = existingImportKeys();

  pendingRows = transactions.map((t) => {
    const key = BankImport.importKey(t);
    return {
      transaction: t,
      key,
      duplicate: seen.has(key),
      categoryId: t.amount < 0 ? BankImport.suggestCategory(t.text, state.categories, state.importRules) : null,
      include: !seen.has(key),
    };
  });

  const nye = pendingRows.filter((r) => !r.duplicate).length;
  const gamle = pendingRows.length - nye;

  const summary = $('import-summary');
  summary.replaceChildren();
  summary.append(
    el('span', {
      text: `Fant ${transactions.length} transaksjoner – ${nye} nye${
        gamle ? `, ${gamle} allerede importert` : ''
      }${skipped ? `, ${skipped} hoppet over` : ''}.`,
    })
  );
  for (const warning of warnings) {
    summary.append(el('span', { class: 'warn-text', text: warning }));
  }

  renderImportRows();
  $('import-preview').hidden = false;
}

function renderImportRows() {
  const list = $('import-rows');
  list.replaceChildren();

  for (const row of pendingRows) {
    const { transaction: t } = row;
    const isIncome = t.amount > 0;

    const li = el('li', { class: 'import-row' });
    if (row.duplicate) li.classList.add('dupe');

    const check = el('input');
    check.type = 'checkbox';
    check.checked = row.include;
    check.addEventListener('change', () => {
      row.include = check.checked;
      updateImportButton();
    });

    const amountEl = el('span', {
      class: 'row-amount',
      text: kr.format(Math.round(Math.abs(t.amount))),
    });
    if (isIncome) amountEl.classList.add('income');

    li.append(check, el('span', { class: 'row-text', text: t.text }), amountEl);
    li.append(el('span', { class: 'row-sub', text: formatDate(t.date) }));

    if (row.duplicate) {
      li.append(el('span', { class: 'tag', text: 'Allerede importert' }));
    } else if (isIncome) {
      li.append(el('span', { class: 'tag', text: 'Legges inn som inntekt' }));
    } else {
      const select = el('select');
      const none = el('option', { text: '– velg kategori –' });
      none.value = '';
      select.append(none);
      for (const cat of state.categories) {
        const option = el('option', { text: cat.name });
        option.value = cat.id;
        select.append(option);
      }
      select.value = row.categoryId || '';
      select.addEventListener('change', () => {
        row.categoryId = select.value || null;
      });
      li.append(select);
    }

    list.append(li);
  }

  updateImportButton();
}

function updateImportButton() {
  const count = pendingRows ? pendingRows.filter((r) => r.include).length : 0;
  $('import-confirm').textContent = count ? `Legg inn ${count}` : 'Legg inn';
  $('import-confirm').disabled = count === 0;
}

function closeImportPreview() {
  pendingRows = null;
  $('import-preview').hidden = true;
  $('import-rows').replaceChildren();
  $('import-statement').value = '';
}

function confirmImport() {
  if (!pendingRows) return;

  const chosen = pendingRows.filter((r) => r.include);
  const manglerKategori = chosen.filter((r) => r.transaction.amount < 0 && !r.categoryId);
  if (manglerKategori.length > 0) {
    alert(
      `Velg kategori for ${manglerKategori.length} ${
        manglerKategori.length === 1 ? 'utgift' : 'utgifter'
      } før du legger dem inn, eller hak dem bort.`
    );
    return;
  }

  const accountId = $('import-account').value || null;
  let sisteMaaned = currentMonth;

  for (const row of chosen) {
    const { transaction: t } = row;
    const targetMonth = t.date.slice(0, 7);
    if (!state.months[targetMonth]) state.months[targetMonth] = emptyMonth();
    sisteMaaned = targetMonth;

    if (t.amount > 0) {
      state.months[targetMonth].income.push({
        id: newId(),
        label: t.text,
        amount: Math.round(t.amount),
        accountId,
        importKey: row.key,
      });
    } else {
      state.months[targetMonth].expenses.push({
        id: newId(),
        amount: Math.round(Math.abs(t.amount)),
        categoryId: row.categoryId,
        accountId,
        note: t.text,
        date: t.date,
        importKey: row.key,
      });
      // Husk valget, slik at samme butikk treffer riktig neste gang.
      state.importRules[BankImport.merchantKey(t.text)] = row.categoryId;
    }
  }

  save();
  closeImportPreview();
  currentMonth = sisteMaaned;
  render();
}

$('dropzone').addEventListener('click', () => $('import-statement').click());
$('dropzone').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    $('import-statement').click();
  }
});

$('dropzone').addEventListener('dragover', (event) => {
  event.preventDefault();
  $('dropzone').classList.add('over');
});

$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('over'));

$('dropzone').addEventListener('drop', (event) => {
  event.preventDefault();
  $('dropzone').classList.remove('over');
  readStatement(event.dataTransfer.files[0]);
});

$('import-statement').addEventListener('change', (event) => readStatement(event.target.files[0]));
$('import-confirm').addEventListener('click', confirmImport);
$('import-cancel').addEventListener('click', closeImportPreview);

/* ---------- Månedsskifte ---------- */

/**
 * Hopper til den nye måneden når klokka passerer et månedsskifte mens appen
 * står åpen. Har du bladd deg bort til en annen måned, står du der i fred.
 */
function syncToCurrentMonth() {
  const today = monthKey(new Date());
  if (today === shownToday) return;

  const varPaaDagensManed = currentMonth === shownToday;
  shownToday = today;
  if (!varPaaDagensManed) return;

  currentMonth = today;
  $('expense-date').value = todayIso();
  render();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncToCurrentMonth();
});
window.addEventListener('focus', syncToCurrentMonth);
setInterval(syncToCurrentMonth, 60 * 1000);

/* ---------- Oppstart ---------- */

$('expense-date').value = todayIso();
render();
