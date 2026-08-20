/* Mitt budsjett – enkel månedsbudsjettering. All data lagres i localStorage. */

const STORAGE_KEY = 'mitt-budsjett-v1';

const DEFAULT_CATEGORIES = [
  'Mat og dagligvarer',
  'Bolig og strøm',
  'Transport',
  'Abonnementer',
  'Klær',
  'Fritid',
  'Sparing',
  'Annet',
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
    categories: DEFAULT_CATEGORIES.map((name) => ({ id: newId(), name })),
    accounts: [],
    months: {},
  };
}

/** Fyller inn felter som mangler i data lagret av eldre versjoner. */
function migrate(data) {
  if (!Array.isArray(data.accounts)) data.accounts = [];
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
  for (const id of ['income-account', 'expense-account']) {
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

function renderCategories() {
  const list = $('category-list');
  list.replaceChildren();

  if (state.categories.length === 0) {
    list.append(el('li', { class: 'empty', text: 'Ingen kategorier. Legg til én under.' }));
    return;
  }

  for (const cat of state.categories) {
    const budget = month().budgets[cat.id] || 0;
    const spent = spentInCategory(cat.id);
    const rest = budget - spent;
    // Uten budsjett fylles baren helt så snart noe er brukt – da er alt "over".
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : spent > 0 ? 100 : 0;

    const li = el('li', { class: 'category' });

    const top = el('div', { class: 'category-top' });
    top.append(el('span', { class: 'category-name', text: cat.name }));

    const input = el('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.placeholder = '0';
    input.value = budget || '';
    input.title = 'Budsjett for denne måneden';
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
        `Slett kategorien «${cat.name}»? Utgifter i den blir flyttet til «Ukategorisert».`,
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

    const bar = el('div', { class: 'bar' });
    const fill = el('div');
    fill.style.width = `${pct}%`;
    if (spent > budget) fill.classList.add('over');
    else if (pct >= 80) fill.classList.add('warn');
    bar.append(fill);

    const meta = el('div', { class: 'category-meta' });
    meta.append(el('span', { text: `${kr.format(spent)} av ${kr.format(budget)}` }));
    meta.append(
      rest >= 0
        ? el('span', { text: `${kr.format(rest)} igjen` })
        : el('span', { class: 'over-text', text: `${kr.format(Math.abs(rest))} over` })
    );

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

  state.categories.push({ id: newId(), name });
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
