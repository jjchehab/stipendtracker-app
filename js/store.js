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

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function monthKey(date) {
    var m = date.getMonth() + 1;
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
  }

  function sameMonth(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  function parseAmount(text) {
    var cleaned = String(text).trim().replace(',', '.');
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
      importedKeys: []
    };
  }

  /** Fills in anything missing, the same way the Mac app does when it loads older data. */
  function normalize(raw) {
    if (!raw || !Array.isArray(raw.entries) || !Array.isArray(raw.categories)) return null;
    var s = {
      entries: raw.entries.map(function (e) {
        return {
          id: e.id || newId(),
          category: String(e.category),
          amount: Number(e.amount) || 0,
          date: e.date,
          name: e.name || null
        };
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
      importedKeys: Array.isArray(raw.importedKeys) ? raw.importedKeys : []
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
        items.push({ name: c.name, label: c.name + ' (archived)' });
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
    var month = startOfMonth(new Date(earliest));
    while (month <= current) {
      months.push(month);
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
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
    var daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return today.getDate() / daysInMonth;
  }

  function isGracePeriod(month) {
    var today = new Date();
    return sameMonth(month, today) && today.getDate() <= GRACE_DAYS;
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
    state.entries.push(e);
    save();
    return e;
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

  function signedMoney(value) {
    return (value >= 0 ? '+' : '-') + state.currency + Math.abs(value).toFixed(2);
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
    signedMoney: signedMoney,
    exportJSON: exportJSON,
    importJSON: importJSON
  };
})();
