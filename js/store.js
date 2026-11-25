/* StipendTracker: budget logic and saving.
   A port of the Mac app's BudgetStore. The saved data has the same shape as the Mac app's
   data.json, so a backup file can move between versions. */
(function () {
  'use strict';

  var BALLER = 'Baller Budget';
  var STORAGE_KEY = 'stipendtracker.data.v1';
  var GRACE_DAYS = 3;

  var DEFAULT_CATEGORIES = [
    ['Groceries', false],
    ['Fun (drinks, etc.)', false],
    ['Hobbies & Entertainment', false],
    ['Household Supplies', false],
    ['Housing (rent/utilities)', true],
    ['Local Transit', false],
    ['Personal Care', false],
    ['Restaurants', false],
    ['Travel', false],
    ['Savings', false],
    ['Other', false]
  ];

  // ---------- helpers ----------

  function newId() {
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [];
    for (var j = 0; j < 16; j++) hex.push((bytes[j] + 0x100).toString(16).slice(1));
    var h = hex.join('');
    return (h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20)).toUpperCase();
  }

  function toISO(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  // ---------- pay periods ----------
  // A "period" is what the app used to call a month. It starts on your pay day (1 to 28, or the
  // last day of the month, which is day 0) and lasts until the day before the next one.
  // Its key is the year and month it starts in, for example "2026-11".
  // periodRules lists which start day applies from which month on, so changing the day later
  // only affects periods that have not started yet. The default (day 1) behaves like calendar months.

  var DEFAULT_RULES = [{ from: '0000-01', day: 1 }];

  function keyParts(key) {
    return { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 };
  }

  function keyOf(y, m) {
    var d = new Date(y, m, 1);
    var mm = d.getMonth() + 1;
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm;
  }

  function nextKey(key) { var p = keyParts(key); return keyOf(p.y, p.m + 1); }
  function prevKey(key) { var p = keyParts(key); return keyOf(p.y, p.m - 1); }

  function dayForKey(key, rules) {
    var day = 1;
    (rules || state.periodRules).slice().sort(function (a, b) { return a.from < b.from ? -1 : (a.from > b.from ? 1 : 0); })
      .forEach(function (r) { if (r.from <= key) day = r.day; });
    return day;
  }

  function startOfKey(key, rules) {
    var p = keyParts(key);
    var day = dayForKey(key, rules);
    var last = new Date(p.y, p.m + 1, 0).getDate();
    var d = day === 0 ? last : Math.min(Math.max(day, 1), 28);
    return new Date(p.y, p.m, d);
  }

  /** The key of the period a date falls in. */
  function periodKey(date, rules) {
    var cand = keyOf(date.getFullYear(), date.getMonth());
    return startOfKey(cand, rules) > date ? prevKey(cand) : cand;
  }

  /** The first moment of the period a date falls in (kept under its old name for the rest of the app). */
  function startOfMonth(date) {
    return startOfKey(periodKey(date));
  }

  function monthKey(date) {
    return periodKey(date);
  }

  function sameMonth(a, b) {
    return periodKey(a) === periodKey(b);
  }

  /** Where a period begins and ends (end is its last day), and how many days it has. */
  function periodRange(date) {
    var key = periodKey(date);
    var start = startOfKey(key);
    var next = startOfKey(nextKey(key));
    var end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
    var days = Math.round((next - start) / 86400000);
    return { key: key, start: start, end: end, days: days, custom: dayForKey(key) !== 1 };
  }

  /** The day the period that contains today starts on (0 means the last day of the month). */
  function currentStartDay() { return dayForKey(periodKey(new Date())); }

  /** What the next period will start on, after any change you have already scheduled. */
  function upcomingStartDay() { return dayForKey(nextKey(periodKey(new Date()))); }

  function parseAmount(text) {
    var cleaned = String(text).trim().replace(/\s/g, '');
    var lastComma = cleaned.lastIndexOf(',');
    var lastDot = cleaned.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      // both present: whichever comes last is the decimal mark, the other is a thousands separator
      cleaned = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
    } else {
      cleaned = cleaned.replace(',', '.');
    }
    if (cleaned === '') return null;
    var n = Number(cleaned);
    return isFinite(n) ? n : null;
  }

  function freshState() {
    return {
      entries: [],
      categories: DEFAULT_CATEGORIES.map(function (c) {
        return { id: newId(), name: c[0], monthlyBudget: 0, isFixedBill: c[1], archived: false };
      }),
      ballerStart: 0,
      deposits: [],
      snapshots: [],
      trackingStart: null,
      hasCompletedSetup: false,
      currency: '€',
      merchantRules: {},
      importedKeys: [],
      rates: {},
      periodRules: DEFAULT_RULES.map(function (r) { return { from: r.from, day: r.day }; }),
      lastBackupAt: null,
      backupSnoozedUntil: null,
      recurring: []
    };
  }

  function cleanRecurring(list) {
    var out = [];
    if (Array.isArray(list)) {
      list.forEach(function (r) {
        if (r && r.category && Number(r.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(r.nextDue)) && Number.isInteger(Number(r.day)) && Number(r.day) >= 0 && Number(r.day) <= 28) {
          out.push({ id: r.id || newId(), category: String(r.category), amount: Number(r.amount), name: r.name || null, day: Number(r.day), nextDue: String(r.nextDue) });
        }
      });
    }
    return out;
  }

  function cleanRules(list) {
    var out = [];
    if (Array.isArray(list)) {
      list.forEach(function (r) {
        if (r && /^\d{4}-\d{2}$/.test(String(r.from)) && Number.isInteger(Number(r.day)) && Number(r.day) >= 0 && Number(r.day) <= 28) {
          out.push({ from: String(r.from), day: Number(r.day) });
        }
      });
    }
    if (!out.some(function (r) { return r.from === '0000-01'; })) out.unshift({ from: '0000-01', day: 1 });
    return out;
  }

  /** Fills in anything missing, the same way the Mac app does when it loads older data. */
  function normalize(raw) {
    if (!raw || !Array.isArray(raw.entries) || !Array.isArray(raw.categories)) return null;
    var s = {
      entries: raw.entries.map(function (e) {
        var entry = {
          id: e.id || newId(),
          category: String(e.category),
          amount: Number(e.amount) || 0,
          date: e.date,
          name: e.name || null
        };
        // Set only when the entry was paid in the other currency and converted.
        if (e.recurringId) entry.recurringId = String(e.recurringId);
        if (e.originalCurrency && Number(e.originalAmount) > 0 && Number(e.rate) > 0) {
          entry.originalAmount = Number(e.originalAmount);
          entry.originalCurrency = String(e.originalCurrency);
          entry.rate = Number(e.rate);
        }
        return entry;
      }),
      categories: raw.categories.map(function (c) {
        return {
          id: c.id || newId(),
          name: String(c.name),
          monthlyBudget: Number(c.monthlyBudget) || 0,
          isFixedBill: c.isFixedBill === undefined ? String(c.name).indexOf('Housing') === 0 : !!c.isFixedBill,
          archived: !!c.archived
        };
      }),
      ballerStart: Number(raw.ballerStart) || 0,
      deposits: Array.isArray(raw.deposits) ? raw.deposits : [],
      snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
      trackingStart: raw.trackingStart || null,
      hasCompletedSetup: raw.hasCompletedSetup === undefined ? true : !!raw.hasCompletedSetup,
      currency: raw.currency || '€',
      merchantRules: raw.merchantRules || {},
      importedKeys: Array.isArray(raw.importedKeys) ? raw.importedKeys : [],
      rates: (raw.rates && typeof raw.rates === 'object') ? raw.rates : {},
      periodRules: cleanRules(raw.periodRules),
      lastBackupAt: raw.lastBackupAt || null,
      backupSnoozedUntil: raw.backupSnoozedUntil || null,
      recurring: cleanRecurring(raw.recurring)
    };
    return s;
  }

  var state = freshState();
  var saveFailed = false;

  // The desktop app saves to a file through window.desktop (see electron/preload.js).
  // In a browser, data is kept in localStorage instead.
  var desktop = window.desktop || null;

  function save() {
    try {
      var text = JSON.stringify(state);
      if (desktop) {
        desktop.save(text);
      } else {
        window.localStorage.setItem(STORAGE_KEY, text);
      }
      saveFailed = false;
    } catch (err) {
      saveFailed = true;
    }
  }

  function load() {
    var text = null;
    try {
      text = desktop ? desktop.load() : window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      text = null;
    }
    if (!text) return;
    var loaded = null;
    try {
      loaded = normalize(JSON.parse(text));
    } catch (err) {
      loaded = null;
    }
    if (!loaded) return;
    state = loaded;
    if (state.hasCompletedSetup && !state.lastBackupAt) { state.lastBackupAt = toISO(new Date()); save(); }
    if (state.hasCompletedSetup && state.snapshots.length === 0) {
      var monthly = state.entries.filter(function (e) { return e.category !== BALLER; })
        .map(function (e) { return new Date(e.date); });
      var start = state.trackingStart ? new Date(state.trackingStart) : (monthly.length ? new Date(Math.min.apply(null, monthly)) : new Date());
      state.snapshots = [{ monthKey: monthKey(start), items: currentItems() }];
      save();
    }
  }

  function currentItems() {
    return state.categories.filter(function (c) { return !c.archived; }).map(function (c) {
      return { categoryID: c.id, monthlyBudget: c.monthlyBudget, isFixedBill: c.isFixedBill };
    });
  }

  // ---------- categories ----------

  function entryOptions() {
    return state.categories.filter(function (c) { return !c.archived; })
      .map(function (c) { return c.name; }).concat([BALLER]);
  }

  function sidebarItems() {
    var items = state.categories.filter(function (c) { return !c.archived; })
      .map(function (c) { return { name: c.name, label: c.name }; });
    state.categories.forEach(function (c) {
      if (c.archived && state.entries.some(function (e) { return e.category === c.name; })) {
        items.push({ name: c.name, label: c.name + ' (archived)', archived: true });
      }
    });
    items.push({ name: BALLER, label: BALLER });
    return items;
  }

  function isValidName(name, excludingId) {
    var t = String(name).trim().toLowerCase();
    if (t === '' || t === BALLER.toLowerCase()) return false;
    return !state.categories.some(function (c) { return c.id !== excludingId && c.name.toLowerCase() === t; });
  }

  function commitCategories() {
    syncCurrentSnapshot();
    save();
  }

  function addCategory(name, budget, fixed) {
    var t = String(name).trim();
    if (!isValidName(t)) return false;
    state.categories.push({ id: newId(), name: t, monthlyBudget: budget, isFixedBill: !!fixed, archived: false });
    commitCategories();
    return true;
  }

  function renameCategory(id, newName) {
    var t = String(newName).trim();
    var cat = state.categories.find(function (c) { return c.id === id; });
    if (!cat || !isValidName(t, id)) return false;
    var old = cat.name;
    if (old === t) return true;
    state.entries.forEach(function (e) { if (e.category === old) e.category = t; });
    Object.keys(state.merchantRules).forEach(function (k) {
      if (state.merchantRules[k] === old) state.merchantRules[k] = t;
    });
    state.recurring.forEach(function (r) { if (r.category === old) r.category = t; });
    cat.name = t;
    commitCategories();
    return true;
  }

  function updateCategory(id, changes) {
    var cat = state.categories.find(function (c) { return c.id === id; });
    if (!cat) return;
    if (changes.monthlyBudget !== undefined) cat.monthlyBudget = changes.monthlyBudget;
    if (changes.isFixedBill !== undefined) cat.isFixedBill = changes.isFixedBill;
    commitCategories();
  }

  function setArchived(id, value) {
    var cat = state.categories.find(function (c) { return c.id === id; });
    if (!cat) return;
    cat.archived = value;
    commitCategories();
  }

  // ---------- setup and reset ----------

  function completeSetup(opts) {
    state.currency = opts.currency;
    state.periodRules = cleanRules([{ from: '0000-01', day: opts.periodStartDay === undefined ? 1 : opts.periodStartDay }]);
    state.lastBackupAt = null;
    state.backupSnoozedUntil = null;
    state.ballerStart = opts.ballerStart;
    state.categories = opts.categories.map(function (c) {
      return { id: newId(), name: c.name, monthlyBudget: c.monthlyBudget, isFixedBill: !!c.isFixedBill, archived: false };
    });
    state.deposits = [];
    state.snapshots = [];
    state.trackingStart = toISO(startOfMonth(new Date()));
    state.hasCompletedSetup = true;
    syncCurrentSnapshot();
    save();
  }

  function resetAll() {
    state = freshState();
    save();
  }

  // ---------- months and budgets ----------

  /** Every month from the start of tracking up to the current month, newest first. */
  function historyMonths() {
    var current = startOfMonth(new Date());
    var times = state.entries.filter(function (e) { return e.category !== BALLER; })
      .map(function (e) { return new Date(e.date).getTime(); });
    if (state.trackingStart) times.push(new Date(state.trackingStart).getTime());
    if (times.length === 0) return [current];
    var earliest = times.reduce(function (a, b) { return a < b ? a : b; });
    var months = [];
    var key = periodKey(new Date(earliest));
    var currentKey = periodKey(new Date());
    while (key <= currentKey) {
      months.push(startOfKey(key));
      key = nextKey(key);
    }
    return months.reverse();
  }

  function syncCurrentSnapshot() {
    var key = monthKey(new Date());
    var items = currentItems();
    var idx = state.snapshots.findIndex(function (s) { return s.monthKey === key; });
    if (idx >= 0) {
      // Months older than the first record keep the budgets they had before this change.
      var months = historyMonths();
      var earliest = months[months.length - 1];
      if (earliest && monthKey(earliest) < key &&
          !state.snapshots.some(function (s) { return s.monthKey < key; })) {
        state.snapshots.push({ monthKey: monthKey(earliest), items: state.snapshots[idx].items });
      }
      state.snapshots[idx].items = items;
    } else {
      state.snapshots.push({ monthKey: key, items: items });
    }
  }

  function snapshotFor(month) {
    var key = monthKey(month);
    var sorted = state.snapshots.slice().sort(function (a, b) { return a.monthKey < b.monthKey ? -1 : (a.monthKey > b.monthKey ? 1 : 0); });
    var found = null;
    sorted.forEach(function (s) { if (s.monthKey <= key) found = s; });
    return found || sorted[0] || null;
  }

  function spentIn(category, month) {
    return state.entries.reduce(function (sum, e) {
      return (e.category === category && sameMonth(new Date(e.date), month)) ? sum + e.amount : sum;
    }, 0);
  }

  function totalSpent(month) {
    return state.entries.reduce(function (sum, e) {
      return (e.category !== BALLER && sameMonth(new Date(e.date), month)) ? sum + e.amount : sum;
    }, 0);
  }

  function rows(month) {
    var snap = snapshotFor(month);
    var items = snap ? snap.items : [];
    var result = [];
    state.categories.forEach(function (c) {
      var spent = spentIn(c.name, month);
      var item = items.find(function (i) { return i.categoryID === c.id; });
      if (item) {
        result.push({ id: c.id, name: c.name, budget: item.monthlyBudget, isFixedBill: item.isFixedBill, spent: spent });
      } else if (spent > 0) {
        result.push({ id: c.id, name: c.name, budget: 0, isFixedBill: false, spent: spent });
      }
    });
    return result;
  }

  function totalBudget(month) {
    return rows(month).reduce(function (sum, r) { return sum + r.budget; }, 0);
  }

  // ---------- Baller Budget ----------

  function finishedMonthsSurplus() {
    var current = startOfMonth(new Date());
    return historyMonths().filter(function (m) { return m < current; })
      .reduce(function (sum, m) { return sum + (totalBudget(m) - totalSpent(m)); }, 0);
  }

  function depositsTotal() {
    return state.deposits.reduce(function (sum, d) { return sum + d.amount; }, 0);
  }

  function ballerSpent() {
    return state.entries.reduce(function (sum, e) { return e.category === BALLER ? sum + e.amount : sum; }, 0);
  }

  function ballerBalance() {
    return state.ballerStart + finishedMonthsSurplus() + depositsTotal() - ballerSpent();
  }

  function ballerTitle() {
    return ballerBalance() < 0 ? 'Budget Crisis' : 'Baller Budget';
  }

  // ---------- pace ----------

  function monthProgress(month) {
    var today = new Date();
    var currentStart = startOfMonth(today);
    var target = startOfMonth(month);
    if (target < currentStart) return 1;
    if (target > currentStart) return 0;
    var range = periodRange(today);
    return daysIntoPeriod(today) / range.days;
  }

  /** Which day of the period it is (the first day is 1). */
  function daysIntoPeriod(date) {
    var range = periodRange(date);
    var midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((midnight - range.start) / 86400000) + 1;
  }

  function isGracePeriod(month) {
    var today = new Date();
    return sameMonth(month, today) && daysIntoPeriod(today) <= GRACE_DAYS;
  }

  function expectedSpend(row, month) {
    if (row.isFixedBill || isGracePeriod(month)) return row.budget;
    return row.budget * monthProgress(month);
  }

  function expectedTotal(month) {
    return rows(month).reduce(function (sum, r) { return sum + expectedSpend(r, month); }, 0);
  }

  function status(spent, expected) {
    if (spent <= 0) return 'onPace';
    if (expected <= 0) return 'wayOver';
    var ratio = spent / expected;
    if (ratio <= 1.0) return 'onPace';
    if (ratio <= 1.2) return 'slightlyHigh';
    return 'wayOver';
  }

  function rowStatus(row, month) {
    return status(row.spent, expectedSpend(row, month));
  }

  function totalStatus(month) {
    return status(totalSpent(month), expectedTotal(month));
  }

  // ---------- entries and deposits ----------

  function addEntry(entry) {
    var e = {
      id: newId(),
      category: entry.category,
      amount: entry.amount,
      date: toISO(entry.date),
      name: entry.name || null
    };
    if (entry.originalCurrency && entry.originalAmount > 0 && entry.rate > 0) {
      e.originalAmount = entry.originalAmount;
      e.originalCurrency = entry.originalCurrency;
      e.rate = entry.rate;
    }
    state.entries.push(e);
    save();
    return e;
  }

  /** Changes an entry. patch may hold category, amount, date (a Date), name, and original (null or {amount, currency, rate}). */
  function updateEntry(id, patch) {
    var e = state.entries.find(function (x) { return x.id === id; });
    if (!e) return false;
    if (patch.category !== undefined) e.category = patch.category;
    if (patch.amount !== undefined) e.amount = patch.amount;
    if (patch.date !== undefined) e.date = toISO(patch.date);
    if (patch.name !== undefined) e.name = patch.name || null;
    if (patch.original !== undefined) {
      delete e.originalAmount; delete e.originalCurrency; delete e.rate;
      if (patch.original && patch.original.amount > 0 && patch.original.rate > 0) {
        e.originalAmount = patch.original.amount;
        e.originalCurrency = patch.original.currency;
        e.rate = patch.original.rate;
      }
    }
    save();
    return true;
  }

  function removeEntry(id) {
    state.entries = state.entries.filter(function (e) { return e.id !== id; });
    save();
  }

  function removeLastEntry() {
    if (state.entries.length === 0) return null;
    var removed = state.entries.pop();
    save();
    return removed;
  }

  function addDeposit(amount) {
    state.deposits.push({ id: newId(), amount: amount, date: toISO(new Date()) });
    save();
  }

  function removeDeposit(id) {
    state.deposits = state.deposits.filter(function (d) { return d.id !== id; });
    save();
  }

  function setBallerStart(value) {
    state.ballerStart = value;
    save();
  }

  function setCurrency(value) {
    state.currency = value;
    save();
  }

  // ---------- bank import ----------

  /** Adds reviewed bank transactions and remembers the stores you asked it to. */
  function addImported(list, fingerprints, rules) {
    var ids = [];
    list.forEach(function (item) {
      var e = { id: newId(), category: item.category, amount: item.amount, date: toISO(item.date), name: item.name || null };
      if (item.originalCurrency && item.originalAmount > 0 && item.rate > 0) {
        e.originalAmount = item.originalAmount;
        e.originalCurrency = item.originalCurrency;
        e.rate = item.rate;
      }
      state.entries.push(e);
      ids.push(e.id);
    });
    fingerprints.forEach(function (f) { state.importedKeys.push(f); });
    Object.keys(rules).forEach(function (k) { state.merchantRules[k] = rules[k]; });
    save();
    return ids;
  }

  /** Takes back one import. Remembered stores are kept. */
  function undoImport(entryIds, fingerprints) {
    var ids = {};
    entryIds.forEach(function (id) { ids[id] = true; });
    var fps = {};
    fingerprints.forEach(function (f) { fps[f] = true; });
    state.entries = state.entries.filter(function (e) { return !ids[e.id]; });
    state.importedKeys = state.importedKeys.filter(function (f) { return !fps[f]; });
    save();
  }

  // ---------- money ----------

  function money(value) {
    return (value < 0 ? '-' : '') + state.currency + Math.abs(value).toFixed(2);
  }

  function moneyIn(symbol, value) {
    return symbol + Math.abs(value).toFixed(2);
  }

  function signedMoney(value) {
    return (value >= 0 ? '+' : '-') + state.currency + Math.abs(value).toFixed(2);
  }


  // ---------- recurring entries ----------
  // Something you pay every month. It is added by itself on its day. If the app was not opened
  // for a while, every missed one is added with its own date the next time it opens.

  function occurrence(y, m, day) {
    var last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, day === 0 ? last : Math.min(Math.max(day, 1), 28));
  }

  function parseDay(text) {
    var p = String(text).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  /** Adds every recurring entry that has come due. Returns how many were added. */
  function applyRecurring() {
    if (!state.hasCompletedSetup || state.recurring.length === 0) return 0;
    var n = new Date();
    var today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    var added = 0;
    state.recurring.forEach(function (r) {
      var due = parseDay(r.nextDue);
      var guard = 0;
      while (due <= today && guard++ < 36) {
        state.entries.push({
          id: newId(), category: r.category, amount: r.amount,
          date: toISO(new Date(due.getFullYear(), due.getMonth(), due.getDate(), 12, 0, 0)),
          name: r.name || null, recurringId: r.id
        });
        added++;
        due = occurrence(due.getFullYear(), due.getMonth() + 1, r.day);
      }
      r.nextDue = ymd(due);
    });
    if (added) save();
    return added;
  }

  /** Starts a monthly entry on its next day (today counts). Returns how many entries were added right away. */
  function addRecurring(item) {
    var n = new Date();
    var today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    var first = occurrence(today.getFullYear(), today.getMonth(), item.day);
    if (first < today) first = occurrence(today.getFullYear(), today.getMonth() + 1, item.day);
    state.recurring.push({ id: newId(), category: item.category, amount: item.amount, name: item.name || null, day: item.day, nextDue: ymd(first) });
    save();
    return applyRecurring();
  }

  function removeRecurring(id) {
    state.recurring = state.recurring.filter(function (r) { return r.id !== id; });
    save();
  }

  // ---------- trends ----------

  /**
   * Every period from oldest to newest with its spending by category, plus how this period
   * compares with the average of the finished ones at the same point (same day number).
   * compare is null until there are at least two finished periods.
   */
  function trendData() {
    var now = new Date();
    var curKey = periodKey(now);
    var periods = historyMonths().slice().reverse().map(function (m) {
      var r = periodRange(m);
      return { key: r.key, start: r.start, end: r.end, days: r.days, custom: r.custom, current: r.key === curKey, total: 0, byCat: {} };
    });
    var byKey = {};
    periods.forEach(function (p) { byKey[p.key] = p; });
    state.entries.forEach(function (e) {
      if (e.category === BALLER) return;
      var p = byKey[periodKey(new Date(e.date))];
      if (!p) return;
      p.byCat[e.category] = (p.byCat[e.category] || 0) + e.amount;
      p.total += e.amount;
    });
    var finished = periods.filter(function (p) { return !p.current; });
    var out = { periods: periods, finishedCount: finished.length, compare: null, day: daysIntoPeriod(now) };
    if (finished.length < 2) return out;
    var day = out.day;
    function upTo(p, name) {
      var cutoff = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() + day);
      return state.entries.reduce(function (sum, e) {
        if (e.category === BALLER || (name !== null && e.category !== name)) return sum;
        if (periodKey(new Date(e.date)) !== p.key) return sum;
        return new Date(e.date) < cutoff ? sum + e.amount : sum;
      }, 0);
    }
    var current = periods[periods.length - 1];
    function line(name) {
      var cur = upTo(current, name);
      var avg = finished.reduce(function (s, p) { return s + upTo(p, name); }, 0) / finished.length;
      return { name: name, current: cur, avg: avg, pct: avg >= 1 ? (cur - avg) / avg * 100 : null, isNew: avg < 1 && cur > 0 };
    }
    var names = {};
    periods.forEach(function (p) { Object.keys(p.byCat).forEach(function (k) { names[k] = true; }); });
    var cats = Object.keys(names).map(line).filter(function (c) { return c.current > 0 || c.avg >= 1; });
    out.compare = { total: line(null), cats: cats };
    return out;
  }

  // ---------- trends: everything the Trends page shows ----------

  function ratioStatus(spent, budget) {
    if (budget <= 0) return spent > 0 ? 'way' : 'under';
    var r = spent / budget;
    return r <= 1 ? 'under' : (r <= 1.2 ? 'slight' : 'way');
  }

  function dayIndex(period, date) {
    var d = new Date(date);
    return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - period.start) / 86400000);
  }

  function isSavings(name) { var n = String(name).toLowerCase(); return n === 'savings' || n === 'ahorros'; }

  function trendExtras() {
    var now = new Date();
    var base = trendData();
    var periods = base.periods;
    var cur = periods[periods.length - 1];
    var finished = periods.filter(function (p) { return !p.current; });
    var out = { periods: periods, finishedCount: finished.length, compare: base.compare, day: base.day };

    // budgets, fixed bills and status for every period
    periods.forEach(function (p) {
      var rs = rows(p.start);
      p.rows = rs;
      p.budget = rs.reduce(function (s, r) { return s + r.budget; }, 0);
      p.fixedBudget = rs.filter(function (r) { return r.isFixedBill; }).reduce(function (s, r) { return s + r.budget; }, 0);
      p.fixedNames = {};
      rs.forEach(function (r) { if (r.isFixedBill) p.fixedNames[r.name] = true; });
      p.status = ratioStatus(p.total, p.budget);
    });

    // projection for the period in progress
    var day = base.day;
    var flexSoFar = 0, unpaidFixed = 0;
    cur.rows.forEach(function (r) {
      if (r.isFixedBill) { if (r.spent < r.budget * 0.5) unpaidFixed += r.budget - r.spent; }
      else flexSoFar += r.spent;
    });
    var proj = null;
    if (day > cur.days / 2) {
      var perDay = flexSoFar / Math.max(day, 1);
      proj = { value: cur.total + perDay * (cur.days - day) + unpaidFixed, basis: 'pace' };
    } else if (finished.length >= 1) {
      var avgTotal = finished.reduce(function (s, p) { return s + p.total; }, 0) / finished.length;
      proj = { value: Math.max(cur.total + unpaidFixed, avgTotal), basis: 'average' };
    }
    if (proj) { proj.status = ratioStatus(proj.value, cur.budget); cur.projection = proj; }
    out.projection = proj;

    // safe to spend per day
    var left = cur.budget - cur.total - unpaidFixed;
    var daysLeft = Math.max(cur.days - day, 1);
    out.safe = { left: left, daysLeft: daysLeft, perDay: left > 0 ? left / daysLeft : 0, budget: cur.budget, spent: cur.total, unpaidFixed: unpaidFixed, over: left < 0 };

    // pace: cumulative spending by day, this period against the average of finished ones
    function cumulative(p, upTo) {
      var daily = [];
      for (var i = 0; i < p.days; i++) daily.push(0);
      state.entries.forEach(function (e) {
        if (e.category === BALLER || periodKey(new Date(e.date)) !== p.key) return;
        var i = dayIndex(p, e.date);
        if (i >= 0 && i < p.days) daily[i] += e.amount;
      });
      var run = 0;
      return daily.map(function (v, i) { run += v; return i < upTo ? run : null; }).filter(function (v) { return v !== null; });
    }
    var curCum = cumulative(cur, day);
    var avg = null;
    if (finished.length >= 2) {
      var cums = finished.map(function (p) { return cumulative(p, p.days); });
      avg = [];
      for (var i = 0; i < cur.days; i++) {
        avg.push(cums.reduce(function (s, c) { return s + c[Math.min(i, c.length - 1)]; }, 0) / cums.length);
      }
    }
    out.pace = { days: cur.days, day: day, current: curCum, average: avg, diff: avg ? avg[day - 1] - curCum[day - 1] : null };

    // streaks
    var counted = finished.filter(function (p) { return p.budget > 0; });
    var streak = 0, best = 0, run2 = 0;
    counted.forEach(function (p) { if (p.status === 'under') { run2++; if (run2 > best) best = run2; } else run2 = 0; });
    for (var k = counted.length - 1; k >= 0 && counted[k].status === 'under'; k--) streak++;
    var cats = [];
    state.categories.forEach(function (c) {
      if (c.archived) return;
      var n = 0, fixed = false;
      for (var j = finished.length - 1; j >= 0; j--) {
        var r = finished[j].rows.filter(function (x) { return x.id === c.id; })[0];
        if (!r || r.budget <= 0) break;
        var ok = r.isFixedBill ? r.spent <= r.budget * 1.01 : r.spent <= r.budget;
        if (!ok) break;
        fixed = r.isFixedBill;
        n++;
      }
      if (n >= 2) cats.push({ name: c.name, count: n, fixed: fixed });
    });
    cats.sort(function (a, b) { return b.count - a.count; });
    out.streaks = { current: streak, best: best, under: counted.filter(function (p) { return p.status === 'under'; }).length, of: counted.length, budget: cur.budget, categories: cats.slice(0, 3) };

    // budget check-up (needs three finished periods)
    var checkup = [];
    if (finished.length >= 3) {
      state.categories.forEach(function (c) {
        if (c.archived) return;
        var hist = [];
        finished.slice(-4).forEach(function (p) {
          var r = p.rows.filter(function (x) { return x.id === c.id; })[0];
          if (r && r.budget > 0) hist.push({ spent: r.spent, budget: r.budget, fixed: r.isFixedBill });
        });
        if (hist.length < 3 || hist[hist.length - 1].fixed) return;
        var budget = hist[hist.length - 1].budget;
        var avgAll = hist.reduce(function (s, h) { return s + h.spent; }, 0) / hist.length;
        var last3 = hist.slice(-3);
        var avg3 = last3.reduce(function (s, h) { return s + h.spent; }, 0) / 3;
        var over3 = last3.filter(function (h) { return h.spent > h.budget * 1.05; }).length;
        var allUnder = hist.every(function (h) { return h.spent <= h.budget; });
        var allClose = hist.every(function (h) { return Math.abs(h.spent - h.budget) <= h.budget * 0.2; });
        var suggest = Math.ceil(avgAll * 1.15 / 5) * 5;
        if (over3 >= 2 && avg3 > budget) checkup.push({ kind: 'high', name: c.name, avg: avg3, budget: budget, over: over3, n: 3 });
        else if (allUnder && avgAll <= budget * 0.8 && suggest < budget) checkup.push({ kind: 'lower', name: c.name, avg: avgAll, budget: budget, suggest: suggest, n: hist.length });
        else if (allClose) checkup.push({ kind: 'ok', name: c.name, avg: avgAll, budget: budget, n: hist.length,
          off: Math.round(Math.max.apply(null, hist.map(function (h) { return Math.abs(h.spent - h.budget) / h.budget; })) * 100) });
      });
      var rank = { high: 0, lower: 1, ok: 2 };
      checkup.sort(function (a, b) { return rank[a.kind] - rank[b.kind]; });
      var okSeen = 0;
      checkup = checkup.filter(function (c) { if (c.kind !== 'ok') return true; return ++okSeen <= 1; }).slice(0, 4);
    }
    out.checkup = checkup;
    out.checkupReady = finished.length >= 3;

    // committed vs free
    var fixedCats = {};
    cur.rows.forEach(function (r) { if (r.isFixedBill) fixedCats[r.name] = r.budget; });
    var items = state.recurring.map(function (r) {
      return { name: r.name || r.category, category: r.category, day: r.day, amount: r.amount, fixed: fixedCats[r.category] !== undefined };
    });
    var covered = {};
    items.forEach(function (it) { if (it.fixed) covered[it.category] = true; });
    var fixedOnly = Object.keys(fixedCats).filter(function (n) { return !covered[n]; }).map(function (n) {
      return { name: n, category: n, day: null, amount: fixedCats[n], fixed: true, recurring: false };
    });
    var fixedTotal = Object.keys(fixedCats).reduce(function (s, n) { return s + fixedCats[n]; }, 0);
    var recurringOther = items.filter(function (it) { return !it.fixed; }).reduce(function (s, it) { return s + it.amount; }, 0);
    var committed = fixedTotal + recurringOther;
    out.committed = { budget: cur.budget, fixedTotal: fixedTotal, recurringOther: recurringOther, committed: committed, free: Math.max(cur.budget - committed, 0), items: items.concat(fixedOnly) };

    // calendar for every period
    out.calendar = periods.map(function (p) {
      var daily = [];
      for (var i = 0; i < p.days; i++) daily.push(0);
      state.entries.forEach(function (e) {
        if (e.category === BALLER || e.recurringId || p.fixedNames[e.category] || isSavings(e.category)) return;
        if (periodKey(new Date(e.date)) !== p.key) return;
        var i = dayIndex(p, e.date);
        if (i >= 0 && i < p.days) daily[i] += e.amount;
      });
      var flexBudget = Math.max(p.budget - p.fixedBudget, 0);
      return { key: p.key, start: p.start, end: p.end, days: p.days, current: p.current, daily: daily, allowance: Math.max(flexBudget / p.days, 1) };
    });

    // biggest purchases of the period in progress
    out.biggest = state.entries.filter(function (e) {
      return e.category !== BALLER && !e.recurringId && !cur.fixedNames[e.category] && !isSavings(e.category) && periodKey(new Date(e.date)) === cur.key;
    }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 5).map(function (e) {
      return { name: e.name || '', category: e.category, date: new Date(e.date), amount: e.amount };
    });

    // Baller Budget at the end of each finished period, then now
    var hist2 = [];
    var surplus = 0;
    finished.forEach(function (p) {
      surplus += p.budget - p.total;
      var end = new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate() + 1);
      var dep = state.deposits.filter(function (d) { return new Date(d.date) < end; }).reduce(function (s, d) { return s + d.amount; }, 0);
      var spent = state.entries.filter(function (e) { return e.category === BALLER && new Date(e.date) < end; }).reduce(function (s, e) { return s + e.amount; }, 0);
      hist2.push({ period: p, value: state.ballerStart + surplus + dep - spent });
    });
    out.baller = { points: hist2, now: ballerBalance() };
    return out;
  }

  // ---------- pay period changes ----------

  /** Changes the start day from the next period on. Periods that already started stay as they are. */
  function changePeriodStart(day) {
    var cur = periodKey(new Date());
    var today = new Date();
    var nk = nextKey(cur);
    var rules = state.periodRules.filter(function (r) { return r.from < nk; });
    var test = rules.concat([{ from: nk, day: day }]);
    var guard = 0;
    while (startOfKey(nk, test) <= today && guard++ < 3) {
      nk = nextKey(nk);
      rules = state.periodRules.filter(function (r) { return r.from < nk; });
      test = rules.concat([{ from: nk, day: day }]);
    }
    var existing = dayForKey(nk, rules);
    state.periodRules = existing === day ? rules : test;
    save();
  }

  // ---------- backup reminder ----------

  var REMIND_DAYS = 30;
  var SNOOZE_DAYS = 7;

  function markBackup() {
    state.lastBackupAt = toISO(new Date());
    state.backupSnoozedUntil = null;
    save();
  }

  function snoozeBackup() {
    state.backupSnoozedUntil = toISO(new Date(Date.now() + SNOOZE_DAYS * 86400000));
    save();
  }

  /** True when a month has passed since the last backup (or since you started) and you have not said "later". */
  function backupDue() {
    if (!state.hasCompletedSetup) return false;
    var ref = state.lastBackupAt || state.trackingStart || (state.entries[0] && state.entries[0].date);
    if (!ref) return false;
    var now = Date.now();
    if (state.backupSnoozedUntil && new Date(state.backupSnoozedUntil).getTime() > now) return false;
    if (!state.lastBackupAt && state.entries.length === 0) return false;
    return now - new Date(ref).getTime() >= REMIND_DAYS * 86400000;
  }

  // ---------- CSV export ----------

  function csvCell(v) {
    var t = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  /** All entries of one period (pass a date inside it), or every entry when called with no date. */
  function exportCSV(month) {
    var head = ['Date', 'Period', 'Category', 'Name', 'Amount', 'Currency', 'Original amount', 'Original currency', 'Rate'];
    var list = state.entries.filter(function (e) { return !month || sameMonth(new Date(e.date), month); })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    var lines = [head.join(',')];
    list.forEach(function (e) {
      var d = new Date(e.date);
      lines.push([ymd(d), monthKey(d), e.category, e.name || '', e.amount.toFixed(2), state.currency,
        e.originalAmount ? e.originalAmount.toFixed(2) : '', e.originalCurrency || '', e.rate || ''].map(csvCell).join(','));
    });
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  // ---------- exchange rates ----------
  // Only a currency pair and a date are ever sent (for example "USD to EUR on 2026-11-19").
  // Amounts, names and categories never leave the device. Rates are saved so they work offline.

  var RATE_API = 'https://api.frankfurter.dev/v2/rate/';
  var CODES = { '€': 'EUR', '$': 'USD', '£': 'GBP' };

  function ymd(date) {
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function fetchJSON(url) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var controller = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (controller) controller.abort();
        reject(new Error('timeout'));
      }, 7000);
      window.fetch(url, controller ? { signal: controller.signal } : undefined).then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      }).then(function (json) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(json);
      }).catch(function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /** The newest rate saved for a pair, of any date, or null. */
  function newestSaved(from, to) {
    var best = null;
    Object.keys(state.rates).forEach(function (k) {
      if (k.split('@')[0] !== from + '>' + to) return;
      var r = state.rates[k];
      if (!best || String(r.rateDate) > String(best.rateDate)) best = r;
    });
    return best;
  }

  /** A saved rate that is good for this date, without any internet. */
  function savedRate(from, to, when) {
    if (from === to) return { rate: 1, asOf: null, source: 'same' };
    var today = ymd(new Date());
    var day = ymd(when);
    var past = day < today;
    var c = state.rates[from + '>' + to + (past ? '@' + day : '')];
    if (c && (past || c.fetchedDay === today)) return { rate: c.rate, asOf: c.rateDate, source: 'saved' };
    return null;
  }

  /**
   * Finds the multiplier from one currency to the other for an entry date.
   * Resolves { rate, asOf, source } where source is 'same', 'saved', 'fresh' or 'old'
   * ('old' means we could not reach the internet and used the newest rate we had).
   * Rejects when there is no internet and no rate has ever been saved.
   */
  function getRate(from, to, when) {
    var quick = savedRate(from, to, when);
    if (quick) return Promise.resolve(quick);
    if (!CODES[from] || !CODES[to]) return Promise.reject(new Error('unsupported'));
    var today = ymd(new Date());
    var day = ymd(when);
    var past = day < today;
    var key = from + '>' + to + (past ? '@' + day : '');
    var url = RATE_API + CODES[from] + '/' + CODES[to] + (past ? '?date=' + day : '');
    return fetchJSON(url).then(function (json) {
      var rate = Number(json && json.rate);
      if (!(rate > 0) || !isFinite(rate)) throw new Error('bad rate');
      var rec = { rate: rate, rateDate: String(json.date || day), fetchedDay: today };
      state.rates[key] = rec;
      save();
      return { rate: rate, asOf: rec.rateDate, source: 'fresh' };
    }).catch(function () {
      var old = state.rates[key] || newestSaved(from, to);
      if (old) return { rate: old.rate, asOf: old.rateDate, source: 'old' };
      throw new Error('no rate');
    });
  }

  /** Keeps today's rate fresh for any pair you have used before. Safe to call often. */
  function refreshRates() {
    var pairs = {};
    Object.keys(state.rates).forEach(function (k) { pairs[k.split('@')[0]] = true; });
    Object.keys(pairs).forEach(function (pair) {
      var parts = pair.split('>');
      getRate(parts[0], parts[1], new Date()).catch(function () { /* offline: keep what we have */ });
    });
  }

  // ---------- backup ----------

  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    var parsed = null;
    try {
      parsed = normalize(JSON.parse(text));
    } catch (err) {
      parsed = null;
    }
    if (!parsed) return { ok: false, error: "That file doesn't look like a StipendTracker backup." };
    state = parsed;
    if (state.hasCompletedSetup) state.lastBackupAt = toISO(new Date());
    if (state.hasCompletedSetup && state.snapshots.length === 0) {
      state.snapshots = [{ monthKey: monthKey(new Date()), items: currentItems() }];
    }
    save();
    return { ok: true };
  }

  if (!desktop) {
    try {
      window.localStorage.setItem('__stipend_test', '1');
      window.localStorage.removeItem('__stipend_test');
    } catch (err) {
      saveFailed = true;
    }
  }

  load();

  window.Store = {
    BALLER: BALLER,
    GRACE_DAYS: GRACE_DAYS,
    get state() { return state; },
    get saveFailed() { return saveFailed; },
    newId: newId,
    parseAmount: parseAmount,
    startOfMonth: startOfMonth,
    sameMonth: sameMonth,
    monthKey: monthKey,
    periodRange: periodRange,
    daysIntoPeriod: daysIntoPeriod,
    currentStartDay: currentStartDay,
    upcomingStartDay: upcomingStartDay,
    changePeriodStart: changePeriodStart,
    updateEntry: updateEntry,
    markBackup: markBackup,
    snoozeBackup: snoozeBackup,
    backupDue: backupDue,
    exportCSV: exportCSV,
    CODES: CODES,
    applyRecurring: applyRecurring,
    addRecurring: addRecurring,
    removeRecurring: removeRecurring,
    trendData: trendData,
    trendExtras: trendExtras,
    _periodKey: periodKey,
    _startOfKey: startOfKey,
    entryOptions: entryOptions,
    sidebarItems: sidebarItems,
    isValidName: isValidName,
    addCategory: addCategory,
    renameCategory: renameCategory,
    updateCategory: updateCategory,
    setArchived: setArchived,
    completeSetup: completeSetup,
    resetAll: resetAll,
    historyMonths: historyMonths,
    spentIn: spentIn,
    totalSpent: totalSpent,
    rows: rows,
    totalBudget: totalBudget,
    finishedMonthsSurplus: finishedMonthsSurplus,
    depositsTotal: depositsTotal,
    ballerSpent: ballerSpent,
    ballerBalance: ballerBalance,
    ballerTitle: ballerTitle,
    isGracePeriod: isGracePeriod,
    expectedSpend: expectedSpend,
    expectedTotal: expectedTotal,
    status: status,
    rowStatus: rowStatus,
    totalStatus: totalStatus,
    addEntry: addEntry,
    removeEntry: removeEntry,
    removeLastEntry: removeLastEntry,
    addDeposit: addDeposit,
    removeDeposit: removeDeposit,
    setBallerStart: setBallerStart,
    setCurrency: setCurrency,
    addImported: addImported,
    undoImport: undoImport,
    money: money,
    moneyIn: moneyIn,
    signedMoney: signedMoney,
    getRate: getRate,
    savedRate: savedRate,
    refreshRates: refreshRates,
    exportJSON: exportJSON,
    importJSON: importJSON
  };
})();
