/* StipendTracker: screens. Everything is drawn from the data in store.js. */
(function () {
  'use strict';

  var S = window.Store;
  var money = S.money;
  var signedMoney = S.signedMoney;

  var PALETTE = ['#72A5F7', '#C79BFF', '#5ED6E8', '#A8B4FF', '#40C8BE', '#E6A0FF', '#8CD2FF', '#B478F0', '#CDC8EB', '#BEEBF5'];

  var ui = {
    screen: { name: 'home', month: null, category: null },
    showCategories: true,
    modal: null,            // 'settings' | 'baller' | null
    message: '',
    form: { category: '', amount: '', name: '', date: '' },
    setup: null,
    settingsMsg: '',
    ballerMsg: '',
    confirmReset: false,
    pendingImport: null,
    importError: '',
    review: null,
    lastBatch: null,
    menuOpen: false
  };

  var installPrompt = null;
  var isStandalone = !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone);
  var isWeb = /^https?:$/.test(window.location.protocol);

  // ---------- small helpers ----------

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function todayString() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function monthName(d) {
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  function dateTimeText(iso) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function dateText(iso) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function statusInfo(st) {
    if (st === 'onPace') return { cls: 'green', label: 'On pace' };
    if (st === 'slightlyHigh') return { cls: 'yellow', label: 'A little high' };
    return { cls: 'red', label: 'Way over' };
  }

  function clamp01(x) { return Math.min(Math.max(x, 0), 1); }

  function isCurrentMonth(month) {
    return S.sameMonth(month, new Date());
  }

  function fixFormCategory() {
    var options = S.entryOptions();
    if (options.indexOf(ui.form.category) < 0) ui.form.category = options[0] || '';
    if (!ui.form.date) ui.form.date = todayString();
  }

  // ---------- reusable pieces ----------

  function bar(fraction, tick, cls) {
    return '<div class="bar"><div class="fill ' + cls + '" style="width:' + (clamp01(fraction) * 100) + '%"></div>' +
      '<div class="tick" style="left:' + (clamp01(tick) * 100) + '%"></div></div>';
  }

  function chip(st) {
    var info = statusInfo(st);
    return '<span class="chip ' + info.cls + '">' + info.label + '</span>';
  }

  function saveWarning() {
    if (!S.saveFailed) return '';
    return '<div class="warn">This browser is not letting the page save your data, so it will be lost when you close it. Open the app in Google Chrome or the desktop app instead.</div>';
  }

  function pageHead(eyebrow, title, subtitle, actionsHtml) {
    return '<div class="page-head"><div><div class="eyebrow">' + esc(eyebrow) + '</div>' +
      '<h1 class="title">' + esc(title) + '</h1>' +
      (subtitle ? '<div class="subtitle">' + esc(subtitle) + '</div>' : '') + '</div>' +
      (actionsHtml ? '<div class="head-actions">' + actionsHtml + '</div>' : '') + '</div>';
  }

  // ---------- month table ----------

  function monthTable(month) {
    var current = isCurrentMonth(month);
    var caption;
    if (!current) {
      caption = 'Finished month, compared with each full monthly budget as it was set that month.';
    } else if (S.isGracePeriod(month)) {
      caption = 'First days of the month: pace warnings start on day ' + (S.GRACE_DAYS + 1) + '. Until then, only going over a full budget is flagged.';
    } else {
      caption = 'The white mark on each bar shows where you should be by today.';
    }

    var html = '<div class="card"><h3>' + (current ? 'This month at a glance' : 'Category breakdown') + '</h3>' +
      '<div class="muted small" style="margin-bottom:14px">' + caption + '</div>' +
      '<div class="row month-grid head"><div class="col-title">Category</div>' +
      '<div class="col-title num">Spent</div><div class="col-title num">Budget</div><div class="col-title num">Left</div>' +
      '<div class="col-title">Pace</div><div class="col-title">Status</div></div>';

    S.rows(month).forEach(function (row) {
      var expected = S.expectedSpend(row, month);
      var st = S.status(row.spent, expected);
      var info = statusInfo(st);
      var fraction = row.budget > 0 ? row.spent / row.budget : 0;
      var tick = row.budget > 0 ? expected / row.budget : 0;
      html += '<div class="row month-grid' + (st === 'onPace' ? '' : ' tint-' + info.cls) + '">' +
        '<div class="strong">' + esc(row.name) + '</div>' +
        '<div class="num strong" data-label="Spent">' + money(row.spent) + '</div>' +
        '<div class="num muted" data-label="Budget">' + money(row.budget) + '</div>' +
        '<div class="num" data-label="Left">' + money(row.budget - row.spent) + '</div>' +
        bar(fraction, tick, info.cls) + '<div>' + chip(st) + '</div></div>';
    });

    var spent = S.totalSpent(month);
    var expectedAll = S.expectedTotal(month);
    var budget = S.totalBudget(month);
    var tst = S.status(spent, expectedAll);
    var tinfo = statusInfo(tst);
    html += '<div class="row month-grid total' + (tst === 'onPace' ? '' : ' tint-' + tinfo.cls) + '">' +
      '<div>Total</div><div class="num" data-label="Spent">' + money(spent) + '</div><div class="num" data-label="Budget">' + money(budget) + '</div>' +
      '<div class="num" data-label="Left">' + money(budget - spent) + '</div>' +
      bar(budget > 0 ? spent / budget : 0, budget > 0 ? expectedAll / budget : 0, tinfo.cls) +
      '<div>' + chip(tst) + '</div></div></div>';
    return html;
  }

  // ---------- ring chart ----------

  function ringSlices(month) {
    var rows = S.rows(month);
    var total = rows.reduce(function (sum, r) { return sum + Math.max(r.spent, 0); }, 0);
    if (total <= 0) return { total: 0, slices: [] };
    var indexed = [];
    rows.forEach(function (row, index) { if (row.spent > 0) indexed.push({ index: index, row: row }); });
    indexed.sort(function (a, b) { return b.row.spent - a.row.spent; });
    var running = 0;
    var slices = indexed.map(function (item) {
      var share = item.row.spent / total;
      var st = S.rowStatus(item.row, month);
      var color = st === 'onPace' ? PALETTE[item.index % PALETTE.length] :
        (st === 'slightlyHigh' ? '#FFD23F' : '#FF7A7A');
      var slice = { name: item.row.name, amount: item.row.spent, color: color, status: st, start: running, end: running + share };
      running += share;
      return slice;
    });
    return { total: total, slices: slices };
  }

  function ringCard(month) {
    var data = ringSlices(month);
    var slices = data.slices;
    var width = 36;
    var r = 115 - width / 2;
    var C = 2 * Math.PI * r;
    var gap = slices.length > 1 ? 0.004 : 0;

    var svg = '<svg viewBox="0 0 230 230"><circle cx="115" cy="115" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="' + width + '"/>';
    slices.forEach(function (s) {
      var len = Math.max((s.end - s.start) - gap * 2, 0) * C;
      var offset = (s.start + gap) * C;
      svg += '<circle class="slice" data-name="' + esc(s.name) + '" cx="115" cy="115" r="' + r + '" fill="none" stroke="' + s.color +
        '" stroke-width="' + width + '" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-offset) +
        '" transform="rotate(-90 115 115)"/>';
    });
    svg += '</svg>';

    var center = slices.length === 0
      ? '<div class="big">' + money(0) + '</div><div class="cap">Nothing spent</div>'
      : '<div class="big" id="ring-big">' + money(data.total) + '</div><div class="cap" id="ring-cap">Spent</div>';

    var legend = '';
    if (slices.length === 0) {
      legend = '<div class="muted">No spending was logged in this month.</div>';
    }
    slices.forEach(function (s) {
      var pct = (s.end - s.start) * 100;
      var pctText = (pct > 0 && pct < 1) ? '<1%' : Math.round(pct) + '%';
      var over = s.status === 'onPace' ? '' :
        '<span class="chip small ' + statusInfo(s.status).cls + '">' + (s.status === 'slightlyHigh' ? 'A little over' : 'Way over') + '</span>';
      legend += '<div class="legend-row" data-name="' + esc(s.name) + '" data-amount="' + money(s.amount) + '">' +
        '<div class="dot" style="background:' + s.color + '"></div>' +
        '<div class="legend-name"><span>' + esc(s.name) + '</span>' + over + '</div>' +
        '<div class="strong">' + money(s.amount) + '</div><div></div>' +
        '<div class="muted right">' + pctText + '</div></div>';
    });

    return '<div class="card"><h3>Where the money went</h3>' +
      '<div class="muted small">Each slice is a category\'s share of what you spent. A slice turns yellow when that category ran a little over and red when it went way over its budget. Hover over a category to highlight it.</div>' +
      '<div class="ring-wrap"><div class="ring" data-total="' + money(data.total) + '">' + svg + '<div class="center">' + center + '</div></div>' +
      '<div class="legend">' + legend + '</div></div></div>';
  }

  function setRingHover(name) {
    var ring = document.querySelector('.ring');
    if (!ring) return;
    ring.querySelectorAll('.slice').forEach(function (el) {
      el.style.opacity = (name === null || el.getAttribute('data-name') === name) ? '1' : '0.3';
    });
    document.querySelectorAll('.legend-row').forEach(function (el) {
      el.classList.toggle('hover', name !== null && el.getAttribute('data-name') === name);
    });
    var big = document.getElementById('ring-big');
    var cap = document.getElementById('ring-cap');
    if (!big || !cap) return;
    if (name === null) {
      big.textContent = ring.getAttribute('data-total');
      cap.textContent = 'Spent';
    } else {
      var row = null;
      document.querySelectorAll('.legend-row').forEach(function (el) {
        if (el.getAttribute('data-name') === name) row = el;
      });
      big.textContent = row ? row.getAttribute('data-amount') : '';
      cap.textContent = name;
    }
  }

  // ---------- baller card ----------

  function ballerCard() {
    var crisis = S.ballerBalance() < 0;
    return '<div class="card baller' + (crisis ? ' crisis' : '') + '"><div class="baller-row">' +
      '<div><div class="eyebrow">' + esc(S.ballerTitle()) + '</div><div class="baller-amount">' + money(S.ballerBalance()) + '</div></div>' +
      '<div class="spacer"></div>' +
      '<div class="baller-note">Surplus from finished months,<br>plus funds you add.</div>' +
      '<button class="pill" data-action="open-baller">Manage</button></div></div>';
  }

  // ---------- screens ----------

  function renderHome() {
    fixFormCategory();
    var options = S.entryOptions().map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === ui.form.category ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
    var now = new Date();
    return '<div class="stack">' + saveWarning() +
      pageHead('Current month', monthName(now), '', homeActions()) +
      '<div class="card"><h3>New entry</h3><div class="stack-sm" style="margin-top:10px">' +
      '<div class="form-row">' +
      '<div><label class="label">Category</label><select data-form="category" style="width:280px">' + options + '</select></div>' +
      '<div><label class="label">Amount (' + esc(S.state.currency) + ')</label><input type="text" inputmode="decimal" placeholder="0.00" data-form="amount" data-enter="add-entry" style="width:130px" value="' + esc(ui.form.amount) + '"></div>' +
      '<div><label class="label">Date</label><input type="date" data-form="date" style="width:160px" value="' + esc(ui.form.date) + '"></div>' +
      '</div>' +
      '<div class="form-row"><div class="grow"><label class="label">What was it? (optional)</label>' +
      '<input type="text" placeholder="e.g. Coffee with Ana" data-form="name" data-enter="add-entry" value="' + esc(ui.form.name) + '"></div>' +
      '<button class="pill filled" data-action="add-entry">Enter</button></div>' +
      '<div class="msg-row"><div class="msg" id="entry-msg">' + esc(ui.message) + '</div>' +
      '<button class="pill small" data-action="undo-entry">Undo last entry</button></div>' +
      '</div></div>' +
      ballerCard() + monthTable(now) + '</div>';
  }

  function renderHistory() {
    var html = '<div class="stack">' + pageHead('All months', 'Budget History', 'Click a month to see its categories.') +
      '<div class="card"><div class="row hist-grid head"><div class="col-title">Month</div>' +
      '<div class="col-title num">Spent</div><div class="col-title num">Budget</div><div class="col-title num">Surplus / deficit</div>' +
      '<div class="col-title">Status</div><div></div></div>';
    S.historyMonths().forEach(function (month) {
      var spent = S.totalSpent(month);
      var budget = S.totalBudget(month);
      var st = S.totalStatus(month);
      var info = statusInfo(st);
      var current = isCurrentMonth(month);
      html += '<div class="row hist-grid clickable' + (st === 'onPace' ? '' : ' tint-' + info.cls) + '" data-action="open-month" data-month="' + month.getTime() + '">' +
        '<div class="strong" style="font-size:15px">' + monthName(month) + '</div>' +
        '<div class="num" data-label="Spent">' + money(spent) + '</div><div class="num muted" data-label="Budget">' + money(budget) + '</div>' +
        '<div class="num strong" data-label="Surplus / deficit">' + (current ? 'In progress' : signedMoney(budget - spent)) + '</div>' +
        '<div>' + chip(st) + '</div><div class="muted">›</div></div>';
    });
    return html + '</div></div>';
  }

  function renderMonth() {
    var month = ui.screen.month;
    var spent = S.totalSpent(month);
    var budget = S.totalBudget(month);
    var diff = budget - spent;
    var summary;
    if (isCurrentMonth(month)) {
      summary = 'In progress: ' + money(spent) + ' spent of ' + money(budget);
    } else {
      summary = money(spent) + ' spent of ' + money(budget) + ', ' + (diff >= 0 ? 'surplus ' : 'deficit ') + money(Math.abs(diff));
    }
    return '<div class="stack"><button class="back" data-action="go-history">‹ Budget History</button>' +
      pageHead('Month', monthName(month), summary) + ringCard(month) + monthTable(month) + '</div>';
  }

  function renderCategory() {
    var name = ui.screen.category;
    var items = S.state.entries.filter(function (e) { return e.category === name; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var rowsNow = S.rows(new Date());
    var found = rowsNow.filter(function (r) { return r.name === name; })[0];
    var budget = found ? found.budget : 0;
    var html = '<div class="stack">' + pageHead('Spending by category', name,
      'This month: ' + money(S.spentIn(name, new Date())) + ' of ' + money(budget)) +
      '<div class="card"><div class="row log-grid head"><div class="col-title">Date</div><div class="col-title">Name</div>' +
      '<div class="col-title num">Amount</div><div></div></div>';
    items.forEach(function (e) {
      html += '<div class="row log-grid"><div class="muted">' + dateTimeText(e.date) + '</div>' +
        '<div class="strong">' + esc(e.name || '') + '</div><div class="num strong">' + money(e.amount) + '</div>' +
        '<div class="num"><button class="pill small" data-action="delete-entry" data-id="' + esc(e.id) + '">Delete</button></div></div>';
    });
    if (items.length === 0) html += '<div class="empty">Nothing logged here yet.</div>';
    return html + '</div></div>';
  }

  function renderBallerLog() {
    var list = [];
    S.state.entries.forEach(function (e) {
      if (e.category === S.BALLER) list.push({ id: e.id, date: e.date, title: e.name || 'Spent from Baller Budget', amount: -e.amount, spending: true });
    });
    S.state.deposits.forEach(function (d) {
      list.push({ id: d.id, date: d.date, title: 'Funds added', amount: d.amount, spending: false });
    });
    list.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    var html = '<div class="stack">' + pageHead('Spending by category', S.ballerTitle(), 'Balance: ' + money(S.ballerBalance())) +
      '<div class="card stack-sm">' +
      sumLine('Starting balance', money(S.state.ballerStart)) +
      sumLine('Surplus from finished months', money(S.finishedMonthsSurplus())) +
      sumLine('Funds you added', money(S.depositsTotal())) +
      sumLine('Spent from the Baller Budget', money(-S.ballerSpent())) +
      '<div class="hr"></div><div class="sum-line strong" style="font-size:16px"><span>Balance</span><span>' + money(S.ballerBalance()) + '</span></div></div>' +
      '<div class="card"><div class="row log-grid head"><div class="col-title">Date</div><div class="col-title">What</div>' +
      '<div class="col-title num">Amount</div><div></div></div>';
    list.forEach(function (r) {
      html += '<div class="row log-grid"><div class="muted">' + dateTimeText(r.date) + '</div>' +
        '<div class="strong">' + esc(r.title) + '</div>' +
        '<div class="num strong' + (r.amount >= 0 ? ' green-text' : '') + '">' + signedMoney(r.amount) + '</div>' +
        '<div class="num"><button class="pill small" data-action="' + (r.spending ? 'delete-entry' : 'delete-deposit') + '" data-id="' + esc(r.id) + '">Delete</button></div></div>';
    });
    if (list.length === 0) html += '<div class="empty">No funds added or spending yet.</div>';
    return html + '</div></div>';
  }

  function sumLine(label, value) {
    return '<div class="sum-line"><span>' + esc(label) + '</span><span>' + value + '</span></div>';
  }

  // ---------- sidebar ----------

  function renderSidebar() {
    var sc = ui.screen;
    var inHistory = sc.name === 'history' || sc.name === 'month';
    var html = '<div class="logo"><b>Stipend</b>Tracker</div>' +
      '<button class="nav' + (sc.name === 'home' ? ' active' : '') + '" data-action="go-home">Home</button>' +
      '<button class="nav' + (inHistory ? ' active' : '') + '" data-action="go-history">Budget History</button>' +
      '<button class="nav" data-action="toggle-cats">Spending by Category<span class="chev">' + (ui.showCategories ? '▲' : '▼') + '</span></button>';
    if (ui.showCategories) {
      S.sidebarItems().forEach(function (item) {
        var active = sc.name === 'category' && sc.category === item.name;
        html += '<button class="nav sub' + (active ? ' active' : '') + '" data-action="open-category" data-name="' + esc(item.name) + '">' + esc(item.label) + '</button>';
      });
    }
    return html;
  }

  // ---------- modals ----------

  function renderBallerModal() {
    var deposits = S.state.deposits.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var list = deposits.map(function (d) {
      return '<div class="edit-row"><span class="grow">' + dateText(d.date) + '</span><span>' + money(d.amount) + '</span>' +
        '<button class="pill small" data-action="delete-deposit-modal" data-id="' + esc(d.id) + '">Delete</button></div>';
    }).join('');
    if (!list) list = '<div class="muted">No funds added yet.</div>';
    return '<div class="overlay"><div class="modal narrow"><h2 id="b-title">' + esc(S.ballerTitle()) + '</h2>' +
      '<div class="card stack-sm">' +
      '<div class="edit-row"><span class="grow">Starting balance</span><input type="text" class="right" style="width:120px" data-baller-start value="' + S.state.ballerStart + '"></div>' +
      '<div class="sum-line"><span>Surplus from finished months</span><span id="b-surplus">' + money(S.finishedMonthsSurplus()) + '</span></div>' +
      '<div class="sum-line"><span>Funds you added</span><span id="b-deposits">' + money(S.depositsTotal()) + '</span></div>' +
      '<div class="sum-line"><span>Spent from the Baller Budget</span><span id="b-spent">' + money(-S.ballerSpent()) + '</span></div>' +
      '<div class="hr"></div><div class="sum-line strong" style="font-size:16px"><span>Balance</span><span id="b-balance">' + money(S.ballerBalance()) + '</span></div></div>' +
      '<div class="card stack-sm"><h3>Add funds</h3><div class="edit-row">' +
      '<input type="text" inputmode="decimal" placeholder="Amount (' + esc(S.state.currency) + ')" style="width:160px" id="b-add" data-enter="add-funds">' +
      '<button class="pill filled" data-action="add-funds">Add funds</button><span class="muted small">' + esc(ui.ballerMsg) + '</span></div>' +
      '<h3 style="margin-top:6px">Funds added</h3>' + list + '</div>' +
      '<div class="modal-actions"><button class="pill filled" data-action="close-modal">Done</button></div></div></div>';
  }

  function categoryEditRows() {
    return S.state.categories.filter(function (c) { return !c.archived; }).map(function (c) {
      return '<div class="edit-row">' +
        '<input type="text" class="grow" data-cat="' + esc(c.id) + '" data-field="name" value="' + esc(c.name) + '">' +
        '<label class="check"><input type="checkbox" data-cat="' + esc(c.id) + '" data-field="fixed"' + (c.isFixedBill ? ' checked' : '') + '> Fixed bill</label>' +
        '<input type="text" inputmode="decimal" class="right" style="width:90px" data-cat="' + esc(c.id) + '" data-field="budget" value="' + c.monthlyBudget + '">' +
        '<button class="pill small" data-action="archive-cat" data-id="' + esc(c.id) + '">Archive</button></div>';
    }).join('');
  }

  function installCard() {
    if (!isWeb || isStandalone) return '';
    return '<div class="card stack-sm"><h3>Install and use offline</h3>' +
      '<div class="muted small">Installing puts StipendTracker on your home screen or desktop. It then opens like a normal app and works with no internet. On an iPhone, installing also stops Safari from clearing your data after a week of not using it. On iPhone: tap the Share button in Safari, then "Add to Home Screen". On Android or a computer, use the button below if it appears, or your browser\'s "Install app" menu item.</div>' +
      (installPrompt ? '<div><button class="pill small filled" data-action="install-app">Install app</button></div>' : '') + '</div>';
  }

  function renderSettingsModal() {
    var archived = S.state.categories.filter(function (c) { return c.archived; });
    var archivedHtml = archived.map(function (c) {
      return '<div class="edit-row"><span class="grow">' + esc(c.name) + '</span>' +
        '<button class="pill small" data-action="restore-cat" data-id="' + esc(c.id) + '">Restore</button></div>';
    }).join('');
    if (!archivedHtml) archivedHtml = '<div class="muted">None.</div>';

    var resetBlock;
    if (ui.confirmReset) {
      resetBlock = '<div class="strong">Reset everything?</div><div class="muted small">This deletes every entry, deposit and budget and takes you back to the setup screen. It can\'t be undone.</div>' +
        '<div class="edit-row"><button class="pill small filled" data-action="confirm-reset">Reset</button><button class="pill small" data-action="cancel-reset">Cancel</button></div>';
    } else {
      resetBlock = '<div class="muted small">Deletes all your data and starts again from the setup screen.</div>' +
        '<div><button class="pill small" data-action="ask-reset">Reset all data…</button></div>';
    }

    var importBlock = '';
    if (ui.pendingImport) {
      importBlock = '<div class="strong">Replace all your current data with this backup?</div>' +
        '<div class="edit-row"><button class="pill small filled" data-action="confirm-import">Replace</button><button class="pill small" data-action="cancel-import">Cancel</button></div>';
    }
    if (ui.importError) importBlock += '<div class="error small">' + esc(ui.importError) + '</div>';

    return '<div class="overlay"><div class="modal"><h2>Settings</h2>' +
      '<div class="card stack-sm"><h3>Categories and monthly budgets</h3>' +
      '<div class="muted small">Budget changes apply from this month onward. Past months keep the budgets they had. Turn on "Fixed bill" for something you pay in one go, like rent. Renaming a category renames it in your past entries too.</div>' +
      categoryEditRows() + '</div>' +
      '<div class="card stack-sm"><h3>Add a category</h3><div class="edit-row">' +
      '<input type="text" class="grow" placeholder="Name" id="new-cat-name" data-enter="add-cat">' +
      '<input type="text" inputmode="decimal" class="right" placeholder="Budget" style="width:100px" id="new-cat-budget" data-enter="add-cat">' +
      '<button class="pill filled" data-action="add-cat">Add</button></div>' +
      '<div class="muted small" id="add-cat-msg">' + esc(ui.settingsMsg) + '</div></div>' +
      '<div class="card stack-sm"><h3>Archived categories</h3><div class="muted small">Archived categories are hidden from now on. Their past spending stays in your history.</div>' + archivedHtml + '</div>' +
      '<div class="card stack-sm"><h3>Currency</h3><div class="muted small">Only the symbol changes. Nothing is converted.</div>' +
      '<div class="seg"><button data-action="set-currency" data-value="€" class="' + (S.state.currency === '€' ? 'on' : '') + '">€ Euro</button>' +
      '<button data-action="set-currency" data-value="$" class="' + (S.state.currency === '$' ? 'on' : '') + '">$ Dollar</button></div></div>' +
      '<div class="card stack-sm"><h3>Backup</h3><div class="muted small">Your data lives only on this device. Save a backup file now and then, and keep it somewhere safe.</div>' +
      '<div class="edit-row"><button class="pill small" data-action="export-backup">Save backup file</button>' +
      '<button class="pill small" data-action="pick-import">Restore from backup…</button>' +
      '<input type="file" id="import-file" accept=".json,application/json" style="display:none"></div>' + importBlock + '</div>' +
      installCard() +
      '<div class="card stack-sm"><h3>Reset</h3>' + resetBlock + '</div>' +
      '<div class="modal-actions"><button class="pill filled" data-action="close-modal">Done</button></div></div></div>';
  }

  // ---------- PDF import ----------

  function homeActions() {
    var html = '';
    if (ui.lastBatch) html += '<button class="pill small" data-action="undo-import">Undo import</button>';
    html += '<button class="pill" data-action="import-pdf">Import PDF</button>' +
      '<input type="file" id="pdf-file" accept="application/pdf,.pdf" style="display:none">' +
      '<button class="pill" data-action="open-settings">Settings</button>';
    return html;
  }

  function buildReview(result, fileName) {
    var options = S.entryOptions();
    var fallback = options.indexOf('Other') >= 0 ? 'Other' : (options[0] || '');
    var known = {};
    S.state.importedKeys.forEach(function (k) { known[k] = true; });
    var start = S.state.trackingStart ? new Date(S.state.trackingStart) : null;
    var rows = result.transactions.map(function (t) {
      var category = fallback;
      var hadRule = false;
      var rule = S.state.merchantRules[t.merchantKey];
      if (rule && options.indexOf(rule) >= 0) {
        category = rule;
        hadRule = true;
      } else {
        var guess = BankImport.starterSuggestion(t.merchantKey, options);
        if (guess) category = guess;
      }
      var duplicate = !!known[t.fingerprint];
      var before = !!(start && t.date < start);
      var note = duplicate ? 'Already imported' : (before ? 'Before your start date' : '');
      return {
        include: !duplicate && !before,
        date: t.date,
        amount: t.amount,
        name: t.name,
        category: category,
        remember: !hadRule && t.merchantKey.indexOf('bizum ') !== 0,
        key: t.merchantKey,
        fp: t.fingerprint,
        note: note
      };
    });
    return { fileName: fileName, result: result, rows: rows };
  }

  function importChosen() {
    return ui.review.rows.filter(function (r) { return r.include; });
  }

  function importFooterText() {
    var chosen = importChosen();
    var total = chosen.reduce(function (sum, r) { return sum + r.amount; }, 0);
    return chosen.length + ' selected · ' + money(total);
  }

  function renderImportModal() {
    var r = ui.review;
    var options = S.entryOptions();
    var summary = r.result.transactions.length + ' purchases found in ' + r.fileName;
    if (r.result.skippedIncoming > 0) summary += ' · ' + r.result.skippedIncoming + ' incoming payments skipped';

    var html = '<div class="overlay"><div class="modal wide"><h2>Review import</h2>' +
      '<div class="muted small">' + esc(summary) + '</div>';

    if (r.result.unreadable.length) {
      html += '<div class="small" style="color:var(--yellow)">' + r.result.unreadable.length +
        " lines couldn't be read and were left out:<br>" +
        r.result.unreadable.slice(0, 4).map(function (t) { return '<span class="muted">' + esc(t) + '</span>'; }).join('<br>') + '</div>';
    }

    if (r.rows.length === 0) {
      html += '<div class="strong">I couldn\'t find any purchases in this PDF.</div>' +
        '<div class="muted small">Here is the text the app could read. If you copy it (check for personal details first) or screenshot it and send it to me, I can fix the reader.</div>' +
        '<div class="sample">' + esc(r.result.sample) + '</div>' +
        '<div class="modal-actions"><button class="pill filled" data-action="imp-cancel">Close</button></div></div></div>';
      return html;
    }

    html += '<div class="imp-toolbar">' +
      '<button class="pill small" data-action="imp-include" data-value="1">Select all</button>' +
      '<button class="pill small" data-action="imp-include" data-value="0">Select none</button>' +
      '<span class="grow muted small" style="text-align:right">Changed your mind about a store? Pick its new category and tick Remember.</span>' +
      '<button class="pill small" data-action="imp-remember" data-value="1">Remember all</button>' +
      '<button class="pill small" data-action="imp-remember" data-value="0">Remember none</button></div>' +
      '<div class="imp-list">';

    r.rows.forEach(function (row, i) {
      var opts = options.map(function (name) {
        return '<option value="' + esc(name) + '"' + (name === row.category ? ' selected' : '') + '>' + esc(name) + '</option>';
      }).join('');
      html += '<div class="row imp-grid' + (row.include ? '' : ' off') + '" data-row="' + i + '">' +
        '<input type="checkbox" data-imp="include" data-i="' + i + '"' + (row.include ? ' checked' : '') + '>' +
        '<span class="muted">' + row.date.toLocaleString('en-US', { day: 'numeric', month: 'short' }) + '</span>' +
        '<div><input type="text" data-imp="name" data-i="' + i + '" value="' + esc(row.name) + '">' +
        (row.note ? '<div class="imp-note">' + esc(row.note) + '</div>' : '') + '</div>' +
        '<select data-imp="category" data-i="' + i + '">' + opts + '</select>' +
        '<span class="num strong">' + money(row.amount) + '</span>' +
        '<label class="check"><input type="checkbox" data-imp="remember" data-i="' + i + '"' + (row.remember ? ' checked' : '') + '> Remember</label></div>';
    });

    var n = importChosen().length;
    html += '</div><div class="msg-row"><span class="strong" id="imp-count">' + esc(importFooterText()) + '</span>' +
      '<span class="head-actions"><button class="pill" data-action="imp-cancel">Cancel</button>' +
      '<button class="pill filled" id="imp-run" data-action="imp-run"' + (n === 0 ? ' disabled' : '') + '>Import ' + n + '</button></span></div>' +
      '</div></div>';
    return html;
  }

  function updateImportFooter() {
    var n = importChosen().length;
    var count = document.getElementById('imp-count');
    var run = document.getElementById('imp-run');
    if (count) count.textContent = importFooterText();
    if (run) {
      run.textContent = 'Import ' + n;
      run.disabled = n === 0;
    }
  }

  function runImport() {
    var chosen = importChosen();
    if (chosen.length === 0) return;
    var list = [];
    var fps = [];
    var rules = {};
    var total = 0;
    chosen.forEach(function (row) {
      list.push({ category: row.category, amount: row.amount, date: row.date, name: row.name.trim() });
      fps.push(row.fp);
      total += row.amount;
      if (row.remember) rules[row.key] = row.category;
    });
    var ids = S.addImported(list, fps, rules);
    ui.lastBatch = { ids: ids, fps: fps };
    ui.message = 'Imported ' + chosen.length + ' entries totaling ' + money(total) + '.';
    ui.modal = null;
    ui.review = null;
    render();
  }

  function handlePdfFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      BankImport.readPdf(reader.result).then(function (text) {
        if (!text.trim()) {
          ui.message = "Couldn't read that PDF: it has no readable text. Download the movements PDF from the Santander app and try again.";
          render();
          return;
        }
        ui.review = buildReview(BankImport.parse(text), file.name);
        ui.modal = 'import';
        render();
      }).catch(function () {
        ui.message = "Couldn't read that PDF. Is it the movements file from Santander?";
        render();
      });
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------- setup ----------

  function ensureSetup() {
    if (ui.setup) return;
    ui.setup = {
      currency: '€',
      ballerText: '0',
      error: '',
      cats: S.state.categories.map(function (c) {
        return { key: S.newId(), name: c.name, budgetText: '0', fixed: c.isFixedBill };
      })
    };
  }

  function setupTotal() {
    var total = 0;
    ui.setup.cats.forEach(function (c) {
      var n = S.parseAmount(c.budgetText);
      if (n !== null) total += n;
    });
    var text = Math.abs(total - Math.round(total)) < 1e-9 ? String(Math.round(total)) : total.toFixed(2);
    return ui.setup.currency + text;
  }

  function renderSetup() {
    ensureSetup();
    var s = ui.setup;
    var cats = s.cats.map(function (c) {
      return '<div class="edit-row">' +
        '<input type="text" class="grow" placeholder="Category name" data-setup="name" data-key="' + esc(c.key) + '" value="' + esc(c.name) + '">' +
        '<label class="check"><input type="checkbox" data-setup="fixed" data-key="' + esc(c.key) + '"' + (c.fixed ? ' checked' : '') + '> Fixed bill</label>' +
        '<input type="text" inputmode="decimal" class="right" placeholder="Budget" style="width:100px" data-setup="budget" data-key="' + esc(c.key) + '" value="' + esc(c.budgetText) + '">' +
        '<button class="pill small" data-action="setup-remove" data-key="' + esc(c.key) + '">Remove</button></div>';
    }).join('');
    return '<div class="setup">' + saveWarning() +
      '<div class="logo-lg"><b style="font-weight:800">Stipend</b>Tracker</div>' +
      '<div class="muted" style="font-size:15px;margin-top:-10px">Let\'s set up your budget. You can change all of this later in Settings.</div>' +
      '<div class="card stack-sm"><h3>Currency</h3><div class="seg">' +
      '<button data-action="setup-currency" data-value="€" class="' + (s.currency === '€' ? 'on' : '') + '">€ Euro</button>' +
      '<button data-action="setup-currency" data-value="$" class="' + (s.currency === '$' ? 'on' : '') + '">$ Dollar</button></div></div>' +
      '<div class="card stack-sm"><h3>Starting Baller Budget</h3>' +
      '<div class="muted small">Savings you already have to spend freely. Leave it at 0 if you\'re starting fresh.</div>' +
      '<input type="text" inputmode="decimal" style="width:160px" data-setup="baller" value="' + esc(s.ballerText) + '"></div>' +
      '<div class="card stack-sm"><h3>Categories and monthly budgets</h3>' +
      '<div class="muted small">Type a monthly budget for each category. Turn on "Fixed bill" for something you pay in one go, like rent.</div>' +
      '<div class="total-banner"><span class="t">Total monthly budget</span><span class="v" id="setup-total">' + esc(setupTotal()) + '</span></div>' +
      cats + '<div><button class="pill small" data-action="setup-add">Add category</button></div></div>' +
      '<div class="error" id="setup-error">' + esc(s.error) + '</div>' +
      '<div><button class="pill filled" data-action="setup-finish">Start tracking</button></div></div>';
  }

  function finishSetup() {
    var s = ui.setup;
    var result = [];
    var seen = {};
    for (var i = 0; i < s.cats.length; i++) {
      var c = s.cats[i];
      var name = c.name.trim();
      if (!name) { s.error = 'Every category needs a name.'; return false; }
      if (name.toLowerCase() === S.BALLER.toLowerCase()) { s.error = '"Baller Budget" is already built in. Pick another name.'; return false; }
      if (seen[name.toLowerCase()]) { s.error = 'Two categories are named "' + name + '".'; return false; }
      seen[name.toLowerCase()] = true;
      var budget = S.parseAmount(c.budgetText);
      if (budget === null || budget < 0) { s.error = 'Check the budget for ' + name + '.'; return false; }
      result.push({ name: name, monthlyBudget: budget, isFixedBill: c.fixed });
    }
    if (result.length === 0) { s.error = 'Add at least one category.'; return false; }
    var start = S.parseAmount(s.ballerText);
    if (start === null) { s.error = 'Check the starting Baller Budget.'; return false; }
    S.completeSetup({ currency: s.currency, ballerStart: start, categories: result });
    return true;
  }

  // ---------- render ----------

  function render() {
    var app = document.getElementById('app');
    if (!S.state.hasCompletedSetup) {
      app.innerHTML = '<div style="height:100%;overflow-y:auto">' + renderSetup() + '</div>';
      return;
    }
    var sc = ui.screen;
    var main;
    if (sc.name === 'home') main = renderHome();
    else if (sc.name === 'history') main = renderHistory();
    else if (sc.name === 'month') main = renderMonth();
    else if (sc.category === S.BALLER) main = renderBallerLog();
    else main = renderCategory();
    var modal = '';
    if (ui.modal === 'settings') modal = renderSettingsModal();
    else if (ui.modal === 'baller') modal = renderBallerModal();
    else if (ui.modal === 'import' && ui.review) modal = renderImportModal();
    app.innerHTML = '<div class="shell' + (ui.menuOpen ? ' menu-open' : '') + '">' +
      '<div class="topbar"><button class="menu-btn" data-action="open-menu" aria-label="Menu">☰</button><div class="logo-sm"><b>Stipend</b>Tracker</div></div>' +
      '<div class="scrim" data-action="close-menu"></div>' +
      '<div class="sidebar">' + renderSidebar() + '</div><div class="main" id="main">' + main + '</div></div>' + modal;
  }

  function go(screen) {
    ui.screen = screen;
    ui.menuOpen = false;
    render();
    var main = document.getElementById('main');
    if (main) main.scrollTop = 0;
  }

  // ---------- actions ----------

  function addEntryFromForm() {
    var amount = S.parseAmount(ui.form.amount);
    if (amount === null || amount === 0) {
      ui.message = 'Type an amount first.';
      render();
      return;
    }
    amount = Math.abs(amount);
    var name = ui.form.name.trim();
    var when = new Date();
    var parts = (ui.form.date || todayString()).split('-');
    var picked = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var today = new Date();
    var isToday = picked.getFullYear() === today.getFullYear() && picked.getMonth() === today.getMonth() && picked.getDate() === today.getDate();
    if (!isToday) when = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 12, 0, 0);

    var category = ui.form.category;
    S.addEntry({ category: category, amount: amount, date: when, name: name });
    ui.form.amount = '';
    ui.form.name = '';
    ui.form.date = todayString();
    var suffix = name ? ' (' + name + ')' : '';

    if (category === S.BALLER) {
      ui.message = 'Spent ' + money(amount) + suffix + ' from the Baller Budget. Balance: ' + money(S.ballerBalance()) + '.';
    } else {
      ui.message = 'Added ' + money(amount) + ' to ' + category + suffix + '.';
      if (S.sameMonth(when, new Date())) {
        var row = S.rows(new Date()).filter(function (r) { return r.name === category; })[0];
        if (row) {
          var st = S.rowStatus(row, new Date());
          if (st === 'slightlyHigh') ui.message += " Heads up: that's a little high for this point in the month.";
          else if (st === 'wayOver') ui.message += " Warning: that's way over where you should be.";
        }
      }
    }
    render();
    var amountInput = document.querySelector('[data-form="amount"]');
    if (amountInput) amountInput.focus();
  }

  function undoEntry() {
    var removed = S.removeLastEntry();
    if (!removed) {
      ui.message = 'Nothing to undo.';
    } else {
      ui.message = 'Removed ' + money(removed.amount) + ' from ' + removed.category + (removed.name ? ' (' + removed.name + ')' : '') + '.';
    }
    render();
  }

  function addFunds() {
    var input = document.getElementById('b-add');
    var value = S.parseAmount(input ? input.value : '');
    if (value === null || value <= 0) {
      ui.ballerMsg = 'Type an amount first.';
    } else {
      S.addDeposit(value);
      ui.ballerMsg = 'Added ' + money(value) + '.';
    }
    render();
  }

  function addCategoryFromModal() {
    var nameInput = document.getElementById('new-cat-name');
    var budgetInput = document.getElementById('new-cat-budget');
    var budgetText = budgetInput.value.trim();
    var budget = budgetText === '' ? 0 : S.parseAmount(budgetText);
    if (budget === null || budget < 0) {
      ui.settingsMsg = 'Check the budget amount.';
    } else if (S.addCategory(nameInput.value, budget, false)) {
      ui.settingsMsg = 'Added ' + nameInput.value.trim() + '.';
    } else {
      ui.settingsMsg = 'That name is empty or already used.';
    }
    render();
  }

  function exportBackup() {
    var blob = new Blob([S.exportJSON()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'StipendTracker-backup-' + todayString() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function handleAction(action, el) {
    switch (action) {
      case 'open-menu': ui.menuOpen = true; render(); break;
      case 'close-menu': ui.menuOpen = false; render(); break;
      case 'install-app':
        if (installPrompt) {
          installPrompt.prompt();
          installPrompt = null;
          render();
        }
        break;
      case 'go-home': go({ name: 'home' }); break;
      case 'go-history': go({ name: 'history' }); break;
      case 'toggle-cats': ui.showCategories = !ui.showCategories; render(); break;
      case 'open-category': go({ name: 'category', category: el.getAttribute('data-name') }); break;
      case 'open-month': go({ name: 'month', month: new Date(Number(el.getAttribute('data-month'))) }); break;
      case 'add-entry': addEntryFromForm(); break;
      case 'undo-entry': undoEntry(); break;
      case 'delete-entry': S.removeEntry(el.getAttribute('data-id')); render(); break;
      case 'delete-deposit': S.removeDeposit(el.getAttribute('data-id')); render(); break;
      case 'delete-deposit-modal': S.removeDeposit(el.getAttribute('data-id')); render(); break;
      case 'open-settings': ui.modal = 'settings'; ui.settingsMsg = ''; ui.confirmReset = false; ui.pendingImport = null; ui.importError = ''; render(); break;
      case 'open-baller': ui.modal = 'baller'; ui.ballerMsg = ''; render(); break;
      case 'close-modal': ui.modal = null; render(); break;
      case 'add-funds': addFunds(); break;
      case 'add-cat': addCategoryFromModal(); break;
      case 'archive-cat': S.setArchived(el.getAttribute('data-id'), true); render(); break;
      case 'restore-cat': S.setArchived(el.getAttribute('data-id'), false); render(); break;
      case 'set-currency': S.setCurrency(el.getAttribute('data-value')); render(); break;
      case 'export-backup': exportBackup(); break;
      case 'pick-import': document.getElementById('import-file').click(); break;
      case 'confirm-import': {
        var result = S.importJSON(ui.pendingImport);
        ui.pendingImport = null;
        ui.importError = result.ok ? '' : result.error;
        if (result.ok) { ui.modal = null; ui.setup = null; ui.screen = { name: 'home' }; }
        render();
        break;
      }
      case 'cancel-import': ui.pendingImport = null; render(); break;
      case 'ask-reset': ui.confirmReset = true; render(); break;
      case 'cancel-reset': ui.confirmReset = false; render(); break;
      case 'confirm-reset':
        S.resetAll();
        ui.confirmReset = false; ui.modal = null; ui.setup = null; ui.screen = { name: 'home' };
        ui.form = { category: '', amount: '', name: '', date: '' }; ui.message = '';
        render();
        break;
      case 'setup-currency': ui.setup.currency = el.getAttribute('data-value'); render(); break;
      case 'setup-add': ui.setup.cats.push({ key: S.newId(), name: '', budgetText: '0', fixed: false }); render(); break;
      case 'setup-remove':
        ui.setup.cats = ui.setup.cats.filter(function (c) { return c.key !== el.getAttribute('data-key'); });
        render();
        break;
      case 'setup-finish':
        if (finishSetup()) {
          ui.setup = null; ui.screen = { name: 'home' };
          ui.form = { category: '', amount: '', name: '', date: '' }; ui.message = '';
          render();
        } else {
          document.getElementById('setup-error').textContent = ui.setup.error;
        }
        break;
      case 'import-pdf': document.getElementById('pdf-file').click(); break;
      case 'undo-import':
        if (ui.lastBatch) {
          S.undoImport(ui.lastBatch.ids, ui.lastBatch.fps);
          ui.lastBatch = null;
          ui.message = 'Import undone. Stores you chose to remember are still remembered.';
          render();
        }
        break;
      case 'imp-cancel': ui.modal = null; ui.review = null; render(); break;
      case 'imp-include':
        ui.review.rows.forEach(function (row) {
          if (row.note !== 'Already imported') row.include = el.getAttribute('data-value') === '1';
        });
        render();
        break;
      case 'imp-remember':
        ui.review.rows.forEach(function (row) { row.remember = el.getAttribute('data-value') === '1'; });
        render();
        break;
      case 'imp-run': runImport(); break;
      default: break;
    }
  }

  // ---------- events ----------

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el) handleAction(el.getAttribute('data-action'), el);
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-imp') === 'name' && ui.review) {
      ui.review.rows[Number(t.getAttribute('data-i'))].name = t.value;
      return;
    }
    if (t.hasAttribute('data-form')) {
      ui.form[t.getAttribute('data-form')] = t.value;
      return;
    }
    if (t.hasAttribute('data-setup') && ui.setup) {
      var kind = t.getAttribute('data-setup');
      if (kind === 'baller') { ui.setup.ballerText = t.value; return; }
      var cat = ui.setup.cats.filter(function (c) { return c.key === t.getAttribute('data-key'); })[0];
      if (!cat) return;
      if (kind === 'name') cat.name = t.value;
      if (kind === 'budget') {
        cat.budgetText = t.value;
        document.getElementById('setup-total').textContent = setupTotal();
      }
    }
  });

  function refreshBallerNumbers() {
    var map = {
      'b-title': S.ballerTitle(),
      'b-surplus': money(S.finishedMonthsSurplus()),
      'b-deposits': money(S.depositsTotal()),
      'b-spent': money(-S.ballerSpent()),
      'b-balance': money(S.ballerBalance())
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = map[id];
    });
  }

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-imp') && ui.review) {
      var rowIndex = Number(t.getAttribute('data-i'));
      var field = t.getAttribute('data-imp');
      var row = ui.review.rows[rowIndex];
      if (field === 'include') {
        row.include = t.checked;
        var rowEl = t.closest('.row');
        if (rowEl) rowEl.classList.toggle('off', !t.checked);
        updateImportFooter();
      } else if (field === 'remember') {
        row.remember = t.checked;
      } else if (field === 'category') {
        row.category = t.value;
      }
      return;
    }
    if (t.id === 'pdf-file') {
      var pdf = t.files && t.files[0];
      t.value = '';
      if (pdf) handlePdfFile(pdf);
      return;
    }
    if (t.hasAttribute('data-setup') && t.getAttribute('data-setup') === 'fixed' && ui.setup) {
      var cat = ui.setup.cats.filter(function (c) { return c.key === t.getAttribute('data-key'); })[0];
      if (cat) cat.fixed = t.checked;
      return;
    }
    if (t.hasAttribute('data-cat')) {
      var id = t.getAttribute('data-cat');
      var field = t.getAttribute('data-field');
      if (field === 'name') {
        if (!S.renameCategory(id, t.value)) {
          var original = S.state.categories.filter(function (c) { return c.id === id; })[0];
          if (original) t.value = original.name;
        }
      } else if (field === 'fixed') {
        S.updateCategory(id, { isFixedBill: t.checked });
      } else if (field === 'budget') {
        var n = S.parseAmount(t.value);
        if (n !== null && n >= 0) {
          S.updateCategory(id, { monthlyBudget: n });
        } else {
          var cur = S.state.categories.filter(function (c) { return c.id === id; })[0];
          if (cur) t.value = cur.monthlyBudget;
        }
      }
      return;
    }
    if (t.hasAttribute('data-baller-start')) {
      var v = S.parseAmount(t.value);
      if (v !== null) S.setBallerStart(v); else t.value = S.state.ballerStart;
      refreshBallerNumbers();
      return;
    }
    if (t.hasAttribute('data-form')) {
      ui.form[t.getAttribute('data-form')] = t.value;
      return;
    }
    if (t.id === 'import-file') {
      var file = t.files && t.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        ui.pendingImport = String(reader.result);
        ui.importError = '';
        render();
      };
      reader.readAsText(file);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ui.menuOpen && !ui.modal) {
      ui.menuOpen = false;
      render();
      return;
    }
    if (e.key === 'Escape' && ui.modal) {
      ui.modal = null;
      ui.review = null;
      render();
      return;
    }
    if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-enter')) {
      e.preventDefault();
      handleAction(e.target.getAttribute('data-enter'), e.target);
    }
  });

  document.addEventListener('mouseover', function (e) {
    var row = e.target.closest ? e.target.closest('.legend-row') : null;
    if (row) setRingHover(row.getAttribute('data-name'));
  });

  document.addEventListener('mouseout', function (e) {
    var row = e.target.closest ? e.target.closest('.legend-row') : null;
    if (row && !(e.relatedTarget && row.contains(e.relatedTarget))) setRingHover(null);
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    if (ui.modal === 'settings') render();
  });

  // Ask the browser to keep our data instead of clearing it when space is low.
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (err) { /* not important */ }

  // Offline support: only on a real website, not when opened as a file or inside the desktop app.
  if (isWeb && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline mode just won't be available */ });
    });
  }

  render();
})();
