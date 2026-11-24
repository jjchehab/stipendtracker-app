/* StipendTracker: English / Spanish. English is the source text; Spanish is looked up by the exact English string. */
(function () {
  'use strict';

  var KEY = 'stipendtracker.lang';
  var lang = 'en';
  try {
    if (window.localStorage.getItem(KEY) === 'es') lang = 'es';
  } catch (e) { lang = 'en'; }

  // Default category names, so a fresh Spanish setup starts with Spanish names.
  var CATS = {
    'Groceries': 'Supermercado',
    'Fun (drinks, etc.)': 'Salidas (copas, etc.)',
    'Hobbies & Entertainment': 'Aficiones y entretenimiento',
    'Household Supplies': 'Artículos del hogar',
    'Housing (rent/utilities)': 'Vivienda (alquiler/suministros)',
    'Local Transit': 'Transporte local',
    'Personal Care': 'Cuidado personal',
    'Restaurants': 'Restaurantes',
    'Travel': 'Viajes',
    'Savings': 'Ahorros',
    'Other': 'Otros'
  };
  var CATS_BACK = {};
  Object.keys(CATS).forEach(function (k) { CATS_BACK[CATS[k]] = k; });

  var ES = {
    // sidebar and headings
    'Home': 'Inicio',
    'Budget History': 'Historial de presupuestos',
    'Spending by Category': 'Gastos por categoría',
    'Spending by category': 'Gastos por categoría',
    'Current month': 'Mes actual',
    'All months': 'Todos los meses',
    'Click a month to see its categories.': 'Haz clic en un mes para ver sus categorías.',
    '‹ Budget History': '‹ Historial de presupuestos',
    'Month': 'Mes',
    'Menu': 'Menú',

    // new entry
    'New entry': 'Nuevo gasto',
    'Category': 'Categoría',
    'Amount': 'Importe',
    'Date': 'Fecha',
    'What was it? (optional)': '¿Qué fue? (opcional)',
    'e.g. Coffee with Ana': 'p. ej. Café con Ana',
    'Enter': 'Añadir',
    'Undo last entry': 'Deshacer último gasto',
    'Currency of this entry': 'Moneda de este gasto',
    'Looking up the exchange rate…': 'Buscando el tipo de cambio…',
    'No exchange rate is saved yet. Connect to the internet once, then try again.': 'Todavía no hay ningún tipo de cambio guardado. Conéctate a internet una vez y vuelve a intentarlo.',
    'Converting…': 'Convirtiendo…',

    // month table
    'This month at a glance': 'Este mes de un vistazo',
    'Category breakdown': 'Desglose por categoría',
    'Finished month, compared with each full monthly budget as it was set that month.': 'Mes terminado, comparado con cada presupuesto mensual completo tal como estaba ese mes.',
    'The white mark on each bar shows where you should be by today.': 'La marca blanca de cada barra muestra dónde deberías estar hoy.',
    'Spent': 'Gastado',
    'Budget': 'Presupuesto',
    'Left': 'Queda',
    'Pace': 'Ritmo',
    'Status': 'Estado',
    'Total': 'Total',
    'On pace': 'Buen ritmo',
    'A little high': 'Algo alto',
    'A little over': 'Algo pasado',
    'Way over': 'Muy pasado',
    'Surplus / deficit': 'Superávit / déficit',
    'In progress': 'En curso',

    // ring
    'Where the money went': 'Adónde fue el dinero',
    'Each slice is a category\'s share of what you spent. A slice turns yellow when that category ran a little over and red when it went way over its budget. Hover over a category to highlight it.': 'Cada porción es la parte de tu gasto que corresponde a una categoría. Una porción se pone amarilla si esa categoría se pasó un poco y roja si se pasó mucho de su presupuesto. Pasa el cursor por una categoría para resaltarla.',
    'Nothing spent': 'Sin gastos',
    'No spending was logged in this month.': 'No se registró ningún gasto este mes.',

    // baller
    'Surplus from finished months,': 'Sobrante de meses terminados,',
    'plus funds you add.': 'más los fondos que añadas.',
    'Manage': 'Gestionar',
    'Budget Crisis': 'Crisis de presupuesto',
    'Starting balance': 'Saldo inicial',
    'Surplus from finished months': 'Sobrante de meses terminados',
    'Funds you added': 'Fondos que añadiste',
    'Spent from the Baller Budget': 'Gastado del Baller Budget',
    'Balance': 'Saldo',
    'What': 'Qué',
    'Name': 'Nombre',
    'Delete': 'Eliminar',
    'Nothing logged here yet.': 'Aquí todavía no hay nada registrado.',
    'No funds added or spending yet.': 'Todavía no hay fondos añadidos ni gastos.',
    'Add funds': 'Añadir fondos',
    'Funds added': 'Fondos añadidos',
    'No funds added yet.': 'Todavía no has añadido fondos.',
    'Done': 'Listo',

    // settings
    'Settings': 'Ajustes',
    'Categories and monthly budgets': 'Categorías y presupuestos mensuales',
    'Budget changes apply from this month onward. Past months keep the budgets they had. Turn on "Fixed bill" for something you pay in one go, like rent. Renaming a category renames it in your past entries too.': 'Los cambios de presupuesto se aplican desde este mes en adelante. Los meses pasados conservan los presupuestos que tenían. Activa «Factura fija» para algo que pagas de una sola vez, como el alquiler. Si cambias el nombre de una categoría, también cambia en tus gastos anteriores.',
    'Fixed bill': 'Factura fija',
    'Archive': 'Archivar',
    'Add a category': 'Añadir una categoría',
    'Add': 'Añadir',
    'Archived categories': 'Categorías archivadas',
    'Archived categories are hidden from now on. Their past spending stays in your history.': 'Las categorías archivadas se ocultan a partir de ahora. Sus gastos anteriores se quedan en tu historial.',
    'Restore': 'Restaurar',
    'None.': 'Ninguna.',
    'Currency': 'Moneda',
    'Your budgets are in this currency. When you log an entry in the other one, it is converted at that day\'s exchange rate.': 'Tus presupuestos están en esta moneda. Cuando registras un gasto en la otra, se convierte con el tipo de cambio de ese día.',
    '€ Euro': '€ Euro',
    '$ Dollar': '$ Dólar',
    'Language': 'Idioma',
    'Backup': 'Copia de seguridad',
    'Your data lives only on this device. Save a backup file now and then, and keep it somewhere safe.': 'Tus datos viven solo en este dispositivo. Guarda un archivo de copia de seguridad de vez en cuando y consérvalo en un lugar seguro.',
    'Save backup file': 'Guardar copia de seguridad',
    'Restore from backup…': 'Restaurar desde una copia…',
    'Replace all your current data with this backup?': '¿Reemplazar todos tus datos actuales con esta copia de seguridad?',
    'Replace': 'Reemplazar',
    'Cancel': 'Cancelar',
    'That file doesn\'t look like a StipendTracker backup.': 'Ese archivo no parece una copia de seguridad de StipendTracker.',
    'Reset': 'Restablecer',
    'Reset everything?': '¿Restablecerlo todo?',
    'This deletes every entry, deposit and budget and takes you back to the setup screen. It can\'t be undone.': 'Esto elimina todos los gastos, depósitos y presupuestos y te lleva de vuelta a la pantalla de configuración. No se puede deshacer.',
    'Deletes all your data and starts again from the setup screen.': 'Elimina todos tus datos y empieza de nuevo desde la pantalla de configuración.',
    'Reset all data…': 'Restablecer todos los datos…',
    'Install and use offline': 'Instalar y usar sin conexión',
    'Installing puts StipendTracker on your home screen or desktop. It then opens like a normal app and works with no internet. On an iPhone, installing also stops Safari from clearing your data after a week of not using it. On iPhone: tap the Share button in Safari, then "Add to Home Screen". On Android or a computer, use the button below if it appears, or your browser\'s "Install app" menu item.': 'Al instalarla, StipendTracker aparece en la pantalla de inicio o en el escritorio. Se abre como una app normal y funciona sin internet. En un iPhone, instalarla también evita que Safari borre tus datos si pasas una semana sin usarla. En iPhone: toca el botón Compartir de Safari y luego «Añadir a pantalla de inicio». En Android o en un ordenador, usa el botón de abajo si aparece, o la opción «Instalar app» del menú de tu navegador.',
    'Install app': 'Instalar app',
    'This browser is not letting the page save your data, so it will be lost when you close it. Open the app in Google Chrome or the desktop app instead.': 'Este navegador no deja que la página guarde tus datos, así que se perderán al cerrarla. Abre la app en Google Chrome o en la app de escritorio.',

    // PDF import
    'Import PDF': 'Importar PDF',
    'Undo import': 'Deshacer importación',
    'Review import': 'Revisar importación',
    'Select all': 'Seleccionar todo',
    'Select none': 'No seleccionar nada',
    'Changed your mind about a store? Pick its new category and tick Remember.': '¿Has cambiado de idea sobre una tienda? Elige su nueva categoría y marca Recordar.',
    'Remember all': 'Recordar todo',
    'Remember none': 'No recordar nada',
    'Remember': 'Recordar',
    'Close': 'Cerrar',
    'I couldn\'t find any purchases in this PDF.': 'No he encontrado ninguna compra en este PDF.',
    'Here is the text the app could read. If you copy it (check for personal details first) or screenshot it and send it to me, I can fix the reader.': 'Este es el texto que la app pudo leer. Si lo copias (revisa antes que no tenga datos personales) o le haces una captura y me la envías, puedo arreglar el lector.',
    'Already imported': 'Ya importado',
    'Before your start date': 'Anterior a tu fecha de inicio',

    // setup
    'Category name': 'Nombre de la categoría',
    'Remove': 'Quitar',
    'Let\'s set up your budget. You can change all of this later in Settings.': 'Vamos a configurar tu presupuesto. Puedes cambiar todo esto más adelante en Ajustes.',
    'Starting Baller Budget': 'Baller Budget inicial',
    'Savings you already have to spend freely. Leave it at 0 if you\'re starting fresh.': 'Ahorros que ya tienes para gastar con libertad. Déjalo en 0 si empiezas de cero.',
    'Type a monthly budget for each category. Turn on "Fixed bill" for something you pay in one go, like rent.': 'Escribe un presupuesto mensual para cada categoría. Activa «Factura fija» para algo que pagas de una sola vez, como el alquiler.',
    'Total monthly budget': 'Presupuesto mensual total',
    'Add category': 'Añadir categoría',
    'Start tracking': 'Empezar a registrar',

    // messages and templates ({name} style values are filled in by the app)
    'Type an amount first.': 'Escribe primero un importe.',
    'Nothing to undo.': 'No hay nada que deshacer.',
    'Removed {amount} from {category}{suffix}.': 'Se quitaron {amount} de {category}{suffix}.',
    'Added {shown} to {category}{suffix}.': 'Añadido {shown} a {category}{suffix}.',
    'Spent {shown}{suffix} from the Baller Budget. Balance: {balance}.': 'Gastado {shown}{suffix} del Baller Budget. Saldo: {balance}.',
    ' Heads up: that\'s a little high for this point in the month.': ' Ojo: es un poco alto para este punto del mes.',
    ' Warning: that\'s way over where you should be.': ' Aviso: te has pasado bastante de dónde deberías estar.',
    'That amount is too small to convert.': 'Ese importe es demasiado pequeño para convertirlo.',
    'Couldn\'t get an exchange rate. Connect to the internet once and try again, or switch back to {main}.': 'No se pudo obtener el tipo de cambio. Conéctate a internet una vez e inténtalo de nuevo, o vuelve a {main}.',
    'Added {amount}.': 'Añadido {amount}.',
    'Added {name}.': 'Categoría añadida: {name}.',
    'Check the budget amount.': 'Revisa el importe del presupuesto.',
    'That name is empty or already used.': 'Ese nombre está vacío o ya se usa.',
    'Import undone. Stores you chose to remember are still remembered.': 'Importación deshecha. Las tiendas que elegiste recordar se siguen recordando.',
    'Couldn\'t read that PDF: it has no readable text. Download the movements PDF from the Santander app and try again.': 'No se pudo leer ese PDF: no tiene texto legible. Descarga el PDF de movimientos desde la app de Santander e inténtalo de nuevo.',
    'Couldn\'t read that PDF. Is it the movements file from Santander?': 'No se pudo leer ese PDF. ¿Es el archivo de movimientos de Santander?',
    'Offline: using the saved rate from {date} ({line}).': 'Sin conexión: usando el tipo guardado del {date} ({line}).',
    'rate from {date}': 'tipo del {date}',
    'adds {amount}': 'suma {amount}',
    'First days of the month: pace warnings start on day {day}. Until then, only going over a full budget is flagged.': 'Primeros días del mes: los avisos de ritmo empiezan el día {day}. Hasta entonces, solo se avisa si te pasas de un presupuesto completo.',
    'In progress: {spent} spent of {budget}': 'En curso: {spent} gastados de {budget}',
    '{spent} spent of {budget}, surplus {amount}': '{spent} gastados de {budget}, superávit de {amount}',
    '{spent} spent of {budget}, deficit {amount}': '{spent} gastados de {budget}, déficit de {amount}',
    'This month: {spent} of {budget}': 'Este mes: {spent} de {budget}',
    'Balance: {amount}': 'Saldo: {amount}',
    '{orig} at {rate}': '{orig} a {rate}',
    '{name} (archived)': '{name} (archivada)',
    'Spent from Baller Budget': 'Gastado del Baller Budget',
    'Amount ({currency})': 'Importe ({currency})',
    '{n} purchase found in {file}': '{n} compra encontrada en {file}',
    '{n} purchases found in {file}': '{n} compras encontradas en {file}',
    '{n} incoming payment skipped': '{n} ingreso omitido',
    '{n} incoming payments skipped': '{n} ingresos omitidos',
    '{n} line couldn\'t be read and was left out:': 'No se pudo leer {n} línea y se dejó fuera:',
    '{n} lines couldn\'t be read and were left out:': 'No se pudieron leer {n} líneas y se dejaron fuera:',
    '{n} selected': '{n} seleccionadas',
    'Import {n}': 'Importar {n}',
    'Imported {n} entry totaling {total}.': 'Se importó {n} gasto por un total de {total}.',
    'Imported {n} entries totaling {total}.': 'Se importaron {n} gastos por un total de {total}.',
    'Every category needs a name.': 'Todas las categorías necesitan un nombre.',
    '"Baller Budget" is already built in. Pick another name.': '«Baller Budget» ya viene incluido. Elige otro nombre.',
    'Two categories are named "{name}".': 'Hay dos categorías llamadas «{name}».',
    'Check the budget for {name}.': 'Revisa el presupuesto de {name}.',
    'Add at least one category.': 'Añade al menos una categoría.',
    'Check the starting Baller Budget.': 'Revisa el Baller Budget inicial.'
  };

  function t(key, vars) {
    var s = key;
    if (lang === 'es' && ES[key] !== undefined) s = ES[key];
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? String(vars[k]) : m; });
    }
    return s;
  }

  function loc() { return lang === 'es' ? 'es-ES' : 'en-US'; }

  /** A default category name in the current language (anything else is left alone). */
  function catName(name) {
    if (lang === 'es') return CATS[name] !== undefined ? CATS[name] : name;
    return CATS_BACK[name] !== undefined ? CATS_BACK[name] : name;
  }

  var SKIP = /^(SCRIPT|STYLE|OPTION|TEXTAREA|INPUT)$/;

  function marked(el) {
    while (el) {
      if (el.getAttribute && el.getAttribute('translate') === 'no') return true;
      el = el.parentNode;
    }
    return false;
  }

  function skipped(el) {
    while (el) {
      if (SKIP.test(el.nodeName)) return true;
      el = el.parentNode;
    }
    return marked(el);
  }

  /** Swap English text for Spanish inside an element that was just drawn. */
  function apply(root) {
    if (lang !== 'es' || !root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var raw = node.nodeValue;
      var trimmed = raw.trim();
      if (!trimmed) return;
      var tr = ES[trimmed];
      if (tr === undefined || skipped(node.parentNode) || marked(node.parentNode)) return;
      node.nodeValue = raw.replace(trimmed, function () { return tr; });
    });
    ['placeholder', 'aria-label', 'title', 'data-label'].forEach(function (attr) {
      root.querySelectorAll('[' + attr + ']').forEach(function (el) {
        var v = el.getAttribute(attr);
        var tr = ES[v];
        if (tr !== undefined && !marked(el)) el.setAttribute(attr, tr);
      });
    });
  }

  function setLang(next) {
    lang = next === 'es' ? 'es' : 'en';
    try { window.localStorage.setItem(KEY, lang); } catch (e) { /* fine */ }
    document.documentElement.lang = lang;
  }

  document.documentElement.lang = lang;

  window.I18N = {
    t: t,
    apply: apply,
    loc: loc,
    catName: catName,
    setLang: setLang,
    lang: function () { return lang; },
    CATS: CATS
  };
})();
