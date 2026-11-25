/* StipendTracker: reads a Santander movements PDF and finds the purchases in it.
   A port of the Mac app's BankImport.swift. */
(function () {
  'use strict';

  var MONTHS = {
    ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
    sept: 9, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12
  };

  var DATE_SRC = '(\\d{1,2})\\s+(ene|jan|feb|mar|abr|apr|may|jun|jul|ago|aug|sept|sep|set|oct|nov|dic|dec)\\.?\\s+(\\d{4})';
  var AMOUNT_SRC = '(-)?\\s*(\\d{1,3}(?:\\.\\d{3})+|\\d+),(\\d{2})\\s*€';
  var VALUE_DATE_SRC = '(?:Value date|Fecha valor)\\s*:?\\s*\\d{1,2}\\s+[A-Za-z]{3,5}\\.?\\s+\\d{4}';
  var CARD_SRC = 'Tarj\\.?\\s*:?\\s*\\*?\\d*';

  var CARD_PREFIXES = [
    'Transaccion Contactless En ', 'Transacción Contactless En ', 'Compra Internet En ',
    'Compra En ', 'Pago Movil En ', 'Pago Móvil En ', 'Contactless En '
  ];

  var BOILERPLATE = [
    'holder', 'account', 'available balance', 'document on', 'page ',
    'your account activity', 'transaction date',
    'titular', 'cuenta', 'saldo disponible', 'documento', 'página', 'pagina', 'movimientos'
  ];

  // ---------- reading the PDF ----------

  /** Turns pdf.js text pieces into lines of text, the way they look on the page. */
  function linesFrom(items) {
    var pieces = items.filter(function (it) { return it.str && it.str.trim() !== ''; }).map(function (it) {
      return { text: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 };
    });
    pieces.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
    var lines = [];
    var current = [];
    var lastY = null;
    pieces.forEach(function (p) {
      if (lastY !== null && Math.abs(p.y - lastY) > 3) {
        lines.push(current);
        current = [];
      }
      current.push(p);
      lastY = p.y;
    });
    if (current.length) lines.push(current);
    return lines.map(function (line) {
      line.sort(function (a, b) { return a.x - b.x; });
      var out = '';
      var prevEnd = null;
      line.forEach(function (p) {
        if (prevEnd !== null && p.x - prevEnd > 1.5) out += ' ';
        out += p.text;
        prevEnd = p.x + p.w;
      });
      return out;
    }).join('\n');
  }

  function readPdf(arrayBuffer) {
    var lib = window.pdfjsLib;
    if (!lib) return Promise.reject(new Error('The PDF reader did not load.'));
    lib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
    return lib.getDocument({ data: arrayBuffer }).promise.then(function (pdf) {
      var jobs = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        jobs.push(pdf.getPage(i).then(function (page) {
          return page.getTextContent().then(function (content) { return linesFrom(content.items); });
        }));
      }
      return Promise.all(jobs).then(function (pages) { return pages.join('\n'); });
    });
  }

  // ---------- finding the purchases ----------

  function removeBoilerplateLines(text) {
    return text.split(/\r?\n/).filter(function (line) {
      var lower = line.trim().toLowerCase();
      return !BOILERPLATE.some(function (start) { return lower.indexOf(start) === 0; });
    }).join('\n');
  }

  function allMatches(source, flags, text) {
    var re = new RegExp(source, flags);
    var found = [];
    var m;
    while ((m = re.exec(text)) !== null) {
      found.push(m);
      if (m[0].length === 0) re.lastIndex++;
    }
    return found;
  }

  function valueOf(m) {
    var whole = m[2].replace(/\./g, '');
    var number = parseFloat(whole + '.' + m[3]);
    return m[1] ? -number : number;
  }

  function tidy(text) {
    return text.split(/\s+/).filter(function (w) { return w !== ''; }).join(' ').replace(/^[ ,]+|[ ,]+$/g, '');
  }

  /** Works out the store (or Bizum person) behind a bank description. */
  function analyze(description) {
    var lower = description.toLowerCase();

    if (lower.indexOf('bizum') === 0) {
      var person = description;
      var concept = '';
      var ci = lower.indexOf('concepto:');
      if (ci >= 0) {
        person = description.slice(0, ci);
        concept = description.slice(ci + 'concepto:'.length);
      }
      var fi = person.toLowerCase().indexOf('a favor de');
      if (fi >= 0) person = person.slice(fi + 'a favor de'.length);
      person = person.trim();
      concept = concept.trim();
      return {
        key: 'bizum ' + person.toLowerCase(),
        name: concept ? concept + ' (Bizum)' : 'Bizum to ' + person
      };
    }

    var rest = description;
    for (var i = 0; i < CARD_PREFIXES.length; i++) {
      var prefix = CARD_PREFIXES[i];
      if (lower.indexOf(prefix.toLowerCase()) === 0) {
        rest = description.slice(prefix.length);
        break;
      }
    }
    var merchant = rest;
    var comma = rest.indexOf(',');
    if (comma >= 0) merchant = rest.slice(0, comma);
    merchant = merchant.trim();
    if (merchant.length > 40) merchant = merchant.slice(0, 40);
    if (!merchant) merchant = 'Unknown';
    return { key: merchant.toLowerCase(), name: merchant };
  }

  function parse(rawText) {
    var result = { transactions: [], skippedIncoming: 0, unreadable: [], sample: rawText.slice(0, 1500) };

    var text = rawText.replace(/−/g, '-');
    text = removeBoilerplateLines(text);
    text = text.replace(new RegExp(VALUE_DATE_SRC, 'gi'), ' ');

    var dates = allMatches(DATE_SRC, 'gi', text);
    dates.forEach(function (dm, index) {
      var bodyStart = dm.index + dm[0].length;
      var bodyEnd = index + 1 < dates.length ? dates[index + 1].index : text.length;
      if (bodyEnd <= bodyStart) return;
      var body = text.slice(bodyStart, bodyEnd);

      var amounts = allMatches(AMOUNT_SRC, 'g', body);
      if (amounts.length === 0) return;

      var description = body.replace(new RegExp(AMOUNT_SRC, 'g'), ' ').replace(new RegExp(CARD_SRC, 'gi'), ' ');
      description = tidy(description);

      if (amounts.length < 2) {
        result.unreadable.push(description.slice(0, 70));
        return;
      }
      var first = valueOf(amounts[0]);
      var second = valueOf(amounts[1]);

      var day = parseInt(dm[1], 10);
      var month = MONTHS[dm[2].toLowerCase()];
      var year = parseInt(dm[3], 10);
      if (!month) return;
      var date = new Date(year, month - 1, day, 12, 0, 0);

      if (first >= 0) {
        result.skippedIncoming += 1;
        return;
      }
      var spend = -first;
      var cents = String(Math.round(spend * 100));
      var balanceCents = String(Math.round(second * 100));
      var info = analyze(description);
      result.transactions.push({
        date: date,
        amount: spend,
        merchantKey: info.key,
        name: info.name,
        fingerprint: year + '-' + month + '-' + day + '|' + cents + '|' + balanceCents
      });
    });
    return result;
  }

  /** First guess for a store nobody has categorized yet. Only used if you have that category. */
  function starterSuggestion(key, options) {
    var table = [
      ['Groceries', ['mercadona', 'froiz', 'gadis', 'ga.lu.as', 'carrefour', 'lidl', 'aldi', 'eroski', 'alcampo', 'consum', 'supersol', 'dia ']],
      ['Restaurants', ['montaditos', 'taco bell', 'mcdonald', 'burger', 'telepizza', 'pizz', 'restaurante', 'cafeteria', 'kebab', 'sushi']],
      ['Local Transit', ['titsa', 'tranvia', 'uber', 'cabify']],
      ['Travel', ['renfe', 'ryanair', 'vueling', 'iberia', 'booking', 'airbnb', 'flixbus']],
      ['Personal Care', ['farmacia', 'peluquer', 'sephora', 'primor']],
      ['Household Supplies', ['ikea', 'leroy', 'bricor', 'bazar']]
    ];
    for (var i = 0; i < table.length; i++) {
      var name = table[i][0];
      if (options.indexOf(name) < 0) {
        // the categories may be the Spanish defaults
        var es = window.I18N && window.I18N.CATS ? window.I18N.CATS[name] : null;
        if (es && options.indexOf(es) >= 0) name = es; else continue;
      }
      for (var j = 0; j < table[i][1].length; j++) {
        if (key.indexOf(table[i][1][j]) >= 0) return name;
      }
    }
    return null;
  }


  // ================= CSV bank files =================
  // Works from column names, so it copes with banks we have never seen. The presets below
  // only give a friendly name and a few tie-breakers. Nothing here has been tested against
  // real bank files yet, which is why the person can always fix the column mapping by hand.

  function plain(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  /** Turns the bytes of a file into text, trying UTF-8 first and then the older Windows encoding. */
  function decodeText(buffer) {
    var text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch (e) { text = new TextDecoder('windows-1252').decode(buffer); }
    return text.replace(/^﻿/, '');
  }

  function detectDelimiter(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; }).slice(0, 15);
    var best = ',', bestScore = -1;
    [',', ';', '\t'].forEach(function (d) {
      var counts = lines.map(function (l) { return splitLine(l, d).length; });
      var common = {};
      counts.forEach(function (c) { common[c] = (common[c] || 0) + 1; });
      var top = 0, topCount = 0;
      Object.keys(common).forEach(function (k) { if (common[k] > topCount && Number(k) > 1) { top = Number(k); topCount = common[k]; } });
      var score = topCount * 100 + top;
      if (top > 1 && score > bestScore) { best = d; bestScore = score; }
    });
    return best;
  }

  function splitLine(line, delim) {
    var out = [], cur = '', quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (quoted) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  /** Splits CSV text into rows of cells (quoted cells may contain line breaks). */
  function csvTable(text) {
    var delim = detectDelimiter(text);
    var rows = [], row = [], cur = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (quoted) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row.map(function (c) { return c.trim(); }));
        row = [];
      } else cur += ch;
    }
    row.push(cur);
    if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row.map(function (c) { return c.trim(); }));
    return { delim: delim, rows: rows };
  }

  var SYN = {
    date: ['date', 'transaction date', 'posting date', 'posted date', 'post date', 'booking date', 'fecha', 'fecha operacion', 'fecha contable', 'fecha de operacion', 'data'],
    desc: ['description', 'transaction description', 'payee', 'merchant', 'name', 'original description', 'concepto', 'descripcion', 'detalle', 'details', 'narrative', 'reference'],
    amount: ['amount', 'transaction amount', 'importe', 'monto', 'value', 'amount (eur)', 'amount (usd)'],
    debit: ['debit', 'debits', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'cargo', 'cargos', 'debe', 'importe cargo'],
    credit: ['credit', 'credits', 'deposit', 'deposits', 'money in', 'paid in', 'abono', 'abonos', 'haber', 'importe abono'],
    type: ['type', 'transaction type', 'tipo', 'details']
  };

  function findCol(headers, names, avoid) {
    var norm = headers.map(plain);
    for (var n = 0; n < names.length; n++) {
      for (var i = 0; i < norm.length; i++) {
        if (norm[i] === names[n] && !(avoid && avoid.indexOf(i) >= 0)) return i;
      }
    }
    return -1;
  }

  function looksLikeHeader(cells) {
    var h = cells.map(plain);
    var hasDate = SYN.date.some(function (n) { return h.indexOf(n) >= 0; });
    var hasMoney = SYN.amount.concat(SYN.debit, SYN.credit).some(function (n) { return h.indexOf(n) >= 0; });
    return hasDate && hasMoney;
  }

  var PRESETS = [
    { id: 'chase', name: 'Chase', needs: ['posting date', 'details', 'description', 'amount'], date: 'posting date' },
    { id: 'chase-card', name: 'Chase card', needs: ['transaction date', 'post date', 'category', 'amount'], date: 'transaction date' },
    { id: 'bofa', name: 'Bank of America', needs: ['date', 'description', 'running bal.'], date: 'date' },
    { id: 'bofa-card', name: 'Bank of America card', needs: ['posted date', 'reference number', 'payee', 'amount'], date: 'posted date' },
    { id: 'citi', name: 'Citi', needs: ['date', 'description', 'debit', 'credit'], date: 'date' },
    { id: 'capone-card', name: 'Capital One card', needs: ['transaction date', 'posted date', 'card no.', 'debit', 'credit'], date: 'transaction date' },
    { id: 'capone', name: 'Capital One 360', needs: ['transaction description', 'transaction date', 'transaction amount'], date: 'transaction date' },
    { id: 'bbva', name: 'BBVA', needs: ['fecha', 'concepto', 'importe'], date: 'fecha' },
    { id: 'wells', name: 'Wells Fargo', headerless: true }
  ];

  function presetFor(headers) {
    var norm = headers.map(plain);
    for (var i = 0; i < PRESETS.length; i++) {
      var p = PRESETS[i];
      if (p.needs && p.needs.every(function (n) { return norm.indexOf(n) >= 0; })) return p;
    }
    return null;
  }

  var MONTH_RE = '(ene|jan|feb|mar|abr|apr|may|jun|jul|ago|aug|sept|sep|set|oct|nov|dic|dec)[a-z]*';

  /** Reads a date cell. `order` is 'mdy' or 'dmy' for numeric dates such as 03/04/2026. */
  function parseDate(text, order) {
    var s = String(text || '').trim();
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return mk(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
    if (m) {
      var a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      return order === 'dmy' ? mk(y, b, a) : mk(y, a, b);
    }
    m = s.match(new RegExp('^(\\d{1,2})[ -]' + MONTH_RE + '\\.?,?[ -](\\d{2,4})', 'i'));
    if (m) { var yy = +m[3]; if (yy < 100) yy += 2000; return mk(yy, MONTHS[m[2].toLowerCase()], +m[1]); }
    m = s.match(new RegExp('^' + MONTH_RE + '\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})', 'i'));
    if (m) return mk(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    return null;
  }

  function mk(y, mo, d) {
    if (!mo || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(y, mo - 1, d, 12, 0, 0);
  }

  /** Looks at the date cells to decide between 03/04 meaning March 4 or 3 April. */
  function guessOrder(cells, fallback) {
    var mdy = 0, dmy = 0;
    cells.forEach(function (c) {
      var m = String(c).match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.]\d{2,4}/);
      if (!m) return;
      if (+m[1] > 12) dmy++;
      if (+m[2] > 12) mdy++;
    });
    if (dmy > mdy) return 'dmy';
    if (mdy > dmy) return 'mdy';
    return fallback;
  }

  /** Reads a money cell such as -1,234.56, 1.234,56, (12.00) or $12. Returns null if it is not a number. */
  function parseMoney(text, euro) {
    var s = String(text == null ? '' : text).trim();
    if (s === '') return null;
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[−–]/g, '-').replace(/[^\d.,\-+]/g, '');
    if (/^-/.test(s) || /-$/.test(s)) neg = !neg;
    s = s.replace(/[-+]/g, '');
    if (!/\d/.test(s)) return null;
    var lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    var decimal = null;
    if (lastDot >= 0 && lastComma >= 0) decimal = lastDot > lastComma ? '.' : ',';
    else if (lastComma >= 0) decimal = (euro || /,\d{1,2}$/.test(s)) && s.split(',').length === 2 ? ',' : null;
    else if (lastDot >= 0) decimal = (euro && /\.\d{3}$/.test(s) && s.split('.').length >= 2 && !/^0\./.test(s)) ? null : (s.split('.').length === 2 ? '.' : null);
    var digits = decimal ? s.replace(decimal === '.' ? /,/g : /\./g, '') : s.replace(/[.,]/g, '');
    if (decimal) digits = digits.replace(decimal, '.');
    var n = parseFloat(digits);
    if (isNaN(n)) return null;
    return neg ? -n : n;
  }

  var PREFIXES = [
    'purchase authorized on', 'recurring payment authorized on', 'pos debit', 'pos purchase', 'debit card purchase', 'checkcard',
    'check card purchase', 'card purchase', 'purchase', 'ach debit', 'online payment', 'payment to', 'withdrawal',
    'compra tarjeta', 'compra con tarjeta', 'compra en', 'pago con tarjeta', 'pago movil en', 'pago móvil en', 'tarjeta',
    'sq *', 'tst*', 'tst *', 'sp *', 'paypal *', 'pp*', 'amzn mktp'
  ];

  /** Tidies a bank description into a store name, and a key used to remember its category. */
  function cleanMerchant(raw) {
    var s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) return { key: 'unknown', name: 'Unknown' };
    var low = s.toLowerCase();
    if (low.indexOf('bizum') === 0) return analyze(s);
    for (var i = 0; i < 3; i++) {
      var cut = false;
      for (var p = 0; p < PREFIXES.length; p++) {
        if (low.indexOf(PREFIXES[p]) === 0) { s = s.slice(PREFIXES[p].length).trim(); low = s.toLowerCase(); cut = true; break; }
      }
      if (!cut) break;
    }
    s = s.replace(/\b\d{3}[-.]\d{3,4}(?:[-.]\d{4})?\b/g, ' ')
         .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
         .replace(/\bcard\s*\d{2,}\b/gi, ' ')
         .replace(/\b(xx+|\*+)\d{2,}\b/gi, ' ')
         .replace(/#\s*\d+/g, ' ')
         .replace(/\b\w*\d{4,}\w*\b/g, ' ')
         .replace(/\s+/g, ' ').trim();
    var comma = s.indexOf(',');
    if (comma > 3) s = s.slice(0, comma);
    s = s.replace(/\s+[A-Z]{2}$/, '').replace(/^[\s*\-:]+|[\s*\-:]+$/g, '').trim();
    if (!s) return { key: 'unknown', name: 'Unknown' };
    if (s.length > 40) s = s.slice(0, 40).trim();
    var name = s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s*\-\/])[a-z]/g, function (c) { return c.toUpperCase(); }) : s;
    return { key: s.toLowerCase().split(' ').slice(0, 3).join(' '), name: name };
  }

  /** Works out which columns hold what. Returns the guess plus the table pieces the UI needs. */
  function detectCsv(table, fileLang) {
    var rows = table.rows;
    var out = { delim: table.delim, headerIndex: -1, headers: [], preset: null, mapping: null, ready: false };
    var first = rows[0] || [];
    // Wells Fargo has no header row: date, amount, *, empty, description
    if (first.length >= 4 && parseDate(first[0], 'mdy') && parseMoney(first[1]) !== null && !looksLikeHeader(first)) {
      out.preset = PRESETS[PRESETS.length - 1];
      out.headerIndex = -1;
      out.headers = first.map(function (_, i) { return 'Column ' + (i + 1); });
      out.mapping = { date: 0, desc: first.length - 1, amount: 1, debit: -1, credit: -1, type: -1, order: 'mdy', spend: 'neg', euro: false };
      out.ready = true;
      return out;
    }
    var h = -1;
    for (var i = 0; i < Math.min(rows.length, 40); i++) { if (looksLikeHeader(rows[i])) { h = i; break; } }
    if (h < 0) {
      // Unknown layout: guess from the data itself. The person confirms on the next screen.
      var order0 = fileLang === 'es' ? 'dmy' : 'mdy';
      var euro0 = table.delim === ';';
      var hasHeader = rows.length > 1 && !first.some(function (c) { return parseDate(c, 'mdy') || parseDate(c, 'dmy'); }) && !first.some(function (c) { return parseMoney(c, euro0) !== null && /\d/.test(c) && c.length < 14 && /^[\d.,\-+\s$€£()]+$/.test(c); });
      var start0 = hasHeader ? 1 : 0;
      var body = rows.slice(start0, start0 + 60);
      var width = Math.max.apply(null, rows.slice(0, 20).map(function (r) { return r.length; }));
      var dateCol = -1, numCols = [], descCol = -1, bestLen = 0;
      for (var c = 0; c < width; c++) {
        var cells = body.map(function (r) { return r[c] || ''; }).filter(function (v) { return v !== ''; });
        if (!cells.length) continue;
        var dates = cells.filter(function (v) { return parseDate(v, 'mdy') || parseDate(v, 'dmy'); }).length;
        var nums = cells.filter(function (v) { return /^[\d.,\-+\s$€£()\u2212]+$/.test(v) && parseMoney(v, euro0) !== null; }).length;
        if (dates >= cells.length * 0.8 && dateCol < 0) dateCol = c;
        else if (nums >= cells.length * 0.8) numCols.push(c);
        else {
          var avg = cells.reduce(function (sum, v) { return sum + v.length; }, 0) / cells.length;
          if (avg > bestLen) { bestLen = avg; descCol = c; }
        }
      }
      out.headers = hasHeader ? first.slice() : first.map(function (_, i) { return 'Column ' + (i + 1); });
      while (out.headers.length < width) out.headers.push('Column ' + (out.headers.length + 1));
      out.headerIndex = hasHeader ? 0 : -1;
      var amt0 = -1, deb0 = -1, cred0 = -1;
      if (numCols.length === 1) amt0 = numCols[0];
      else if (numCols.length >= 2) { deb0 = numCols[0]; cred0 = numCols[1]; }
      var order1 = guessOrder(body.map(function (r) { return r[dateCol] || ''; }), order0);
      out.mapping = { date: dateCol, desc: descCol, amount: amt0, debit: deb0, credit: cred0, type: -1, order: order1, spend: 'neg', euro: euro0 };
      return out;
    }
    var headers = rows[h];
    out.headerIndex = h;
    out.headers = headers;
    var preset = presetFor(headers);
    out.preset = preset;
    var date = preset && preset.date ? findCol(headers, [preset.date]) : -1;
    if (date < 0) date = findCol(headers, SYN.date);
    var desc = findCol(headers, ['description', 'transaction description', 'payee', 'merchant', 'concepto', 'descripcion', 'detalle', 'name', 'original description', 'narrative']);
    if (desc < 0) desc = findCol(headers, SYN.desc);
    var amount = findCol(headers, SYN.amount);
    var debit = findCol(headers, SYN.debit);
    var credit = findCol(headers, SYN.credit);
    var typeCol = findCol(headers, ['transaction type', 'tipo'], [desc]);
    if (amount >= 0 && debit >= 0 && credit >= 0) amount = -1; // two-column files win
    var sample = rows.slice(h + 1, h + 200);
    var order = guessOrder(sample.map(function (r) { return r[date] || ''; }), (preset && preset.id === 'bbva') || fileLang === 'es' ? 'dmy' : 'mdy');
    var euro = table.delim === ';' || (preset && preset.id === 'bbva');
    var spend = 'neg';
    if (amount >= 0) {
      var neg = 0, pos = 0;
      sample.forEach(function (r) { var v = parseMoney(r[amount], euro); if (v === null || v === 0) return; if (v < 0) neg++; else pos++; });
      if (typeCol >= 0 && neg === 0) spend = 'type';
      else if (pos > neg) spend = 'pos';
    }
    out.mapping = { date: date, desc: desc, amount: amount, debit: debit, credit: credit, type: typeCol, order: order, spend: spend, euro: euro };
    out.ready = date >= 0 && desc >= 0 && (amount >= 0 || debit >= 0 || credit >= 0);
    return out;
  }

  /** Builds the same kind of result as the PDF reader, from a table and a column mapping. */
  function parseCsv(table, detected) {
    var m = detected.mapping;
    var result = { transactions: [], skippedIncoming: 0, unreadable: [], sample: '' };
    var rows = table.rows.slice(detected.headerIndex + 1);
    var seen = {};
    rows.forEach(function (r) {
      var date = m.date >= 0 ? parseDate(r[m.date], m.order) : null;
      if (!date) return; // preamble, totals and blank lines
      var desc = m.desc >= 0 ? r[m.desc] : '';
      var spend = null; // positive number when money left the account
      var any = false;
      if (m.amount >= 0) {
        var v = parseMoney(r[m.amount], m.euro);
        if (v === null) { if (String(r[m.amount] || '').trim() !== '') result.unreadable.push((desc || '').slice(0, 70)); return; }
        any = true;
        if (v === 0) return;
        if (m.spend === 'type') {
          var t = plain(r[m.type] || '');
          if (/debit|withdraw|purchase|cargo|sale/.test(t) && !/credit/.test(t)) spend = Math.abs(v);
          else if (/credit|deposit|abono|payment/.test(t)) spend = -Math.abs(v);
          else spend = v < 0 ? -v : null;
        } else if (m.spend === 'pos') spend = v > 0 ? v : -Math.abs(v);
        else spend = v < 0 ? -v : -Math.abs(v);
      } else {
        var d = m.debit >= 0 ? parseMoney(r[m.debit], m.euro) : null;
        var c = m.credit >= 0 ? parseMoney(r[m.credit], m.euro) : null;
        if (d !== null && d !== 0) { spend = Math.abs(d); any = true; }
        else if (c !== null && c !== 0) { spend = -Math.abs(c); any = true; }
        else if (d === null && c === null) { result.unreadable.push((desc || '').slice(0, 70)); return; }
        else return;
      }
      if (!any || spend === null) return;
      if (spend <= 0) { result.skippedIncoming += 1; return; }
      var info = cleanMerchant(desc);
      var cents = Math.round(spend * 100);
      var day = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
      var base = 'csv|' + day + '|' + cents + '|' + info.key;
      seen[base] = (seen[base] || 0) + 1;
      result.transactions.push({ date: date, amount: spend, merchantKey: info.key, name: info.name, fingerprint: base + '|' + seen[base] });
    });
    result.transactions.sort(function (a, b) { return a.date - b.date; });
    result.sample = table.rows.slice(0, 8).map(function (r) { return r.join(table.delim); }).join('\n').slice(0, 1200);
    return result;
  }

  /** A few parsed rows for the column-matching screen. */
  function previewCsv(table, detected, limit) {
    var m = detected.mapping;
    var rows = table.rows.slice(detected.headerIndex + 1);
    var out = [];
    for (var i = 0; i < rows.length && out.length < (limit || 4); i++) {
      var r = rows[i];
      var date = m.date >= 0 ? parseDate(r[m.date], m.order) : null;
      if (!date) continue;
      out.push({ date: date, desc: m.desc >= 0 ? r[m.desc] : '', raw: m.amount >= 0 ? r[m.amount] : [m.debit >= 0 ? r[m.debit] : '', m.credit >= 0 ? r[m.credit] : ''].join(' / ') });
    }
    return out;
  }

  window.BankImport = {
    readPdf: readPdf, parse: parse, starterSuggestion: starterSuggestion,
    decodeText: decodeText, csvTable: csvTable, detectCsv: detectCsv, parseCsv: parseCsv, previewCsv: previewCsv,
    parseMoney: parseMoney, parseDate: parseDate, cleanMerchant: cleanMerchant
  };
})();
