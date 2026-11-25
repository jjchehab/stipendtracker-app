/* StipendTracker: screens. Everything is drawn from the data in store.js. */
(function () {
  'use strict';

  var S = window.Store;
  var I18N = window.I18N;
  var T = I18N.t;
  var money = S.money;
  var signedMoney = S.signedMoney;

  var PALETTE = ['#72A5F7', '#C79BFF', '#5ED6E8', '#A8B4FF', '#40C8BE', '#E6A0FF', '#8CD2FF', '#B478F0', '#CDC8EB', '#BEEBF5'];

  var ui = {
    screen: { name: 'home', month: null, category: null },
    showCategories: true,
    modal: null,            // 'settings' | 'baller' | null
    message: '',
    form: { category: '', amount: '', name: '', date: '', currency: '' },
    rate: null,             // result of the latest exchange-rate lookup for the entry form
    busy: false,
    setup: null,
    settingsMsg: '',
    ballerMsg: '',
    confirmReset: false,
    pendingImport: null,
    importError: '',
    review: null,
    lastBatch: null,
    menuOpen: false,
    edit: null,
    periodMsg: '',
    rec: { category: '', amount: '', name: '', day: 1 },
    recMsg: '',
    trendSel: null,
    calKey: ''
  };

  var installPrompt = null;
  var isStandalone = !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone);
  var isWeb = /^https?:$/.test(window.location.protocol);

  // ---------- small helpers ----------

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pl(n, one, many, vars) {
    vars = vars || {};
    vars.n = n;
    return T(n === 1 ? one : many, vars);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function todayString() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function monthName(d) {
    var range = S.periodRange(d);
    if (range.custom) {
      var short = { month: 'short', day: 'numeric' };
      return range.start.toLocaleString(I18N.loc(), short) + ' – ' + range.end.toLocaleString(I18N.loc(), { month: 'short', day: 'numeric', year: 'numeric' });
    }
    var s = d.toLocaleString(I18N.loc(), { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function dateTimeText(iso) {
    return new Date(iso).toLocaleString(I18N.loc(), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function dateText(iso) {
    return new Date(iso).toLocaleString(I18N.loc(), { month: 'short', day: 'numeric', year: 'numeric' });
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

  var CURRENCIES = ['€', '$', '£'];

  function formCurrency() {
    return CURRENCIES.indexOf(ui.form.currency) >= 0 ? ui.form.currency : S.state.currency;
  }

  function formIsForeign() {
    return formCurrency() !== S.state.currency;
  }

  function formDate() {
    var parts = (ui.form.date || todayString()).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
  }

  function shortDate(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3) return String(iso);
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleString(I18N.loc(), { month: 'short', day: 'numeric' });
  }

  /** The small line under the entry form that explains the conversion. */
  function rateHintText() {
    if (!formIsForeign()) return '';
    var from = formCurrency();
    var main = S.state.currency;
    var r = ui.rate;
    if (!r || r.from !== from || r.day !== ui.form.date) return T('Looking up the exchange rate…');
    if (r.failed) return T('No exchange rate is saved yet. Connect to the internet once, then try again.');
    var line = '1 ' + from + ' = ' + main + r.rate.toFixed(4);
    if (r.source === 'old') {
      line = T('Offline: using the saved rate from {date} ({line}).', { date: shortDate(r.asOf), line: line });
    } else if (r.asOf) {
      line += ' · ' + T('rate from {date}', { date: shortDate(r.asOf) });
    }
    var amount = S.parseAmount(ui.form.amount);
    if (amount !== null && amount > 0) {
      line += ' · ' + T('adds {amount}', { amount: main + (Math.round(Math.abs(amount) * r.rate * 100) / 100).toFixed(2) });
    }
    return line;
  }

  function updateRateHint() {
    var el = document.getElementById('rate-hint');
    if (el) el.textContent = rateHintText();
  }

  function lookupRate() {
    if (!formIsForeign()) { ui.rate = null; updateRateHint(); return; }
    var from = formCurrency();
    var day = ui.form.date;
    S.getRate(from, S.state.currency, formDate()).then(function (r) {
      if (formCurrency() !== from || ui.form.date !== day) return;
      ui.rate = { from: from, day: day, rate: r.rate, asOf: r.asOf, source: r.source, failed: false };
      updateRateHint();
    }).catch(function () {
      if (formCurrency() !== from || ui.form.date !== day) return;
      ui.rate = { from: from, day: day, rate: 0, asOf: null, source: 'none', failed: true };
      updateRateHint();
    });
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

  function backupBanner() {
    if (!S.backupDue()) return '';
    return '<div class="warn banner"><div>It has been over a month since your last backup. Save a copy so your data stays safe.</div>' +
      '<div class="banner-actions"><button class="pill small filled" data-action="backup-now">Save backup now</button>' +
      '<button class="pill small" data-action="snooze-backup">Remind me later</button></div></div>';
  }

  function pageHead(eyebrow, title, subtitle, actionsHtml, userTitle) {
    return '<div class="page-head"><div><div class="eyebrow">' + esc(eyebrow) + '</div>' +
      '<h1 class="title"' + (userTitle ? ' translate="no"' : '') + '>' + esc(title) + '</h1>' +
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
      caption = T('First days of the month: pace warnings start on day {day}. Until then, only going over a full budget is flagged.', { day: S.GRACE_DAYS + 1 });
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
        '<div class="strong" translate="no">' + esc(row.name) + '</div>' +
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
        '<div class="legend-name"><span translate="no">' + esc(s.name) + '</span>' + over + '</div>' +
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
      cap.textContent = T('Spent');
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

  function currencyToggle() {
    var now = formCurrency();
    return '<div class="seg mini" role="group" aria-label="Currency of this entry">' + CURRENCIES.map(function (c) {
      return '<button data-action="entry-currency" data-value="' + c + '" class="' + (now === c ? 'on' : '') + '" aria-pressed="' + (now === c) + '">' + c + '</button>';
    }).join('') + '</div>';
  }

  function langToggle() {
    var l = I18N.lang();
    return '<div class="seg" role="group" aria-label="Language">' +
      '<button data-action="set-lang" data-value="en" translate="no" class="' + (l === 'en' ? 'on' : '') + '">English</button>' +
      '<button data-action="set-lang" data-value="es" translate="no" class="' + (l === 'es' ? 'on' : '') + '">Español</button></div>';
  }

  function renderHome() {
    fixFormCategory();
    var options = S.entryOptions().map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === ui.form.category ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
    var now = new Date();
    return '<div class="stack">' + saveWarning() + backupBanner() +
      pageHead(S.periodRange(now).custom ? 'Current period' : 'Current month', monthName(now), '', homeActions()) +
      '<div class="muted small import-hint">Import accepts Santander PDFs and CSV files from any bank.</div>' +
      '<div class="card"><h3>New entry</h3><div class="stack-sm" style="margin-top:10px">' +
      '<div class="form-row">' +
      '<div><label class="label">Category</label><select data-form="category" style="width:280px">' + options + '</select></div>' +
      '<div><label class="label">Amount</label><div class="amount-row">' + currencyToggle() +
      '<input type="text" inputmode="decimal" placeholder="0.00" data-form="amount" data-enter="add-entry" style="width:120px" value="' + esc(ui.form.amount) + '"></div></div>' +
      '<div><label class="label">Date</label><input type="date" data-form="date" style="width:160px" value="' + esc(ui.form.date) + '"></div>' +
      '</div>' +
      '<div class="form-row"><div class="grow"><label class="label">What was it? (optional)</label>' +
      '<input type="text" placeholder="e.g. Coffee with Ana" data-form="name" data-enter="add-entry" value="' + esc(ui.form.name) + '"></div>' +
      '<button class="pill filled" data-action="add-entry">Enter</button></div>' +
      '<div class="rate-hint" id="rate-hint">' + esc(rateHintText()) + '</div>' +
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
      summary = T('In progress: {spent} spent of {budget}', { spent: money(spent), budget: money(budget) });
    } else {
      summary = T(diff >= 0 ? '{spent} spent of {budget}, surplus {amount}' : '{spent} spent of {budget}, deficit {amount}', { spent: money(spent), budget: money(budget), amount: money(Math.abs(diff)) });
    }
    return '<div class="stack"><button class="back" data-action="go-history">‹ Budget History</button>' +
      pageHead(S.periodRange(month).custom ? 'Period' : 'Month', monthName(month), summary,
        '<button class="pill" data-action="export-csv-month" data-month="' + month.getTime() + '">Export CSV</button>') + ringCard(month) + monthTable(month) + '</div>';
  }

  // ---------- trends ----------

  function catColor(name) {
    var idx = -1;
    S.state.categories.forEach(function (c, i) { if (c.name === name) idx = i; });
    return idx < 0 ? '#CDC8EB' : PALETTE[idx % PALETTE.length];
  }

  function periodShort(p) {
    var loc = I18N.loc();
    if (p.custom) return p.start.toLocaleString(loc, { day: 'numeric', month: 'short' });
    var m = p.start.toLocaleString(loc, { month: 'short' }).replace('.', '');
    return m.charAt(0).toUpperCase() + m.slice(1);
  }

  function periodLong(p) { return monthName(p.start); }

  function niceMax(v) {
    if (v <= 0) return 1;
    var pow = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var steps = [1, 2, 2.5, 4, 5, 8, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * pow >= v) return steps[i] * pow;
    return 10 * pow;
  }

  var STATUS_COLOR = { under: '#7CE3A1', slight: '#FFD23F', way: '#FF7A7A' };

  function statusWord(st) {
    return st === 'under' ? T('Under budget') : (st === 'slight' ? T('Slightly over') : T('Way over'));
  }

  /** Whole-number money for chart labels, such as €1,843. */
  function short(v) {
    return S.state.currency + Math.round(v).toLocaleString(I18N.loc());
  }

  function signedShort(v) {
    return (v < 0 ? '−' : '') + S.state.currency + Math.abs(Math.round(v)).toLocaleString(I18N.loc());
  }

  function trendChart(periods, proj) {
    var slot = 72, bw = 42, padL = 52, padT = 40, padB = 34, H = 300;
    var W = padL + periods.length * slot + (proj ? 215 : 12);
    W = Math.max(W, 520);
    var innerH = H - padT - padB;
    var tops = periods.map(function (p) { return p.total; });
    if (proj) tops.push(proj.value);
    var max = niceMax(Math.max.apply(null, tops.concat([1])));
    var scale = innerH / max;
    var cur = S.state.currency;
    var svg = '<svg class="trend-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Total spending per period">';
    for (var g = 0; g <= 4; g++) {
      var v = max * g / 4;
      var y = H - padB - v * scale;
      svg += '<line x1="' + padL + '" x2="' + (W - 8) + '" y1="' + y + '" y2="' + y + '" stroke="rgba(255,255,255,' + (g === 0 ? '0.35' : '0.12') + ')"/>' +
        '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.7)">' + cur + (v >= 1000 && v % 100 === 0 ? (v / 1000) + 'k' : Math.round(v)) + '</text>';
    }
    var order = S.state.categories.map(function (c) { return c.name; });
    periods.forEach(function (p, i) {
      var x = padL + i * slot + (slot - bw) / 2;
      var names = Object.keys(p.byCat).sort(function (a, b) {
        var ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      svg += '<g class="trend-bar' + (p.current ? ' cur' : '') + '" data-bar="' + i + '">' +
        '<rect class="hit" data-bar="' + i + '" x="' + (padL + i * slot) + '" y="' + padT + '" width="' + slot + '" height="' + (H - padT - padB) + '" fill="transparent"/>';
      var base = H - padB;
      names.forEach(function (name) {
        var h = p.byCat[name] * scale;
        if (h <= 0) return;
        base -= h;
        svg += '<rect class="seg" data-bar="' + i + '" data-cat="' + esc(name) + '" x="' + x + '" y="' + base + '" width="' + bw + '" height="' + h + '" fill="' + catColor(name) + '" stroke="#1E2FB3" stroke-width="1"/>';
      });
      var mid = x + bw / 2;
      if (p.current && proj) {
        var py = H - padB - proj.value * scale;
        svg += '<rect x="' + (x - 1) + '" y="' + py + '" width="' + (bw + 2) + '" height="' + Math.max(base - py, 0) + '" fill="rgba(255,255,255,0.06)" stroke="#fff" stroke-width="1.6" stroke-dasharray="5 4" rx="2" pointer-events="none"/>' +
          (p.total > 0 ? '<text x="' + mid + '" y="' + (Math.min(base - 6, py - 6)) + '" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" pointer-events="none">' + short(p.total) + '</text>' : '') +
          '<g pointer-events="none"><line x1="' + (x + bw + 46) + '" y1="' + (py - 14) + '" x2="' + (x + bw + 6) + '" y2="' + (py + 1) + '" stroke="#fff" stroke-width="1.6"/>' +
          '<path d="M' + (x + bw + 6) + ' ' + (py + 1) + ' l9 -1 l-3 8 z" fill="#fff"/>' +
          '<text x="' + (x + bw + 50) + '" y="' + (py - 18) + '" font-size="13" font-weight="800" fill="#fff">' + esc(T('Projected total: {amount}', { amount: short(proj.value) })) + '</text>' +
          '<text x="' + (x + bw + 50) + '" y="' + (py - 3) + '" font-size="11" font-weight="700" fill="' + STATUS_COLOR[proj.status] + '">' + esc(statusWord(proj.status) + ' · ' + (proj.basis === 'pace' ? T('from your pace') : T('from your average'))) + '</text></g>';
      } else if (p.total > 0) {
        svg += (p.current ? '' : '<text x="' + mid + '" y="' + (base - 8) + '" text-anchor="middle" font-size="11" font-weight="700" fill="' + STATUS_COLOR[p.status] + '" pointer-events="none">' + esc(statusWord(p.status)) + '</text>') +
          '<text x="' + mid + '" y="' + (base - (p.current ? 8 : 24)) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#fff" pointer-events="none">' + short(p.total) + '</text>';
      }
      if (p.current) {
        var top = proj ? 0 : base - 3;
        if (!proj) svg += '<rect x="' + (x - 3) + '" y="' + top + '" width="' + (bw + 6) + '" height="' + (H - padB - base + 3) + '" fill="none" stroke="rgba(255,255,255,0.55)" stroke-dasharray="4 3" rx="3" pointer-events="none"/>';
      }
      svg += '<text x="' + mid + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.8)">' + esc(periodShort(p) + (p.current ? ' ' + T('(so far)') : '')) + '</text></g>';
    });
    return svg + '</svg>';
  }

  function trendTip(i, cat) {
    var p = ui.trendData.periods[i];
    var names = Object.keys(p.byCat).sort(function (a, b) { return p.byCat[b] - p.byCat[a]; });
    var html = '<div class="strong" style="margin-bottom:2px">' + esc(periodLong(p)) + '</div>' +
      '<div class="muted small" style="margin-bottom:6px">' + esc(p.current ? T('In progress') : T('Finished')) + '</div>';
    if (names.length === 0) return html + '<div class="muted small">' + esc(T('Nothing spent')) + '</div>';
    names.forEach(function (name) {
      html += '<div class="tip-row' + (name === cat ? ' on' : '') + '"><span class="dot" style="background:' + catColor(name) + '"></span>' +
        '<span class="tip-name" translate="no">' + esc(name) + '</span><span class="strong">' + money(p.byCat[name]) + '</span></div>';
    });
    return html + '<div class="tip-row total"><span></span><span>' + esc(T('Total')) + '</span><span class="strong">' + money(p.total) + '</span></div>';
  }

  function setTrendHover(i, cat) {
    var box = document.querySelector('.trend-box');
    var tip = document.getElementById('trend-tip');
    if (!box || !tip) return;
    var idx = i === null ? ui.trendSel : i;
    document.querySelectorAll('.trend-bar').forEach(function (g) {
      g.style.opacity = (idx === null || Number(g.getAttribute('data-bar')) === idx) ? '1' : '0.35';
    });
    if (idx === null) { tip.hidden = true; return; }
    tip.innerHTML = trendTip(idx, i === null ? null : cat);
    tip.hidden = false;
    var slotEl = document.querySelector('.trend-bar[data-bar="' + idx + '"] .hit');
    var r = slotEl.getBoundingClientRect();
    var b = box.getBoundingClientRect();
    var left = r.right - b.left + 4;
    if (left + tip.offsetWidth > b.width - 4) left = r.left - b.left - tip.offsetWidth - 4;
    tip.style.left = Math.max(4, left) + 'px';
    tip.style.top = '8px';
  }

  function pctText(pct) { return String(Math.round(Math.abs(pct))); }

  function isoDay(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function tc(cls, html) { return '<section class="card stack-sm ' + cls + '">' + html + '</section>'; }

  // ----- This month -----
  function thisMonthCard(x) {
    var cur = x.periods[x.periods.length - 1];
    var head = '<h3 class="t">This month</h3><div class="muted small">' + esc(T('{range} · day {n} of {total}', { range: shortDate(isoDay(cur.start)) + ' – ' + shortDate(isoDay(cur.end)), n: x.day, total: cur.days })) + '</div>';
    var cmp = x.compare;
    if (!cmp) {
      return tc('t-this', head + '<div class="muted small">Trends need at least two finished periods to compare. Check back once you have finished a couple of periods.</div>');
    }
    var withPct = cmp.cats.filter(function (c) { return c.pct !== null; });
    var up = withPct.filter(function (c) { return c.pct > 0; }).sort(function (a, b) { return b.pct - a.pct; })[0];
    var down = withPct.filter(function (c) { return c.pct < 0; }).sort(function (a, b) { return a.pct - b.pct; })[0];
    function box(label, c, arrow, color) {
      return '<div class="insight"><div class="eyebrow">' + esc(label) + '</div>' +
        (c ? '<div class="strong" translate="no">' + esc(c.name) + '</div><div class="strong" style="color:' + color + ';font-size:20px">' + arrow + ' ' + pctText(c.pct) + '%</div>'
           : '<div class="muted">–</div>') + '</div>';
    }
    var rows = cmp.cats.slice().sort(function (a, b) {
      var pa = a.pct === null ? (a.isNew ? 1e9 : 0) : a.pct, pb = b.pct === null ? (b.isNew ? 1e9 : 0) : b.pct;
      return pb - pa;
    }).map(function (c) {
      var chip;
      if (c.isNew) chip = '<span class="chip small yellow">New</span>';
      else if (c.pct === null) return '';
      else if (Math.abs(c.pct) < 1) chip = '<span class="chip small green">0%</span>';
      else if (c.pct > 0) chip = '<span class="chip small ' + (c.pct > 20 ? 'red' : 'yellow') + '">▲ ' + pctText(c.pct) + '%</span>';
      else chip = '<span class="chip small green">▼ ' + pctText(c.pct) + '%</span>';
      return '<div class="trend-row">' + chip + '<div translate="no">' + esc(c.name) + '</div></div>';
    }).join('');
    return tc('t-this', head +
      '<div class="statrow">' + box('Biggest increase', up, '▲', 'var(--red)') + box('Biggest decrease', down, '▼', 'var(--green)') + '</div>' +
      '<h3 class="t sub">Vs. your usual</h3><div class="muted small" style="margin-top:-6px">This month\'s spending in each category compared with your average at this point.</div>' +
      '<div class="scrollbox">' + rows + '</div>');
  }

  // ----- Chart -----
  function chartCard(x) {
    var any = x.periods.some(function (p) { return p.total > 0; });
    var cur = x.periods[x.periods.length - 1];
    var legend = x.projection ? '<span><i class="dash"></i>Projected total for this month</span>' : '';
    var body = any
      ? '<div class="trend-box"><div class="trend-wrap">' + trendChart(x.periods, x.projection) + '</div><div class="trend-tip" id="trend-tip" hidden></div></div>'
      : '<div class="empty">No spending yet. Add some entries and your chart will appear here.</div>';
    return tc('t-chart', '<h3 class="t">Total spent per period</h3><div class="legend-note">' + legend + '<span>Hover over or tap a bar to see the split.</span></div>' + body);
  }

  // ----- Pace -----
  function paceCard(x) {
    var p = x.pace;
    var title = '<h3 class="t">Pace this month</h3>';
    var cur = S.state.currency;
    var curMax = p.current.length ? p.current[p.current.length - 1] : 0;
    var top = [curMax, x.projection ? x.projection.value : 0].concat(p.average || []);
    var max = niceMax(Math.max.apply(null, top.concat([1])));
    var W = 860, H = 300, pl = 54, pt = 22, pb = 30;
    var X = function (d) { return pl + (d - 1) / Math.max(p.days - 1, 1) * (W - pl - 24); };
    var Y = function (v) { return H - pb - v / max * (H - pt - pb); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Pace this month">';
    for (var g = 0; g <= 4; g++) {
      var v = max * g / 4;
      svg += '<line x1="' + pl + '" x2="' + (W - 10) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="rgba(255,255,255,' + (g ? '0.12' : '0.35') + ')"/>' +
        '<text x="' + (pl - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.7)">' + cur + (v >= 1000 && v % 100 === 0 ? (v / 1000) + 'k' : Math.round(v)) + '</text>';
    }
    var ticks = [1, 5, 10, 15, 20, 25, 30].filter(function (d) { return d <= p.days; });
    if (ticks.indexOf(p.days) < 0) ticks.push(p.days);
    ticks.forEach(function (d) { svg += '<text x="' + X(d) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.8)">' + d + '</text>'; });
    if (p.average) svg += '<polyline points="' + p.average.map(function (val, i) { return X(i + 1) + ',' + Y(val); }).join(' ') + '" fill="none" stroke="#C79BFF" stroke-width="2.2" stroke-dasharray="6 5"/>';
    if (p.current.length) {
      var pts = p.current.map(function (val, i) { return X(i + 1) + ',' + Y(val); });
      svg += '<path d="M' + X(1) + ',' + Y(0) + ' L' + pts.join(' L') + ' L' + X(p.current.length) + ',' + Y(0) + ' Z" fill="rgba(124,227,161,0.14)"/>' +
        '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#7CE3A1" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>';
      var lastX = X(p.current.length), lastY = Y(curMax);
      if (x.projection && p.current.length < p.days) {
        svg += '<line x1="' + lastX + '" y1="' + lastY + '" x2="' + X(p.days) + '" y2="' + Y(x.projection.value) + '" stroke="#7CE3A1" stroke-width="2.4" stroke-dasharray="2 5" stroke-linecap="round"/>' +
          '<text x="' + X(p.days) + '" y="' + (Y(x.projection.value) - 12) + '" text-anchor="end" font-size="12" font-weight="800" fill="#fff">' + esc(T('Projected {amount}', { amount: short(x.projection.value) })) + '</text>';
      }
      svg += '<circle cx="' + lastX + '" cy="' + lastY + '" r="5.5" fill="#7CE3A1" stroke="#1E2FB3" stroke-width="2"/>' +
        '<text x="' + (lastX - 8) + '" y="' + (lastY + (p.average && p.average[p.current.length - 1] > curMax ? 22 : -12)) + '" text-anchor="end" font-size="12" font-weight="800" fill="#fff">' + esc(T('Today · {amount}', { amount: short(curMax) })) + '</text>';
    }
    svg += '</svg>';
    var note = '';
    if (p.diff !== null) {
      var d = Math.round(Math.abs(p.diff));
      note = Math.abs(p.diff) < 1 ? '<span class="strong">' + esc(T('Right on your usual pace')) + '</span>'
        : '<span class="strong" style="color:' + (p.diff > 0 ? 'var(--green)' : 'var(--yellow)') + '">' + esc(T(p.diff > 0 ? '{amount} below your usual pace' : '{amount} above your usual pace', { amount: short(d) })) + '</span>';
    } else {
      note = '<span class="muted">' + esc(T('Your usual pace appears after two finished periods.')) + '</span>';
    }
    return tc('t-pace', title + '<div class="legend-note"><span><b class="ln solid"></b>This month</span>' +
      (p.average ? '<span><b class="ln dashed"></b>Your usual pace</span>' : '') + note + '</div>' + svg);
  }

  // ----- Safe to spend -----
  function safeCard(x) {
    var sf = x.safe;
    var pct = sf.budget > 0 ? Math.min(100, Math.round(sf.spent / sf.budget * 100)) : 0;
    var st = ratioClass(sf.spent, sf.budget);
    var big, line;
    if (sf.over) {
      big = '<div><span class="big" style="color:var(--red)">' + esc(short(Math.abs(sf.left))) + '</span></div>';
      line = '<div class="strong">' + esc(T('You are over budget this period.')) + '</div>';
    } else {
      big = '<div><span class="big" style="color:var(--green)">' + esc(short(sf.perDay)) + '</span><span class="strong"> ' + esc(T('/ day')) + '</span></div>';
      line = '<div class="strong">' + esc(pl(sf.daysLeft, '{amount} left for the next day', '{amount} left for the next {n} days', { amount: short(sf.left) })) + '</div>';
    }
    var foot = T('{spent} of {budget} spent', { spent: short(sf.spent), budget: short(sf.budget) }) + ' · ' +
      (sf.unpaidFixed > 0 ? T('{amount} of fixed bills still to pay', { amount: short(sf.unpaidFixed) }) : T('no fixed bills left to pay this period'));
    return tc('t-safe', '<h3 class="t">Safe to spend per day</h3><div class="split">' + big +
      '<div class="stack-sm" style="gap:8px">' + line + '<div class="meter"><b class="' + st + '" style="width:' + pct + '%"></b></div><div class="muted small">' + esc(foot) + '</div></div></div>');
  }

  function ratioClass(spent, budget) {
    var r = budget > 0 ? spent / budget : (spent > 0 ? 9 : 0);
    return r <= 1 ? 'g' : (r <= 1.2 ? 'y' : 'r');
  }

  // ----- Streaks -----
  var TREE_SVG = '<svg width="72" height="72" viewBox="0 0 64 64" aria-hidden="true"><path d="M29 58 L31 38 L35 38 L37 58 Z" fill="#B07A4A"/><path d="M32 46 L23 38 M33 42 L43 33" stroke="#B07A4A" stroke-width="3" stroke-linecap="round"/>' +
    [[32, 9, -8], [20, 15, -32], [44, 15, 30], [12, 26, -50], [52, 26, 48], [26, 23, -12], [38, 24, 14], [32, 33, 2], [18, 36, -30], [46, 36, 28]].map(function (a) {
      return '<g transform="translate(' + a[0] + ' ' + a[1] + ') rotate(' + a[2] + ')"><rect x="-8" y="-4.6" width="16" height="9.2" rx="1.6" fill="#5DCB86" stroke="#2E8F57" stroke-width="1"/><rect x="-6.3" y="-3" width="12.6" height="6" rx="1" fill="none" stroke="#2E8F57" stroke-width=".6"/><circle r="2.5" fill="#8EE6A9" stroke="#2E8F57" stroke-width=".6"/><text y="1.4" font-size="3.6" font-weight="800" text-anchor="middle" fill="#2E8F57">$</text></g>';
    }).join('') + '<ellipse cx="32" cy="60" rx="14" ry="2.6" fill="rgba(0,0,0,.25)"/></svg>';

  var BILL_SVG = '<svg width="46" height="70" viewBox="0 0 48 72" aria-hidden="true"><rect x="5" y="3" width="38" height="66" rx="6" fill="#5DCB86" stroke="#2E8F57" stroke-width="2"/><rect x="10" y="8" width="28" height="56" rx="3.5" fill="none" stroke="#2E8F57" stroke-width="1.2"/>' +
    '<circle cx="24" cy="36" r="12" fill="#8EE6A9" stroke="#2E8F57" stroke-width="1.2"/><text x="14" y="19" font-size="8" font-weight="800" fill="#2E8F57" text-anchor="middle">$</text><text x="34" y="62" font-size="8" font-weight="800" fill="#2E8F57" text-anchor="middle">$</text>' +
    '<g fill="rgba(255,255,255,.45)" stroke="#16341F" stroke-width="2"><circle cx="17" cy="33" r="6.6"/><circle cx="31" cy="33" r="6.6"/></g><path d="M23.6 32.5 Q24 31.5 24.4 32.5" stroke="#16341F" stroke-width="2" fill="none"/><path d="M10.4 32 L6.5 29.5 M37.6 32 L41.5 29.5" stroke="#16341F" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="17" cy="33.5" r="1.6" fill="#16341F"/><circle cx="31" cy="33.5" r="1.6" fill="#16341F"/><path d="M18.5 43 Q24 48 29.5 43" stroke="#16341F" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

  function streaksCard(x) {
    var st = x.streaks;
    var head = '<div class="card-head"><h3 class="t">Streaks</h3>' + TREE_SVG + '</div>';
    if (st.of === 0) {
      return tc('t-streaks', head + '<div class="muted small">Streaks start counting after your first finished period.</div>');
    }
    var headline = st.current > 0
      ? '<div><span class="big">' + st.current + '</span> <span class="strong" style="font-size:16px">' + esc(pl(st.current, 'period in a row under budget', 'periods in a row under budget')) + '</span></div>'
      : '<div class="strong" style="font-size:18px">No streak yet</div>';
    var proj = x.projection;
    var hint = (proj && proj.status === 'under')
      ? (st.current > 0 ? T('Finish this period under {budget} to make it {n}.', { budget: short(st.budget), n: st.current + 1 }) : T('Finish this period under {budget} to start a streak.', { budget: short(st.budget) }))
      : T('Finish a period under budget to start a streak.');
    var cats = st.categories.map(function (c) {
      return '<div class="kv"><span translate="no">' + esc(c.name) + '</span><span class="strong">' + esc(c.fixed ? T('{n} on budget', { n: c.count }) : T('{n} periods under', { n: c.count })) + '</span></div>';
    }).join('');
    return tc('t-streaks', head + headline + '<div class="muted small">' + esc(hint) + '</div>' +
      '<div class="chipline"><span class="tag">' + esc(T('Best streak: {n}', { n: st.best })) + '</span><span class="tag">' + esc(T('Under budget: {a} of {b} periods', { a: st.under, b: st.of })) + '</span></div>' +
      (cats ? '<div><div class="eyebrow" style="margin-bottom:2px">Category streaks</div>' + cats + '</div>' : ''));
  }

  // ----- Budget check-up -----
  function checkupCard(x) {
    var head = '<div class="card-head"><h3 class="t">Budget check-up</h3>' + BILL_SVG + '</div>' +
      '<div class="muted small">Categories whose budget may need a second look, based on your last few periods.</div>';
    if (!x.checkupReady) {
      var need = 3 - x.finishedCount;
      return tc('t-check', head + '<div class="muted small">' + esc(pl(need, 'The check-up unlocks after {n} more finished period.', 'The check-up unlocks after {n} more finished periods.')) + '</div>');
    }
    if (x.checkup.length === 0) return tc('t-check', head + '<div class="muted small">Nothing stands out. Your budgets look about right.</div>');
    var tags = { high: ['Running high', 'var(--yellow)'], lower: ['Could lower', 'var(--green)'], ok: ['Right-sized', 'rgba(255,255,255,0.85)'] };
    var list = x.checkup.map(function (c) {
      var text;
      if (c.kind === 'lower') text = T('Under budget {n} periods in a row, averaging {avg} of {budget}. Maybe trim it to {suggest}?', { n: c.n, avg: short(c.avg), budget: short(c.budget), suggest: short(c.suggest) });
      else if (c.kind === 'high') text = T('Over budget in {over} of the last {n} periods, averaging {avg} vs {budget}.', { over: c.over, n: c.n, avg: short(c.avg), budget: short(c.budget) });
      else text = T('Within {pct}% of budget every period. No changes needed.', { pct: Math.max(c.off, 1) });
      return '<div class="sug"><span class="tagc" style="background:' + tags[c.kind][1] + '">' + esc(T(tags[c.kind][0])) + '</span><div><div class="strong" translate="no">' + esc(c.name) + '</div><div class="muted small">' + esc(text) + '</div></div></div>';
    }).join('');
    return tc('t-check', head + '<div>' + list + '</div>');
  }

  // ----- Committed vs free -----
  function committedCard(x) {
    var c = x.committed;
    var head = '<h3 class="t">Committed vs. free</h3>';
    if (c.committed <= 0 || c.budget <= 0) {
      return tc('t-commit', head + '<div class="muted small">Nothing is committed yet. Mark a category as a Fixed bill or add a recurring entry in Settings, and it will show up here.</div>');
    }
    var pFixed = c.fixedTotal / c.budget * 100, pRec = c.recurringOther / c.budget * 100;
    var items = c.items.map(function (it) {
      var note = it.recurring === false ? T('fixed bill')
        : (it.day === 0 ? T('last day') : T('day {n}', { n: it.day })) + ' · ' + T('recurring') + (it.fixed ? ' · ' + T('fixed bill') : '');
      return '<div class="kv"><span translate="no">' + esc(it.name) + '</span><span class="muted small kvnote">' + esc(note) + '</span><span class="strong">' + money(it.amount) + '</span></div>';
    }).join('');
    return tc('t-commit', head + '<div class="muted small">' + esc(T('How much of your {budget} budget is already spoken for.', { budget: short(c.budget) })) + '</div>' +
      '<div class="commit"><span style="width:' + pFixed + '%;background:#C79BFF"></span>' + (pRec > 0 ? '<span style="width:' + pRec + '%;background:#E6A0FF"></span>' : '') + '<span style="flex:1;background:#72A5F7"></span></div>' +
      '<div class="commit-nums"><span>' + esc(T('{amount} committed · {pct}%', { amount: short(c.committed), pct: Math.round(c.committed / c.budget * 100) })) + '</span><span>' + esc(T('{amount} free · {pct}%', { amount: short(c.free), pct: Math.round(c.free / c.budget * 100) })) + '</span></div>' + items);
  }

  // ----- Calendar -----
  function calColor(v, allowance) {
    var t = Math.min(1, v / (2 * allowance));
    var G = [124, 227, 161], Y = [255, 210, 63], R = [255, 122, 122], c;
    if (t < 0.5) { var k = t / 0.5; c = G.map(function (g, i) { return Math.round(g + (Y[i] - g) * k); }); }
    else { var k2 = (t - 0.5) / 0.5; c = Y.map(function (g, i) { return Math.round(g + (R[i] - g) * k2); }); }
    return 'rgb(' + c.join(',') + ')';
  }

  function calendarCard(x) {
    var cals = x.calendar;
    var sel = cals.filter(function (c) { return c.key === ui.calKey; })[0] || cals[cals.length - 1];
    var pills = cals.slice().reverse().slice(0, 6).map(function (c) {
      return '<button class="pill-tab' + (c.key === sel.key ? ' on' : '') + '" data-action="cal-period" data-key="' + esc(c.key) + '">' + esc(periodShort({ start: c.start, custom: S.periodRange(c.start).custom })) + '</button>';
    }).join('');
    var loc = I18N.loc();
    var head = '<div class="card-head wrap"><h3 class="t">Spending calendar</h3><div class="pills">' + pills + '</div></div>';
    var days = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07'].map(function (d) {
      return '<div class="hd">' + esc(new Date(d + 'T12:00:00').toLocaleString(loc, { weekday: 'short' }).replace('.', '').toUpperCase()) + '</div>';
    }).join('');
    var offset = (sel.start.getDay() + 6) % 7;
    var cells = '';
    for (var i = 0; i < offset; i++) cells += '<div></div>';
    var todayIdx = sel.current ? x.day - 1 : -1;
    var elapsed = sel.current ? x.day : sel.days;
    var busiest = { v: 0, i: -1 }, spendDays = 0, total = 0, quiet = 0;
    sel.daily.forEach(function (v, i) {
      var date = new Date(sel.start.getFullYear(), sel.start.getMonth(), sel.start.getDate() + i);
      var label = date.getDate();
      var future = sel.current && i >= elapsed;
      if (future) { cells += '<div class="d future"><b>' + label + '</b></div>'; return; }
      if (v >= 0.5) {
        spendDays++; total += v;
        if (v > busiest.v) busiest = { v: v, i: i };
        cells += '<div class="d hot' + (i === todayIdx ? ' today' : '') + '" style="background:' + calColor(v, sel.allowance) + '"><b>' + label + '</b><span>' + esc(short(v)) + '</span></div>';
      } else {
        quiet++;
        cells += '<div class="d empty' + (i === todayIdx ? ' today' : '') + '"><b>' + label + '</b></div>';
      }
    });
    var busiestDate = busiest.i >= 0 ? new Date(sel.start.getFullYear(), sel.start.getMonth(), sel.start.getDate() + busiest.i).toLocaleString(loc, { month: 'short', day: 'numeric' }) : '';
    var stats =
      '<div class="stat"><div class="eyebrow">Busiest day</div><div class="strong" style="font-size:18px">' + (busiest.i >= 0 ? esc(busiestDate + ' · ' + short(busiest.v)) : '–') + '</div></div>' +
      '<div class="stat"><div class="eyebrow">Quiet days</div><div class="strong" style="font-size:18px">' + esc(T('{n} of {m} with no spending', { n: quiet, m: elapsed })) + '</div></div>' +
      '<div class="stat"><div class="eyebrow">Average on a spending day</div><div class="strong" style="font-size:18px">' + (spendDays ? esc(short(total / spendDays)) : '–') + '</div></div>' +
      '<div><div class="ramp"></div><div class="ramp-labels"><span>Light day</span><span>Heavy day</span></div></div>' +
      '<div class="muted small">' + esc(T('Colours compare each day with your daily allowance (about {amount}). Fixed bills, recurring entries and savings are not shaded.', { amount: short(sel.allowance) })) + '</div>';
    return tc('t-cal', head + '<div class="calwrap"><div class="cal">' + days + cells + '</div><div class="stack-sm" style="gap:10px">' + stats + '</div></div>');
  }

  // ----- Baller Budget over time -----
  function ballerCardTrend(x) {
    var pts = x.baller.points.map(function (p) { return { label: periodShort(p.period), v: p.value }; });
    pts.push({ label: T('Now'), v: x.baller.now });
    var head = '<h3 class="t">Baller Budget over time</h3><div class="muted small">Your savings buffer at the end of each period</div>';
    if (pts.length < 2) return tc('t-baller', head + '<div class="muted small">This graph appears after your first finished period.</div>');
    var vals = pts.map(function (p) { return p.v; });
    var mn = Math.min.apply(null, vals.concat([0])), mx = Math.max.apply(null, vals.concat([0]));
    var span = Math.max(mx - mn, 50); mn -= span * 0.12; mx += span * 0.2;
    var W = 700, H = 190, lp = 56, lt = 24, lb = 30;
    var X = function (i) { return lp + i * ((W - lp - 34) / (pts.length - 1)); };
    var Y = function (v) { return lt + (mx - v) / (mx - mn) * (H - lt - lb); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Baller Budget over time">';
    var ticks = [0, Math.round(mx / 2 / 50) * 50].filter(function (v, i, a) { return a.indexOf(v) === i && v < mx; });
    ticks.forEach(function (v) {
      svg += '<line x1="' + lp + '" x2="' + (W - 10) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="rgba(255,255,255,' + (v ? '0.12' : '0.35') + ')"/><text x="' + (lp - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.7)">' + signedShort(v) + '</text>';
    });
    var poly = pts.map(function (p, i) { return X(i) + ',' + Y(p.v); }).join(' ');
    svg += '<path d="M' + poly.split(' ').join(' L') + ' L' + X(pts.length - 1) + ',' + Y(0) + ' L' + X(0) + ',' + Y(0) + ' Z" fill="rgba(124,227,161,0.14)"/>' +
      '<polyline points="' + poly + '" fill="none" stroke="#7CE3A1" stroke-width="3" stroke-linejoin="round"/>';
    pts.forEach(function (p, i) {
      svg += '<circle cx="' + X(i) + '" cy="' + Y(p.v) + '" r="5" fill="' + (p.v < 0 ? '#FF7A7A' : '#7CE3A1') + '" stroke="#1E2FB3" stroke-width="2"/>' +
        '<text x="' + X(i) + '" y="' + (Y(p.v) - 12) + '" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">' + signedShort(p.v) + '</text>' +
        '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.85)">' + esc(p.label) + '</text>';
    });
    return tc('t-baller', head + svg + '</svg>');
  }

  // ----- Biggest purchases -----
  function biggestCard(x) {
    var head = '<h3 class="t">Biggest purchases this month</h3><div class="muted small">Fixed bills, recurring entries and savings are not included.</div>';
    if (x.biggest.length === 0) return tc('t-big full', head + '<div class="empty">Nothing logged here yet.</div>');
    var rows = x.biggest.map(function (b) {
      return '<tr><td translate="no">' + esc(b.name || b.category) + '</td><td class="muted" translate="no">' + esc(b.category) + '</td><td class="muted">' +
        esc(b.date.toLocaleString(I18N.loc(), { month: 'short', day: 'numeric' })) + '</td><td class="r">' + money(b.amount) + '</td></tr>';
    }).join('');
    return tc('t-big full', head + '<table class="tbl">' + rows + '</table>');
  }

  function renderTrends() {
    var x = S.trendExtras();
    ui.trendData = x;
    return '<div class="stack">' + pageHead('Spending over time', 'Trends', '') +
      '<div class="trend-cols">' +
      '<div class="tcol">' + thisMonthCard(x) + streaksCard(x) + checkupCard(x) + committedCard(x) + '</div>' +
      '<div class="tcol">' + chartCard(x) + paceCard(x) + safeCard(x) + calendarCard(x) + ballerCardTrend(x) + '</div>' +
      biggestCard(x) + '</div></div>';
  }

  function renderCategory() {
    var name = ui.screen.category;
    var items = S.state.entries.filter(function (e) { return e.category === name; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var rowsNow = S.rows(new Date());
    var found = rowsNow.filter(function (r) { return r.name === name; })[0];
    var budget = found ? found.budget : 0;
    var html = '<div class="stack">' + pageHead('Spending by category', name,
      T('This month: {spent} of {budget}', { spent: money(S.spentIn(name, new Date())), budget: money(budget) }), '', true) +
      '<div class="card"><div class="row log-grid head"><div class="col-title">Date</div><div class="col-title">Name</div>' +
      '<div class="col-title num">Amount</div><div></div></div>';
    items.forEach(function (e) {
      html += '<div class="row log-grid"><div class="muted">' + dateTimeText(e.date) + '</div>' +
        '<div><div class="strong" translate="no">' + esc(e.name || '') + '</div>' + (e.recurringId ? '<div class="muted small">Recurring</div>' : '') + originalNote(e) + '</div><div class="num strong">' + money(e.amount) + '</div>' +
        '<div class="num acts"><button class="pill small" data-action="edit-entry" data-id="' + esc(e.id) + '">Edit</button> <button class="pill small" data-action="delete-entry" data-id="' + esc(e.id) + '">Delete</button></div></div>';
    });
    if (items.length === 0) html += '<div class="empty">Nothing logged here yet.</div>';
    return html + '</div></div>';
  }

  function renderBallerLog() {
    var list = [];
    S.state.entries.forEach(function (e) {
      if (e.category === S.BALLER) list.push({ id: e.id, date: e.date, title: e.name || T('Spent from Baller Budget'), amount: -e.amount, spending: true, note: originalNote(e) });
    });
    S.state.deposits.forEach(function (d) {
      list.push({ id: d.id, date: d.date, title: T('Funds added'), amount: d.amount, spending: false });
    });
    list.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    var html = '<div class="stack">' + pageHead('Spending by category', S.ballerTitle(), T('Balance: {amount}', { amount: money(S.ballerBalance()) })) +
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
        '<div><div class="strong" translate="no">' + esc(r.title) + '</div>' + (r.note || '') + '</div>' +
        '<div class="num strong' + (r.amount >= 0 ? ' green-text' : '') + '">' + signedMoney(r.amount) + '</div>' +
        '<div class="num acts">' + (r.spending ? '<button class="pill small" data-action="edit-entry" data-id="' + esc(r.id) + '">Edit</button> ' : '') +
        '<button class="pill small" data-action="' + (r.spending ? 'delete-entry' : 'delete-deposit') + '" data-id="' + esc(r.id) + '">Delete</button></div></div>';
    });
    if (list.length === 0) html += '<div class="empty">No funds added or spending yet.</div>';
    return html + '</div></div>';
  }

  function originalNote(e) {
    if (!e.originalCurrency) return '';
    return '<div class="muted small orig">' + esc(T('{orig} at {rate}', { orig: S.moneyIn(e.originalCurrency, e.originalAmount), rate: e.rate.toFixed(4) })) + '</div>';
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
      '<button class="nav' + (sc.name === 'trends' ? ' active' : '') + '" data-action="go-trends">Trends</button>' +
      '<button class="nav" data-action="toggle-cats">Spending by Category<span class="chev">' + (ui.showCategories ? '▲' : '▼') + '</span></button>';
    if (ui.showCategories) {
      S.sidebarItems().forEach(function (item) {
        var active = sc.name === 'category' && sc.category === item.name;
        html += '<button class="nav sub' + (active ? ' active' : '') + '" data-action="open-category" data-name="' + esc(item.name) + '" translate="no">' + esc(item.archived ? T('{name} (archived)', { name: item.name }) : item.label) + '</button>';
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
      '<input type="text" inputmode="decimal" placeholder="' + esc(T('Amount ({currency})', { currency: S.state.currency })) + '" style="width:160px" id="b-add" data-enter="add-funds">' +
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

  function currencyButtons(action, current) {
    return '<div class="seg"><button data-action="' + action + '" data-value="€" class="' + (current === '€' ? 'on' : '') + '">€ Euro</button>' +
      '<button data-action="' + action + '" data-value="$" class="' + (current === '$' ? 'on' : '') + '">$ Dollar</button>' +
      '<button data-action="' + action + '" data-value="£" class="' + (current === '£' ? 'on' : '') + '">£ Pound</button></div>';
  }

  function dayText(d) {
    return d === 0 ? T('Last day of the month') : T('Day {n}', { n: d });
  }

  function dayOptions(selected) {
    var html = '';
    for (var d = 1; d <= 28; d++) html += '<option value="' + d + '"' + (d === selected ? ' selected' : '') + '>' + esc(dayText(d)) + '</option>';
    return html + '<option value="0"' + (selected === 0 ? ' selected' : '') + '>' + esc(dayText(0)) + '</option>';
  }

  // ---------- edit an entry ----------

  function renderEditModal() {
    var ed = ui.edit;
    var options = S.entryOptions();
    if (options.indexOf(ed.category) < 0) options.unshift(ed.category);
    var opts = options.map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === ed.category ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
    return '<div class="overlay"><div class="modal narrow"><h2>Edit entry</h2><div class="card stack-sm">' +
      '<div><label class="label">Category</label><select data-edit="category" style="width:100%">' + opts + '</select></div>' +
      '<div class="form-row"><div><label class="label">' + esc(T('Amount ({currency})', { currency: S.state.currency })) + '</label>' +
      '<input type="text" inputmode="decimal" data-edit="amount" data-enter="save-edit" style="width:140px" value="' + esc(ed.amountText) + '"></div>' +
      '<div><label class="label">Date</label><input type="date" data-edit="date" style="width:170px" value="' + esc(ed.date) + '"></div></div>' +
      '<div><label class="label">What was it? (optional)</label><input type="text" data-edit="name" data-enter="save-edit" style="width:100%" value="' + esc(ed.name) + '"></div>' +
      (ed.hadOriginal ? '<div class="muted small">' + esc(T('This entry was converted from another currency. If you change the amount, it becomes a plain {currency} entry.', { currency: S.state.currency })) + '</div>' : '') +
      '<div class="error" id="edit-error">' + esc(ed.error) + '</div></div>' +
      '<div class="modal-actions"><button class="pill" data-action="cancel-edit">Cancel</button><button class="pill filled" data-action="save-edit">Save changes</button></div></div></div>';
  }

  function startEdit(id) {
    var e = S.state.entries.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var d = new Date(e.date);
    ui.edit = {
      id: id, category: e.category, amountText: e.amount.toFixed(2), date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
      name: e.name || '', hadOriginal: !!e.originalCurrency, startAmount: e.amount, startDate: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), error: ''
    };
    ui.modal = 'edit';
    render();
  }

  function saveEdit() {
    var ed = ui.edit;
    var amount = S.parseAmount(ed.amountText);
    if (amount === null || !(Math.abs(amount) > 0)) { ed.error = T('Type an amount first.'); render(); return; }
    amount = Math.round(Math.abs(amount) * 100) / 100;
    var parts = String(ed.date).split('-');
    if (parts.length !== 3 || isNaN(Number(parts[0]))) { ed.error = T('Pick a date.'); render(); return; }
    var patch = { category: ed.category, name: ed.name.trim() };
    if (Math.abs(amount - ed.startAmount) > 0.004) {
      patch.amount = amount;
      if (ed.hadOriginal) patch.original = null;
    }
    if (ed.date !== ed.startDate) patch.date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
    S.updateEntry(ed.id, patch);
    ui.edit = null;
    ui.modal = null;
    render();
  }

  function recurringCard() {
    var cats = S.state.categories.filter(function (c) { return !c.archived; }).map(function (c) { return c.name; });
    if (cats.indexOf(ui.rec.category) < 0) ui.rec.category = cats[0] || '';
    var opts = cats.map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === ui.rec.category ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
    var list = S.state.recurring.map(function (r) {
      var when = r.day === 0 ? T('Last day of each month') : T('Day {n} of each month', { n: r.day });
      return '<div class="edit-row"><div class="grow"><div class="strong" translate="no">' + esc(r.name || r.category) + '</div>' +
        '<div class="muted small"><span translate="no">' + esc(r.category) + '</span> · ' + esc(when) + ' · ' + esc(T('Next: {date}', { date: shortDate(r.nextDue) })) + '</div></div>' +
        '<span class="strong">' + money(r.amount) + '</span>' +
        '<button class="pill small" data-action="delete-recurring" data-id="' + esc(r.id) + '">Delete</button></div>';
    }).join('');
    if (!list) list = '<div class="muted">Nothing recurring yet.</div>';
    return '<div class="card stack-sm"><h3>Recurring entries</h3>' +
      '<div class="muted small">Things you pay every month, like rent or a subscription. They are added for you automatically on their day, and if you did not open the app for a while, the missed ones are added when you come back.</div>' + list +
      '<div class="hr"></div><div class="edit-row"><select data-rec="category" aria-label="Category" style="max-width:200px">' + opts + '</select>' +
      '<input type="text" inputmode="decimal" class="right" placeholder="' + esc(T('Amount ({currency})', { currency: S.state.currency })) + '" style="width:110px" data-rec="amount" data-enter="add-recurring" value="' + esc(ui.rec.amount) + '">' +
      '<input type="text" class="grow" placeholder="Name (optional)" data-rec="name" data-enter="add-recurring" value="' + esc(ui.rec.name) + '"></div>' +
      '<div class="edit-row"><label class="label" style="margin:0">Day of the month</label><select data-rec="day" aria-label="Day of the month">' + dayOptions(Number(ui.rec.day)) + '</select>' +
      '<button class="pill filled" data-action="add-recurring">Add</button><span class="muted small">' + esc(ui.recMsg) + '</span></div></div>';
  }

  function renderSettingsModal() {
    var archived = S.state.categories.filter(function (c) { return c.archived; });
    var archivedHtml = archived.map(function (c) {
      return '<div class="edit-row"><span class="grow" translate="no">' + esc(c.name) + '</span>' +
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
      recurringCard() +
      '<div class="card stack-sm"><h3>Archived categories</h3><div class="muted small">Archived categories are hidden from now on. Their past spending stays in your history.</div>' + archivedHtml + '</div>' +
      '<div class="card stack-sm"><h3>Language</h3>' + langToggle() + '</div>' +
      '<div class="card stack-sm"><h3>Currency</h3><div class="muted small">Your budgets are in this currency. When you log an entry in a different one, it is converted at that day\'s exchange rate.</div>' +
      currencyButtons('set-currency', S.state.currency) + '</div>' +
      '<div class="card stack-sm"><h3>Pay period</h3><div class="muted small">Pick the day your money arrives. Each period runs from that day to the day before the next one. A change applies from your next period, so the current one and past ones stay exactly as they are.</div>' +
      '<div class="edit-row"><select data-period-day aria-label="Pay period start day">' + dayOptions(S.upcomingStartDay()) + '</select><span class="muted small">' + esc(ui.periodMsg) + '</span></div></div>' +
      '<div class="card stack-sm"><h3>Backup</h3><div class="muted small">Your data lives only on this device. Save a backup file now and then, and keep it somewhere safe.</div>' +
      '<div class="edit-row"><button class="pill small" data-action="export-backup">Save backup file</button>' +
      '<button class="pill small" data-action="pick-import">Restore from backup…</button>' +
      '<input type="file" id="import-file" accept=".json,application/json" style="display:none"></div>' + importBlock + '</div>' +
      '<div class="card stack-sm"><h3>Export to a spreadsheet</h3><div class="muted small">Download your entries as a CSV file that opens in Excel, Numbers or Google Sheets.</div>' +
      '<div class="edit-row"><button class="pill small" data-action="export-csv-current">This period</button>' +
      '<button class="pill small" data-action="export-csv-all">Everything</button></div></div>' +
      installCard() +
      '<div class="card stack-sm"><h3>Reset</h3>' + resetBlock + '</div>' +
      '<div class="modal-actions"><button class="pill filled" data-action="close-modal">Done</button></div></div></div>';
  }

  // ---------- PDF import ----------

  function homeActions() {
    var html = '';
    if (ui.lastBatch) html += '<button class="pill small" data-action="undo-import">Undo import</button>';
    html += '<button class="pill" data-action="import-pdf">Import bank file</button>' +
      '<input type="file" id="pdf-file" accept="application/pdf,.pdf,.csv,.tsv,.txt,text/csv,.xlsx,.xls" style="display:none">' +
      '<button class="pill" data-action="open-settings">Settings</button>';
    return html;
  }

  function buildReview(result, fileName) {
    var options = S.entryOptions();
    var fallback = options.indexOf('Other') >= 0 ? 'Other' : (options.indexOf(I18N.CATS.Other) >= 0 ? I18N.CATS.Other : (options[0] || ''));
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
    return { fileName: fileName, result: result, rows: rows, sourceCur: S.state.currency, converting: false };
  }

  function sourceButtons(current) {
    return '<div class="seg">' + ['€', '$', '£'].map(function (c) {
      return '<button data-action="imp-currency" data-value="' + c + '" class="' + (current === c ? 'on' : '') + '">' + c + '</button>';
    }).join('') + '</div>';
  }

  function importChosen() {
    return ui.review.rows.filter(function (r) { return r.include; });
  }

  function importFooterText() {
    var chosen = importChosen();
    var total = chosen.reduce(function (sum, r) { return sum + r.amount; }, 0);
    return T('{n} selected', { n: chosen.length }) + ' · ' + S.moneyIn(ui.review.sourceCur, total);
  }

  function renderImportModal() {
    var r = ui.review;
    var options = S.entryOptions();
    var summary = pl(r.result.transactions.length, '{n} purchase found in {file}', '{n} purchases found in {file}', { file: r.fileName });
    if (r.result.skippedIncoming > 0) summary += ' · ' + pl(r.result.skippedIncoming, '{n} incoming payment skipped', '{n} incoming payments skipped');

    var html = '<div class="overlay"><div class="modal wide"><h2>Review import</h2>' +
      '<div class="muted small">' + esc(summary) + '</div>';

    if (r.result.unreadable.length) {
      html += '<div class="small" style="color:var(--yellow)">' +
        pl(r.result.unreadable.length, "{n} line couldn't be read and was left out:", "{n} lines couldn't be read and were left out:") + '<br>' +
        r.result.unreadable.slice(0, 4).map(function (line) { return '<span class="muted" translate="no">' + esc(line) + '</span>'; }).join('<br>') + '</div>';
    }

    if (r.csv) {
      html += '<div class="csv-note small"><span>' + esc(r.csv.detected.preset ? T('Read as {bank}.', { bank: r.csv.detected.preset.name }) : T('Columns matched automatically.')) + '</span>' +
        '<button class="pill small" data-action="csv-adjust">Adjust columns</button></div>';
    }
    html += '<div class="csv-note small"><span class="strong">Amounts in this file are in</span>' + sourceButtons(r.sourceCur) +
      (r.sourceCur !== S.state.currency ? '<span class="muted grow">' + esc(T('Each purchase is converted to {currency} using the exchange rate from its own date when you import.', { currency: S.state.currency })) + '</span>' : '') + '</div>';

    if (r.rows.length === 0 && r.csv) {
      html += '<div class="strong">I couldn\'t find any purchases in this file.</div>' +
        '<div class="muted small">Check that the columns are matched correctly, and that purchases are the right sign (negative or positive).</div>' +
        '<div class="modal-actions"><button class="pill" data-action="imp-cancel">Close</button><button class="pill filled" data-action="csv-adjust">Adjust columns</button></div></div></div>';
      return html;
    }

    if (r.rows.length === 0) {
      html += '<div class="strong">I couldn\'t find any purchases in this PDF.</div>' +
        '<div class="muted small">Here is the text the app could read. If you copy it (check for personal details first) or screenshot it and send it to me, I can fix the reader.</div>' +
        '<div class="sample" translate="no">' + esc(r.result.sample) + '</div>' +
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
        '<span class="muted">' + row.date.toLocaleString(I18N.loc(), { day: 'numeric', month: 'short' }) + '</span>' +
        '<div><input type="text" data-imp="name" data-i="' + i + '" value="' + esc(row.name) + '">' +
        (row.note ? '<div class="imp-note">' + esc(row.note) + '</div>' : '') + '</div>' +
        '<select data-imp="category" data-i="' + i + '">' + opts + '</select>' +
        '<span class="num strong">' + S.moneyIn(r.sourceCur, row.amount) + '</span>' +
        '<label class="check"><input type="checkbox" data-imp="remember" data-i="' + i + '"' + (row.remember ? ' checked' : '') + '> Remember</label></div>';
    });

    var n = importChosen().length;
    html += '</div><div class="msg-row"><span class="strong" id="imp-count">' + esc(importFooterText()) + '</span>' +
      '<span class="head-actions"><button class="pill" data-action="imp-cancel">Cancel</button>' +
      '<button class="pill filled" id="imp-run" data-action="imp-run"' + (n === 0 || r.converting ? ' disabled' : '') + '>' + esc(r.converting ? T('Converting…') : T('Import {n}', { n: n })) + '</button></span></div>' +
      (r.error ? '<div class="error small">' + esc(r.error) + '</div>' : '') +
      '</div></div>';
    return html;
  }

  function updateImportFooter() {
    var n = importChosen().length;
    var count = document.getElementById('imp-count');
    var run = document.getElementById('imp-run');
    if (count) count.textContent = importFooterText();
    if (run) {
      run.textContent = T('Import {n}', { n: n });
      run.disabled = n === 0 || ui.review.converting;
    }
  }

  function finishImport(list, fps, rules, chosen, notes) {
    var total = list.reduce(function (sum, item) { return sum + item.amount; }, 0);
    var ids = S.addImported(list, fps, rules);
    ui.lastBatch = { ids: ids, fps: fps };
    ui.message = pl(chosen.length, 'Imported {n} entry totaling {total}.', 'Imported {n} entries totaling {total}.', { total: money(total) }) + (notes ? ' ' + notes : '');
    ui.modal = null;
    ui.review = null;
    render();
  }

  function runImport() {
    var chosen = importChosen();
    if (chosen.length === 0 || ui.review.converting) return;
    var from = ui.review.sourceCur, to = S.state.currency;
    var list = [], fps = [], rules = {};
    chosen.forEach(function (row) {
      list.push({ category: row.category, amount: row.amount, date: row.date, name: row.name.trim() });
      fps.push(row.fp);
      if (row.remember) rules[row.key] = row.category;
    });
    if (from === to) { finishImport(list, fps, rules, chosen, ''); return; }

    // Different currency: convert each purchase at the rate from its own date.
    var review = ui.review;
    review.converting = true;
    review.error = '';
    render();
    var days = {}, unique = [];
    list.forEach(function (item) {
      var k = item.date.getFullYear() + '-' + item.date.getMonth() + '-' + item.date.getDate();
      if (!days[k]) { days[k] = { date: item.date, rate: null }; unique.push(days[k]); }
      item.dayKey = k;
    });
    var oldRates = 0, next = 0, failed = false;
    function worker() {
      if (failed || next >= unique.length) return Promise.resolve();
      var d = unique[next++];
      return S.getRate(from, to, d.date).then(function (r) {
        d.rate = r.rate;
        if (r.source === 'old') oldRates++;
      }).then(worker);
    }
    var workers = [];
    for (var i = 0; i < Math.min(4, unique.length); i++) workers.push(worker());
    Promise.all(workers).then(function () {
      if (ui.review !== review) return; // cancelled meanwhile
      list.forEach(function (item) {
        var rate = days[item.dayKey].rate;
        item.originalAmount = item.amount;
        item.originalCurrency = from;
        item.rate = rate;
        item.amount = Math.round(item.amount * rate * 100) / 100;
        delete item.dayKey;
      });
      finishImport(list, fps, rules, chosen, oldRates ? T('Some rates came from the newest saved day because you were offline.') : '');
    }).catch(function () {
      failed = true;
      review.converting = false;
      review.error = T("Couldn't get exchange rates. Connect to the internet and try again.");
      if (ui.review === review) render();
    });
  }

  function handlePdfFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      BankImport.readPdf(reader.result).then(function (text) {
        if (!text.trim()) {
          ui.message = T("Couldn't read that PDF: it has no readable text. Download the movements PDF from the Santander app and try again.");
          render();
          return;
        }
        ui.review = buildReview(BankImport.parse(text), file.name);
        ui.review.sourceCur = '€';
        ui.modal = 'import';
        render();
      }).catch(function () {
        ui.message = T("Couldn't read that PDF. Is it the movements file from Santander?");
        render();
      });
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------- CSV import ----------

  function buildCsvReview(ctx) {
    var review = buildReview(BankImport.parseCsv(ctx.table, ctx.detected), ctx.fileName);
    review.csv = ctx;
    var id = ctx.detected.preset && ctx.detected.preset.id;
    if (id === 'bbva') review.sourceCur = '€';
    else if (id) review.sourceCur = '$';
    return review;
  }

  function handleBankFile(file) {
    var name = file.name || '';
    if (/\.xlsx?$/i.test(name)) {
      ui.message = T("Excel files can't be read directly. Open it in Excel or Numbers, choose File → Save As (or Export) → CSV, and import that file.");
      render();
      return;
    }
    if (/\.(csv|tsv|txt)$/i.test(name) || /csv|text\/plain/.test(file.type || '')) {
      var reader = new FileReader();
      reader.onload = function () {
        var text = BankImport.decodeText(reader.result);
        var table = BankImport.csvTable(text);
        if (table.rows.length < 2) {
          ui.message = T("Couldn't read that file. Is it a CSV with your transactions?");
          render();
          return;
        }
        var detected = BankImport.detectCsv(table, I18N.lang && I18N.lang());
        var ctx = { fileName: name, table: table, detected: detected };
        if (detected.ready) {
          ui.review = buildCsvReview(ctx);
          ui.modal = 'import';
        } else {
          ui.csv = ctx;
          ui.modal = 'csvmap';
        }
        render();
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    handlePdfFile(file);
  }

  function csvSelect(field, value, allowNone) {
    var d = ui.csv.detected;
    var opts = allowNone ? '<option value="-1"' + (value < 0 ? ' selected' : '') + '>—</option>' : '';
    d.headers.forEach(function (h, i) {
      opts += '<option value="' + i + '"' + (i === value ? ' selected' : '') + '>' + esc(h || ('Column ' + (i + 1))) + '</option>';
    });
    return '<select data-csv="' + field + '">' + opts + '</select>';
  }

  function renderCsvModal() {
    var c = ui.csv, d = c.detected, m = d.mapping;
    var two = m.amount < 0 && (m.debit >= 0 || m.credit >= 0 || ui.csvTwo);
    var ok = m.date >= 0 && m.desc >= 0 && (two ? (m.debit >= 0 || m.credit >= 0) : m.amount >= 0);
    var rows = '<label class="csv-field">Date' + csvSelect('date', m.date, true) + '</label>' +
      '<label class="csv-field">Description' + csvSelect('desc', m.desc, true) + '</label>' +
      '<label class="csv-field">Amounts are in' +
      '<select data-csv="mode"><option value="one"' + (two ? '' : ' selected') + '>One column</option><option value="two"' + (two ? ' selected' : '') + '>Two columns (money out / money in)</option></select></label>';
    if (two) {
      rows += '<label class="csv-field">Money out' + csvSelect('debit', m.debit, true) + '</label>' +
        '<label class="csv-field">Money in' + csvSelect('credit', m.credit, true) + '</label>';
    } else {
      rows += '<label class="csv-field">Amount' + csvSelect('amount', m.amount, true) + '</label>' +
        '<label class="csv-field">Purchases show up as' +
        '<select data-csv="spend"><option value="neg"' + (m.spend === 'neg' ? ' selected' : '') + '>Negative numbers (−12.50)</option><option value="pos"' + (m.spend === 'pos' ? ' selected' : '') + '>Positive numbers (12.50)</option>' +
        (m.type >= 0 ? '<option value="type"' + (m.spend === 'type' ? ' selected' : '') + '>Decided by the Type column</option>' : '') + '</select></label>';
    }
    rows += '<label class="csv-field">Dates are written as' +
      '<select data-csv="order"><option value="mdy"' + (m.order === 'mdy' ? ' selected' : '') + '>Month / Day / Year</option><option value="dmy"' + (m.order === 'dmy' ? ' selected' : '') + '>Day / Month / Year</option></select></label>';
    var prev = ok ? BankImport.previewCsv(c.table, d, 4) : [];
    var table = '';
    if (ok) {
      table = prev.length ? '<div class="csv-prev">' + prev.map(function (p) {
        return '<div class="row"><span class="muted">' + esc(p.date.toLocaleString(I18N.loc(), { day: 'numeric', month: 'short', year: 'numeric' })) + '</span><span translate="no">' + esc(p.desc) + '</span><span class="num" translate="no">' + esc(p.raw) + '</span></div>';
      }).join('') + '</div>' : '<div class="imp-note">No rows could be read with these settings.</div>';
    }
    return '<div class="overlay"><div class="modal wide"><h2>Match the columns</h2>' +
      '<div class="muted small">' + esc(T("I couldn't recognise this bank's file, so tell me which column is which.")) + '</div>' +
      '<div class="csv-grid">' + rows + '</div>' + table +
      '<div class="modal-actions"><button class="pill" data-action="csv-cancel">Cancel</button>' +
      '<button class="pill filled" data-action="csv-continue"' + (ok && prev.length ? '' : ' disabled') + '>Continue</button></div></div></div>';
  }

  function handleCsvField(field, value) {
    var m = ui.csv.detected.mapping;
    if (field === 'mode') {
      ui.csvTwo = value === 'two';
      if (ui.csvTwo) m.amount = -1; else { m.debit = -1; m.credit = -1; }
    } else if (field === 'order' || field === 'spend') m[field] = value;
    else m[field] = Number(value);
    render();
  }

  // ---------- setup ----------

  var STEP_LABELS = ['Language & currency', 'Pay period', 'Starting savings', 'Budgets', 'Review'];

  function ensureSetup() {
    if (ui.setup) return;
    ui.setup = {
      step: 1,
      dir: 'fwd',
      animate: false,
      currency: '€',
      periodDay: 1,
      ballerText: '0',
      error: '',
      cats: S.state.categories.map(function (c) {
        return { key: S.newId(), name: I18N.catName(c.name), budgetText: '0', fixed: c.isFixedBill };
      })
    };
  }

  function setupTotalNumber() {
    var total = 0;
    ui.setup.cats.forEach(function (c) {
      var n = S.parseAmount(c.budgetText);
      if (n !== null) total += n;
    });
    return total;
  }

  function setupTotal() {
    var total = setupTotalNumber();
    var text = Math.abs(total - Math.round(total)) < 1e-9 ? String(Math.round(total)) : total.toFixed(2);
    return ui.setup.currency + text;
  }

  function periodPreview(day) {
    if (day === 1) return T('Periods follow the calendar: from the 1st to the last day of each month.');
    if (day === 0) return T('Each period starts on the last day of a month and ends the day before the last day of the next one.');
    return T('Each period runs from day {a} of one month to day {b} of the next.', { a: day, b: day - 1 });
  }

  /** Checks the categories. Returns the list, or null after setting an error. */
  function validateCats() {
    var s = ui.setup;
    var result = [];
    var seen = {};
    for (var i = 0; i < s.cats.length; i++) {
      var c = s.cats[i];
      var name = c.name.trim();
      if (!name) { s.error = T('Every category needs a name.'); return null; }
      if (name.toLowerCase() === S.BALLER.toLowerCase()) { s.error = T('"Baller Budget" is already built in. Pick another name.'); return null; }
      if (seen[name.toLowerCase()]) { s.error = T('Two categories are named "{name}".', { name: name }); return null; }
      seen[name.toLowerCase()] = true;
      var budget = S.parseAmount(c.budgetText);
      if (budget === null || budget < 0) { s.error = T('Check the budget for {name}.', { name: name }); return null; }
      result.push({ name: name, monthlyBudget: budget, isFixedBill: c.fixed });
    }
    if (result.length === 0) { s.error = T('Add at least one category.'); return null; }
    return result;
  }

  function validateBaller() {
    var start = S.parseAmount(ui.setup.ballerText);
    if (start === null) { ui.setup.error = T('Check the starting Baller Budget.'); return null; }
    return start;
  }

  /** Moves to another step. Going forward is checked; going back never is. */
  function setupGo(step, dir) {
    var s = ui.setup;
    if (step < 1 || step > STEP_LABELS.length) return;
    s.error = '';
    s.dir = dir;
    s.animate = true;
    s.step = step;
    render();
    var scroller = document.querySelector('#app > div');
    if (scroller) scroller.scrollTop = 0;
  }

  function setupNext() {
    var s = ui.setup;
    s.error = '';
    if (s.step === 3 && validateBaller() === null) { render(); return; }
    if (s.step === 4 && validateCats() === null) { render(); return; }
    setupGo(s.step + 1, 'fwd');
  }

  function stepper() {
    var s = ui.setup;
    return '<ol class="stepper" aria-label="Setup steps">' + STEP_LABELS.map(function (label, i) {
      var n = i + 1;
      var cls = n === s.step ? 'current' : (n < s.step ? 'done' : '');
      var inner = '<span class="num-dot">' + (n < s.step ? '✓' : n) + '</span><span class="lbl">' + esc(label) + '</span>';
      var attrs = n < s.step ? ' data-action="setup-goto" data-step="' + n + '" role="button" tabindex="0"' : '';
      return '<li class="' + cls + '"' + (n === s.step ? ' aria-current="step"' : '') + attrs + '>' + inner + '</li>';
    }).join('') + '</ol>';
  }

  function stepBody() {
    var s = ui.setup;
    if (s.step === 1) {
      return '<h2 class="step-title">Choose your language and currency</h2>' +
        '<div class="card stack-sm"><h3>Language</h3>' + langToggle() + '</div>' +
        '<div class="card stack-sm"><h3>Currency</h3><div class="muted small">Your budgets are in this currency. You can still log entries in the others and they are converted for you.</div>' +
        currencyButtons('setup-currency', s.currency) + '</div>';
    }
    if (s.step === 2) {
      return '<h2 class="step-title">When does your pay period start?</h2>' +
        '<div class="card stack-sm"><h3>Pay day</h3><div class="muted small">Most stipends arrive once a month. Pick the day yours lands. Each period runs from that day to the day before the next one. If it arrives on the 1st, just leave it as it is.</div>' +
        '<select data-setup="day" style="width:240px" aria-label="Pay period start day">' + dayOptions(s.periodDay) + '</select>' +
        '<div class="muted small" id="period-preview">' + esc(periodPreview(s.periodDay)) + '</div></div>';
    }
    if (s.step === 3) {
      return '<h2 class="step-title">Starting Baller Budget</h2>' +
        '<div class="card stack-sm"><h3>Starting Baller Budget</h3>' +
        '<div class="muted small">Savings you already have to spend freely. Leave it at 0 if you\'re starting fresh.</div>' +
        '<input type="text" inputmode="decimal" style="width:160px" data-setup="baller" value="' + esc(s.ballerText) + '"></div>';
    }
    if (s.step === 4) {
      var cats = s.cats.map(function (c) {
        return '<div class="edit-row">' +
          '<input type="text" class="grow" placeholder="Category name" data-setup="name" data-key="' + esc(c.key) + '" value="' + esc(c.name) + '">' +
          '<label class="check"><input type="checkbox" data-setup="fixed" data-key="' + esc(c.key) + '"' + (c.fixed ? ' checked' : '') + '> Fixed bill</label>' +
          '<input type="text" inputmode="decimal" class="right" placeholder="Budget" style="width:100px" data-setup="budget" data-key="' + esc(c.key) + '" value="' + esc(c.budgetText) + '">' +
          '<button class="pill small" data-action="setup-remove" data-key="' + esc(c.key) + '">Remove</button></div>';
      }).join('');
      return '<h2 class="step-title">Your categories and budgets</h2>' +
        '<div class="card stack-sm"><h3>Categories and budgets</h3>' +
        '<div class="muted small">Type a budget for each category, for one pay period. Turn on "Fixed bill" for something you pay in one go, like rent.</div>' +
        '<div class="total-banner"><span class="t">Total budget per period</span><span class="v" id="setup-total">' + esc(setupTotal()) + '</span></div>' +
        cats + '<div><button class="pill small" data-action="setup-add">Add category</button></div></div>';
    }
    var lang = I18N.lang() === 'es' ? 'Español' : 'English';
    return '<h2 class="step-title">Review and start</h2>' +
      '<div class="card stack-sm"><div class="muted small">Everything here can be changed later in Settings.</div>' +
      '<div class="sum-line"><span>Language</span><span translate="no">' + lang + '</span></div>' +
      '<div class="sum-line"><span>Currency</span><span translate="no">' + esc(s.currency) + '</span></div>' +
      '<div class="sum-line"><span>Pay period starts on</span><span>' + esc(dayText(s.periodDay)) + '</span></div>' +
      '<div class="sum-line"><span>Starting Baller Budget</span><span>' + esc(s.currency + (S.parseAmount(s.ballerText) || 0)) + '</span></div>' +
      '<div class="sum-line"><span>Categories</span><span>' + s.cats.length + '</span></div>' +
      '<div class="hr"></div><div class="sum-line strong" style="font-size:16px"><span>Total budget per period</span><span>' + esc(setupTotal()) + '</span></div></div>';
  }

  function renderSetup() {
    ensureSetup();
    var s = ui.setup;
    var last = s.step === STEP_LABELS.length;
    var anim = s.animate ? ' anim-' + s.dir : '';
    s.animate = false;
    return '<div class="setup">' + saveWarning() +
      '<div class="logo-lg"><b style="font-weight:800">Stipend</b>Tracker</div>' +
      '<div class="muted" style="font-size:15px;margin-top:-10px">Let\'s set up your budget. You can change all of this later in Settings.</div>' +
      stepper() +
      '<div class="step-count muted small">' + esc(T('Step {n} of {total}', { n: s.step, total: STEP_LABELS.length })) + '</div>' +
      '<div class="step-panel' + anim + '">' + stepBody() + '</div>' +
      '<div class="error" id="setup-error">' + esc(s.error) + '</div>' +
      '<div class="step-nav">' + (s.step > 1 ? '<button class="pill" data-action="setup-back">‹ Back</button>' : '<span></span>') +
      (last ? '<button class="pill filled" data-action="setup-finish">Start tracking</button>' : '<button class="pill filled" data-action="setup-next">Next ›</button>') + '</div></div>';
  }

  function finishSetup() {
    var s = ui.setup;
    var result = validateCats();
    if (!result) { s.step = 4; return false; }
    var start = validateBaller();
    if (start === null) { s.step = 3; return false; }
    S.completeSetup({ currency: s.currency, ballerStart: start, categories: result, periodStartDay: s.periodDay });
    return true;
  }

  // ---------- render ----------

  function render() {
    var app = document.getElementById('app');
    if (!S.state.hasCompletedSetup) {
      app.innerHTML = '<div style="height:100%;overflow-y:auto">' + renderSetup() + '</div>';
      I18N.apply(app);
      return;
    }
    var sc = ui.screen;
    var main;
    if (sc.name === 'home') main = renderHome();
    else if (sc.name === 'history') main = renderHistory();
    else if (sc.name === 'month') main = renderMonth();
    else if (sc.name === 'trends') main = renderTrends();
    else if (sc.category === S.BALLER) main = renderBallerLog();
    else main = renderCategory();
    var modal = '';
    if (ui.modal === 'settings') modal = renderSettingsModal();
    else if (ui.modal === 'baller') modal = renderBallerModal();
    else if (ui.modal === 'edit' && ui.edit) modal = renderEditModal();
    else if (ui.modal === 'import' && ui.review) modal = renderImportModal();
    else if (ui.modal === 'csvmap' && ui.csv) modal = renderCsvModal();
    app.innerHTML = '<div class="shell' + (ui.menuOpen ? ' menu-open' : '') + '">' +
      '<div class="topbar"><button class="menu-btn" data-action="open-menu" aria-label="Menu">☰</button><div class="logo-sm"><b>Stipend</b>Tracker</div></div>' +
      '<div class="scrim" data-action="close-menu"></div>' +
      '<div class="sidebar">' + renderSidebar() + '</div><div class="main" id="main">' + main + '</div></div>' + modal;
    I18N.apply(app);
    var tw = document.querySelector('.trend-wrap');
    if (tw) tw.scrollLeft = tw.scrollWidth;
  }

  function go(screen) {
    if (screen.name !== 'trends') ui.trendSel = null;
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
      ui.message = T('Type an amount first.');
      render();
      return;
    }
    if (ui.busy) return;
    amount = Math.abs(amount);
    var name = ui.form.name.trim();
    var when = new Date();
    var parts = (ui.form.date || todayString()).split('-');
    var picked = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var today = new Date();
    var isToday = picked.getFullYear() === today.getFullYear() && picked.getMonth() === today.getMonth() && picked.getDate() === today.getDate();
    if (!isToday) when = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 12, 0, 0);

    var category = ui.form.category;
    var from = formCurrency();
    var main = S.state.currency;

    if (from === main) {
      finishEntry(category, name, when, amount, null);
      return;
    }

    ui.busy = true;
    var msg = document.getElementById('entry-msg');
    if (msg) msg.textContent = T('Converting…');
    S.getRate(from, main, picked).then(function (r) {
      ui.busy = false;
      var converted = Math.round(amount * r.rate * 100) / 100;
      if (!(converted > 0)) {
        ui.message = T('That amount is too small to convert.');
        render();
        return;
      }
      finishEntry(category, name, when, converted, { originalAmount: amount, originalCurrency: from, rate: r.rate });
    }).catch(function () {
      ui.busy = false;
      ui.message = T("Couldn't get an exchange rate. Connect to the internet once and try again, or switch back to {main}.", { main: main });
      render();
    });
  }

  function finishEntry(category, name, when, amount, conversion) {
    var entry = { category: category, amount: amount, date: when, name: name };
    if (conversion) {
      entry.originalAmount = conversion.originalAmount;
      entry.originalCurrency = conversion.originalCurrency;
      entry.rate = conversion.rate;
    }
    S.addEntry(entry);
    ui.form.amount = '';
    ui.form.name = '';
    ui.form.date = todayString();
    ui.form.currency = '';
    ui.rate = null;
    var suffix = name ? ' (' + name + ')' : '';
    var shown = conversion ? S.moneyIn(conversion.originalCurrency, conversion.originalAmount) + ' → ' + money(amount) : money(amount);

    if (category === S.BALLER) {
      ui.message = T('Spent {shown}{suffix} from the Baller Budget. Balance: {balance}.', { shown: shown, suffix: suffix, balance: money(S.ballerBalance()) });
    } else {
      ui.message = T('Added {shown} to {category}{suffix}.', { shown: shown, category: category, suffix: suffix });
      if (S.sameMonth(when, new Date())) {
        var row = S.rows(new Date()).filter(function (r) { return r.name === category; })[0];
        if (row) {
          var st = S.rowStatus(row, new Date());
          if (st === 'slightlyHigh') ui.message += T(" Heads up: that's a little high for this point in the month.");
          else if (st === 'wayOver') ui.message += T(" Warning: that's way over where you should be.");
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
      ui.message = T('Nothing to undo.');
    } else {
      ui.message = T('Removed {amount} from {category}{suffix}.', { amount: money(removed.amount), category: removed.category, suffix: removed.name ? ' (' + removed.name + ')' : '' });
    }
    render();
  }

  function addFunds() {
    var input = document.getElementById('b-add');
    var value = S.parseAmount(input ? input.value : '');
    if (value === null || value <= 0) {
      ui.ballerMsg = T('Type an amount first.');
    } else {
      S.addDeposit(value);
      ui.ballerMsg = T('Added {amount}.', { amount: money(value) });
    }
    render();
  }

  function addCategoryFromModal() {
    var nameInput = document.getElementById('new-cat-name');
    var budgetInput = document.getElementById('new-cat-budget');
    var budgetText = budgetInput.value.trim();
    var budget = budgetText === '' ? 0 : S.parseAmount(budgetText);
    if (budget === null || budget < 0) {
      ui.settingsMsg = T('Check the budget amount.');
    } else if (S.addCategory(nameInput.value, budget, false)) {
      ui.settingsMsg = T('Added {name}.', { name: nameInput.value.trim() });
    } else {
      ui.settingsMsg = T('That name is empty or already used.');
    }
    render();
  }

  function download(fileName, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function recurringNotice(n) {
    if (n > 0) ui.message = pl(n, 'Added {n} recurring entry.', 'Added {n} recurring entries.');
  }

  function addRecurringFromForm() {
    var amount = S.parseAmount(ui.rec.amount);
    if (amount === null || !(amount > 0)) { ui.recMsg = T('Type an amount first.'); render(); return; }
    if (!ui.rec.category) { ui.recMsg = T('Add a category first.'); render(); return; }
    var added = S.addRecurring({ category: ui.rec.category, amount: Math.round(amount * 100) / 100, name: ui.rec.name.trim(), day: Number(ui.rec.day) });
    recurringNotice(added);
    ui.rec.amount = ''; ui.rec.name = '';
    ui.recMsg = T('Recurring entry saved.');
    render();
  }

  function exportBackup() {
    S.markBackup();
    download('StipendTracker-backup-' + todayString() + '.json', S.exportJSON(), 'application/json');
    render();
  }

  function exportCsv(month) {
    var label = month ? S.monthKey(month) : 'all';
    download('StipendTracker-entries-' + label + '.csv', S.exportCSV(month), 'text/csv;charset=utf-8');
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
      case 'set-lang':
        I18N.setLang(el.getAttribute('data-value'));
        if (ui.setup) {
          ui.setup.cats.forEach(function (c) { c.name = I18N.catName(c.name); });
          ui.setup.error = '';
        }
        ui.message = '';
        render();
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
      case 'open-settings': ui.modal = 'settings'; ui.settingsMsg = ''; ui.periodMsg = ''; ui.recMsg = ''; ui.confirmReset = false; ui.pendingImport = null; ui.importError = ''; render(); break;
      case 'open-baller': ui.modal = 'baller'; ui.ballerMsg = ''; render(); break;
      case 'close-modal': ui.modal = null; render(); break;
      case 'add-funds': addFunds(); break;
      case 'add-cat': addCategoryFromModal(); break;
      case 'archive-cat': S.setArchived(el.getAttribute('data-id'), true); render(); break;
      case 'restore-cat': S.setArchived(el.getAttribute('data-id'), false); render(); break;
      case 'set-currency': S.setCurrency(el.getAttribute('data-value')); ui.form.currency = ''; ui.rate = null; render(); break;
      case 'entry-currency':
        ui.form.currency = el.getAttribute('data-value');
        ui.rate = null;
        render();
        lookupRate();
        break;
      case 'export-backup': exportBackup(); break;
      case 'backup-now': exportBackup(); break;
      case 'add-recurring': addRecurringFromForm(); break;
      case 'delete-recurring': S.removeRecurring(el.getAttribute('data-id')); render(); break;
      case 'go-trends': go({ name: 'trends' }); break;
      case 'cal-period': ui.calKey = el.getAttribute('data-key'); render(); break;
      case 'snooze-backup': S.snoozeBackup(); render(); break;
      case 'export-csv-all': exportCsv(null); break;
      case 'export-csv-current': exportCsv(new Date()); break;
      case 'export-csv-month': exportCsv(new Date(Number(el.getAttribute('data-month')))); break;
      case 'edit-entry': startEdit(el.getAttribute('data-id')); break;
      case 'cancel-edit': ui.edit = null; ui.modal = null; render(); break;
      case 'save-edit': saveEdit(); break;
      case 'setup-next': setupNext(); break;
      case 'setup-back': setupGo(ui.setup.step - 1, 'back'); break;
      case 'setup-goto': setupGo(Number(el.getAttribute('data-step')), 'back'); break;
      case 'pick-import': document.getElementById('import-file').click(); break;
      case 'confirm-import': {
        var result = S.importJSON(ui.pendingImport);
        ui.pendingImport = null;
        ui.importError = result.ok ? '' : result.error;
        if (result.ok) { ui.modal = null; ui.setup = null; ui.screen = { name: 'home' }; recurringNotice(S.applyRecurring()); }
        render();
        break;
      }
      case 'cancel-import': ui.pendingImport = null; render(); break;
      case 'ask-reset': ui.confirmReset = true; render(); break;
      case 'cancel-reset': ui.confirmReset = false; render(); break;
      case 'confirm-reset':
        S.resetAll();
        ui.confirmReset = false; ui.modal = null; ui.setup = null; ui.screen = { name: 'home' };
        ui.form = { category: '', amount: '', name: '', date: '', currency: '' }; ui.rate = null; ui.message = '';
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
          ui.form = { category: '', amount: '', name: '', date: '', currency: '' }; ui.rate = null; ui.message = '';
          render();
        } else {
          render();
        }
        break;
      case 'import-pdf': document.getElementById('pdf-file').click(); break;
      case 'undo-import':
        if (ui.lastBatch) {
          S.undoImport(ui.lastBatch.ids, ui.lastBatch.fps);
          ui.lastBatch = null;
          ui.message = T('Import undone. Stores you chose to remember are still remembered.');
          render();
        }
        break;
      case 'imp-cancel': ui.modal = null; ui.review = null; render(); break;
      case 'imp-currency':
        if (ui.review && !ui.review.converting) { ui.review.sourceCur = el.getAttribute('data-value'); ui.review.error = ''; render(); }
        break;
      case 'csv-cancel': ui.modal = null; ui.csv = null; ui.csvTwo = false; render(); break;
      case 'csv-adjust':
        ui.csv = ui.review.csv; ui.csvTwo = ui.csv.detected.mapping.amount < 0;
        ui.review = null; ui.modal = 'csvmap'; render(); break;
      case 'csv-continue':
        ui.review = buildCsvReview(ui.csv); ui.csv = null; ui.csvTwo = false; ui.modal = 'import'; render(); break;
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
    if (document.getElementById('trend-tip')) {
      var bar = e.target.closest('[data-bar]');
      ui.trendSel = bar ? Number(bar.getAttribute('data-bar')) : null;
      setTrendHover(bar ? Number(bar.getAttribute('data-bar')) : null, bar ? bar.getAttribute('data-cat') : null);
    }
    var el = e.target.closest('[data-action]');
    if (el) handleAction(el.getAttribute('data-action'), el);
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-imp') === 'name' && ui.review) {
      ui.review.rows[Number(t.getAttribute('data-i'))].name = t.value;
      return;
    }
    if (t.hasAttribute('data-rec')) {
      ui.rec[t.getAttribute('data-rec')] = t.value;
      return;
    }
    if (t.hasAttribute('data-edit') && ui.edit) {
      var ef = t.getAttribute('data-edit');
      ui.edit[ef === 'amount' ? 'amountText' : ef] = t.value;
      return;
    }
    if (t.hasAttribute('data-form')) {
      ui.form[t.getAttribute('data-form')] = t.value;
      if (t.getAttribute('data-form') === 'amount') updateRateHint();
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
        var tt = document.getElementById('setup-total');
        if (tt) tt.textContent = setupTotal();
      }
    }
  });

  function refreshBallerNumbers() {
    var map = {
      'b-title': T(S.ballerTitle()),
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
      if (pdf) handleBankFile(pdf);
      return;
    }
    if (t.getAttribute && t.getAttribute('data-csv') && ui.csv) {
      handleCsvField(t.getAttribute('data-csv'), t.value);
      return;
    }
    if (t.hasAttribute('data-period-day')) {
      S.changePeriodStart(Number(t.value));
      ui.periodMsg = T('Saved. It applies from your next period.');
      render();
      return;
    }
    if (t.getAttribute && t.getAttribute('data-setup') === 'day' && ui.setup) {
      ui.setup.periodDay = Number(t.value);
      render();
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
      if (t.getAttribute('data-form') === 'date' && formIsForeign()) { ui.rate = null; updateRateHint(); lookupRate(); }
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
    var seg = e.target.closest ? e.target.closest('[data-bar]') : null;
    if (seg && document.getElementById('trend-tip')) setTrendHover(Number(seg.getAttribute('data-bar')), seg.getAttribute('data-cat'));
    var row = e.target.closest ? e.target.closest('.legend-row') : null;
    if (row) setRingHover(row.getAttribute('data-name'));
  });

  document.addEventListener('mouseout', function (e) {
    var bar = e.target.closest ? e.target.closest('[data-bar]') : null;
    if (bar && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-bar]')) && document.getElementById('trend-tip')) setTrendHover(null);
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

  // Keep today's exchange rate fresh (only if you have ever used the other currency).
  S.refreshRates();
  recurringNotice(S.applyRecurring());
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      S.refreshRates();
      var n = S.applyRecurring();
      if (n > 0 && S.state.hasCompletedSetup) { recurringNotice(n); render(); }
    }
  });

  render();
})();
