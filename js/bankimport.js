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
      if (options.indexOf(table[i][0]) < 0) continue;
      for (var j = 0; j < table[i][1].length; j++) {
        if (key.indexOf(table[i][1][j]) >= 0) return table[i][0];
      }
    }
    return null;
  }

  window.BankImport = { readPdf: readPdf, parse: parse, starterSuggestion: starterSuggestion };
})();
