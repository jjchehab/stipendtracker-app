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
    'Your budgets are in this currency. When you log an entry in a different one, it is converted at that day\'s exchange rate.': 'Tus presupuestos están en esta moneda. Cuando registras un gasto en otra distinta, se convierte con el tipo de cambio de ese día.',
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
    'I couldn\'t recognise this bank\'s file, so tell me which column is which.': 'No he reconocido el archivo de este banco, así que dime qué columna es cada cosa.',
    'Import accepts Santander PDFs and CSV files from any bank.': 'Se aceptan PDF de Santander y archivos CSV de cualquier banco.',
    'Amounts in this file are in': 'Los importes de este archivo están en',
    'Each purchase is converted to {currency} using the exchange rate from its own date when you import.': 'Al importar, cada compra se convierte a {currency} con el tipo de cambio de su propia fecha.',
    'Couldn\'t get exchange rates. Connect to the internet and try again.': 'No he podido obtener los tipos de cambio. Conéctate a internet e inténtalo de nuevo.',
    'Some rates came from the newest saved day because you were offline.': 'Algunos tipos de cambio son del último día guardado porque estabas sin conexión.',
    'Import bank file': 'Importar archivo del banco',
    'Read as {bank}.': 'Leído como {bank}.',
    'Columns matched automatically.': 'Columnas reconocidas automáticamente.',
    'Amounts are read as {currency}.': 'Los importes se leen como {currency}.',
    'Adjust columns': 'Ajustar columnas',
    'I couldn\'t find any purchases in this file.': 'No he encontrado ninguna compra en este archivo.',
    'Check that the columns are matched correctly, and that purchases are the right sign (negative or positive).': 'Comprueba que las columnas estén bien asignadas y que las compras tengan el signo correcto (negativo o positivo).',
    'Excel files can\'t be read directly. Open it in Excel or Numbers, choose File → Save As (or Export) → CSV, and import that file.': 'Los archivos de Excel no se pueden leer directamente. Ábrelo en Excel o Numbers, elige Archivo → Guardar como (o Exportar) → CSV e importa ese archivo.',
    'Couldn\'t read that file. Is it a CSV with your transactions?': 'No he podido leer ese archivo. ¿Es un CSV con tus movimientos?',
    'Match the columns': 'Asigna las columnas',
    'I couldn\'t recognise this bank\'s file, so tell me which column is which. Amounts are read as {currency}.': 'No he reconocido el archivo de este banco, así que dime qué columna es cada cosa. Los importes se leen como {currency}.',
    'Description': 'Descripción',
    'Amounts are in': 'Los importes están en',
    'One column': 'Una columna',
    'Two columns (money out / money in)': 'Dos columnas (salidas / entradas)',
    'Money out': 'Salidas',
    'Money in': 'Entradas',
    'Purchases show up as': 'Las compras aparecen como',
    'Negative numbers (−12.50)': 'Números negativos (−12,50)',
    'Positive numbers (12.50)': 'Números positivos (12,50)',
    'Decided by the Type column': 'Según la columna Tipo',
    'Dates are written as': 'Las fechas están escritas como',
    'Month / Day / Year': 'Mes / Día / Año',
    'Day / Month / Year': 'Día / Mes / Año',
    'No rows could be read with these settings.': 'No se ha podido leer ninguna fila con estos ajustes.',
    'Continue': 'Continuar',
    'This month': 'Este mes',
    '{range} · day {n} of {total}': '{range} · día {n} de {total}',
    'Vs. your usual': 'Frente a lo habitual',
    'This month\'s spending in each category compared with your average at this point.': 'El gasto de este mes en cada categoría comparado con tu media en este punto.',
    'Projected total for this month': 'Total previsto para este mes',
    'Hover over or tap a bar to see the split.': 'Pasa el ratón o toca una barra para ver el desglose.',
    'Under budget': 'Dentro del presupuesto',
    'Slightly over': 'Algo por encima',
    '(so far)': '(hasta hoy)',
    'Projected total: {amount}': 'Total previsto: {amount}',
    'from your pace': 'según tu ritmo',
    'from your average': 'según tu media',
    'Pace this month': 'Ritmo de este mes',
    'Your usual pace': 'Tu ritmo habitual',
    'Projected {amount}': 'Previsto {amount}',
    'Today · {amount}': 'Hoy · {amount}',
    'Right on your usual pace': 'Justo en tu ritmo habitual',
    '{amount} below your usual pace': '{amount} por debajo de tu ritmo habitual',
    '{amount} above your usual pace': '{amount} por encima de tu ritmo habitual',
    'Your usual pace appears after two finished periods.': 'Tu ritmo habitual aparece tras dos periodos terminados.',
    'Safe to spend per day': 'Gasto seguro por día',
    'You are over budget this period.': 'Te has pasado del presupuesto en este periodo.',
    '/ day': '/ día',
    '{amount} left for the next day': '{amount} disponibles para el próximo día',
    '{amount} left for the next {n} days': '{amount} disponibles para los próximos {n} días',
    '{spent} of {budget} spent': '{spent} de {budget} gastados',
    '{amount} of fixed bills still to pay': '{amount} de gastos fijos aún por pagar',
    'no fixed bills left to pay this period': 'no quedan gastos fijos por pagar en este periodo',
    'Streaks': 'Rachas',
    'Streaks start counting after your first finished period.': 'Las rachas empiezan a contar tras tu primer periodo terminado.',
    'period in a row under budget': 'periodo seguido dentro del presupuesto',
    'periods in a row under budget': 'periodos seguidos dentro del presupuesto',
    'No streak yet': 'Aún no hay racha',
    'Finish this period under {budget} to make it {n}.': 'Termina este periodo por debajo de {budget} para llegar a {n}.',
    'Finish this period under {budget} to start a streak.': 'Termina este periodo por debajo de {budget} para empezar una racha.',
    'Finish a period under budget to start a streak.': 'Termina un periodo dentro del presupuesto para empezar una racha.',
    'Best streak: {n}': 'Mejor racha: {n}',
    'Under budget: {a} of {b} periods': 'Dentro del presupuesto: {a} de {b} periodos',
    'Category streaks': 'Rachas por categoría',
    '{n} on budget': '{n} en presupuesto',
    '{n} periods under': '{n} periodos por debajo',
    'Budget check-up': 'Revisión de presupuesto',
    'Categories whose budget may need a second look, based on your last few periods.': 'Categorías cuyo presupuesto quizá merezca otra mirada, según tus últimos periodos.',
    'The check-up unlocks after {n} more finished period.': 'La revisión se activa tras {n} periodo terminado más.',
    'The check-up unlocks after {n} more finished periods.': 'La revisión se activa tras {n} periodos terminados más.',
    'Nothing stands out. Your budgets look about right.': 'Nada destaca. Tus presupuestos parecen bien ajustados.',
    'Running high': 'Gasto alto',
    'Could lower': 'Se puede bajar',
    'Right-sized': 'Bien ajustado',
    'Under budget {n} periods in a row, averaging {avg} of {budget}. Maybe trim it to {suggest}?': 'Dentro del presupuesto {n} periodos seguidos, con una media de {avg} de {budget}. ¿Quizá lo reduces a {suggest}?',
    'Over budget in {over} of the last {n} periods, averaging {avg} vs {budget}.': 'Por encima del presupuesto en {over} de los últimos {n} periodos, con una media de {avg} frente a {budget}.',
    'Within {pct}% of budget every period. No changes needed.': 'A menos de un {pct}% del presupuesto en cada periodo. No hace falta cambiar nada.',
    'Committed vs. free': 'Comprometido y libre',
    'Nothing is committed yet. Mark a category as a Fixed bill or add a recurring entry in Settings, and it will show up here.': 'Aún no hay nada comprometido. Marca una categoría como gasto fijo o añade un gasto recurrente en Ajustes y aparecerá aquí.',
    'How much of your {budget} budget is already spoken for.': 'Cuánto de tu presupuesto de {budget} ya está comprometido.',
    '{amount} committed · {pct}%': '{amount} comprometidos · {pct}%',
    '{amount} free · {pct}%': '{amount} libres · {pct}%',
    'fixed bill': 'gasto fijo',
    'last day': 'último día',
    'day {n}': 'día {n}',
    'recurring': 'recurrente',
    'Spending calendar': 'Calendario de gastos',
    'Busiest day': 'Día más cargado',
    'Quiet days': 'Días tranquilos',
    '{n} of {m} with no spending': '{n} de {m} sin gastos',
    'Average on a spending day': 'Media en un día con gasto',
    'Light day': 'Día ligero',
    'Heavy day': 'Día fuerte',
    'Colours compare each day with your daily allowance (about {amount}). Fixed bills, recurring entries and savings are not shaded.': 'Los colores comparan cada día con tu asignación diaria (unos {amount}). Los gastos fijos, los recurrentes y los ahorros no se colorean.',
    'Baller Budget over time': 'Baller Budget a lo largo del tiempo',
    'Your savings buffer at the end of each period': 'Tu colchón de ahorro al final de cada periodo',
    'Now': 'Ahora',
    'This graph appears after your first finished period.': 'Este gráfico aparece tras tu primer periodo terminado.',
    'Biggest purchases this month': 'Mayores compras de este mes',
    'Fixed bills, recurring entries and savings are not included.': 'No se incluyen gastos fijos, recurrentes ni ahorros.',
    'Trends': 'Tendencias',
    'Spending over time': 'Gasto a lo largo del tiempo',
    'How your spending changes from one period to the next.': 'Cómo cambia tu gasto de un periodo al siguiente.',
    'This period vs your average': 'Este periodo frente a tu media',
    'Trends need at least two finished periods to compare. Check back once you have finished a couple of periods.': 'Las tendencias necesitan al menos dos periodos terminados para comparar. Vuelve cuando hayas terminado un par de periodos.',
    'Compared with what you had spent by this same day in your {n} finished periods, on average.': 'Comparado con lo que habías gastado hasta este mismo día en tus {n} periodos terminados, de media.',
    'Overall, spending is {cur} so far. There is nothing in your past periods to compare with.': 'En total llevas gastado {cur}. No hay nada en tus periodos pasados con lo que comparar.',
    'Overall, spending is right on your average by this day ({cur} vs {avg}).': 'En total, tu gasto está justo en tu media para este día ({cur} frente a {avg}).',
    'Overall, spending is up {pct}% vs your average by this day ({cur} vs {avg}).': 'En total, tu gasto está un {pct}% por encima de tu media para este día ({cur} frente a {avg}).',
    'Overall, spending is down {pct}% vs your average by this day ({cur} vs {avg}).': 'En total, tu gasto está un {pct}% por debajo de tu media para este día ({cur} frente a {avg}).',
    'Biggest increase': 'Mayor subida',
    'Biggest decrease': 'Mayor bajada',
    '{name}: up {pct}% ({cur} vs {avg})': '{name}: sube un {pct}% ({cur} frente a {avg})',
    '{name}: down {pct}% ({cur} vs {avg})': '{name}: baja un {pct}% ({cur} frente a {avg})',
    'New': 'Nuevo',
    'Spending in {name} is new: nothing in your past periods.': 'El gasto en {name} es nuevo: no había nada en tus periodos anteriores.',
    'Spending in {name} is right on your average.': 'El gasto en {name} está justo en tu media.',
    'Spending in {name} is up {pct}% this period compared with your average.': 'El gasto en {name} está un {pct}% por encima de tu media en este periodo.',
    'Spending in {name} is down {pct}% this period compared with your average.': 'El gasto en {name} está un {pct}% por debajo de tu media en este periodo.',
    '{cur} so far, average {avg}': '{cur} hasta ahora, media {avg}',
    'Early in a period the numbers can swing a lot, so read them with a pinch of salt.': 'Al principio de un periodo las cifras pueden variar mucho, así que tómalas con cautela.',
    'No spending yet. Add some entries and your chart will appear here.': 'Aún no hay gastos. Añade algunos y tu gráfico aparecerá aquí.',
    'Total spent per period': 'Gasto total por periodo',
    'Each bar is one pay period, split by category. Hover over or tap a bar to see the split. The dashed bar is the period in progress.': 'Cada barra es un periodo de pago, dividido por categorías. Pasa el cursor o toca una barra para ver el reparto. La barra de trazos es el periodo en curso.',
    'Finished': 'Terminado',
    'Last day of each month': 'Último día de cada mes',
    'Day {n} of each month': 'Día {n} de cada mes',
    'Next: {date}': 'Próximo: {date}',
    'Nothing recurring yet.': 'Aún no hay gastos recurrentes.',
    'Recurring entries': 'Gastos recurrentes',
    'Things you pay every month, like rent or a subscription. They are added for you automatically on their day, and if you did not open the app for a while, the missed ones are added when you come back.': 'Cosas que pagas cada mes, como el alquiler o una suscripción. Se añaden solas en su día, y si no abriste la app durante un tiempo, las que faltan se añaden cuando vuelves.',
    'Name (optional)': 'Nombre (opcional)',
    'Day of the month': 'Día del mes',
    'Recurring': 'Recurrente',
    'Added {n} recurring entry.': 'Se añadió {n} gasto recurrente.',
    'Added {n} recurring entries.': 'Se añadieron {n} gastos recurrentes.',
    'Add a category first.': 'Primero añade una categoría.',
    'Recurring entry saved.': 'Gasto recurrente guardado.',
    'Language & currency': 'Idioma y moneda',
    'Pay period': 'Periodo de pago',
    'Starting savings': 'Ahorros iniciales',
    'Budgets': 'Presupuestos',
    'Review': 'Revisión',
    'Setup steps': 'Pasos de la configuración',
    'Step {n} of {total}': 'Paso {n} de {total}',
    'Choose your language and currency': 'Elige tu idioma y moneda',
    'Your budgets are in this currency. You can still log entries in the others and they are converted for you.': 'Tus presupuestos están en esta moneda. Aun así puedes registrar gastos en las otras y se convierten por ti.',
    '£ Pound': '£ Libra',
    'When does your pay period start?': '¿Cuándo empieza tu periodo de pago?',
    'Pay day': 'Día de cobro',
    'Most stipends arrive once a month. Pick the day yours lands. Each period runs from that day to the day before the next one. If it arrives on the 1st, just leave it as it is.': 'La mayoría de las becas llegan una vez al mes. Elige el día en que llega la tuya. Cada periodo va desde ese día hasta el día anterior al siguiente. Si llega el día 1, déjalo como está.',
    'Pay period start day': 'Día de inicio del periodo de pago',
    'Last day of the month': 'Último día del mes',
    'Day {n}': 'Día {n}',
    'Periods follow the calendar: from the 1st to the last day of each month.': 'Los periodos siguen el calendario: del día 1 al último día de cada mes.',
    'Each period starts on the last day of a month and ends the day before the last day of the next one.': 'Cada periodo empieza el último día de un mes y termina el día antes del último día del siguiente.',
    'Each period runs from day {a} of one month to day {b} of the next.': 'Cada periodo va del día {a} de un mes al día {b} del siguiente.',
    'Your categories and budgets': 'Tus categorías y presupuestos',
    'Categories and budgets': 'Categorías y presupuestos',
    'Type a budget for each category, for one pay period. Turn on "Fixed bill" for something you pay in one go, like rent.': 'Escribe un presupuesto para cada categoría, para un periodo de pago. Activa "Factura fija" para algo que pagas de una vez, como el alquiler.',
    'Total budget per period': 'Presupuesto total por periodo',
    'Review and start': 'Revisa y empieza',
    'Everything here can be changed later in Settings.': 'Todo esto se puede cambiar más tarde en Ajustes.',
    'Pay period starts on': 'El periodo de pago empieza el',
    'Categories': 'Categorías',
    '‹ Back': '‹ Atrás',
    'Next ›': 'Siguiente ›',
    'Edit entry': 'Editar gasto',
    'Edit': 'Editar',
    'Save changes': 'Guardar cambios',
    'Pick a date.': 'Elige una fecha.',
    'This entry was converted from another currency. If you change the amount, it becomes a plain {currency} entry.': 'Este gasto se convirtió desde otra moneda. Si cambias el importe, pasa a ser un gasto normal en {currency}.',
    'It has been over a month since your last backup. Save a copy so your data stays safe.': 'Ha pasado más de un mes desde tu última copia de seguridad. Guarda una copia para que tus datos estén a salvo.',
    'Save backup now': 'Guardar copia ahora',
    'Remind me later': 'Recordármelo más tarde',
    'Current period': 'Periodo actual',
    'Period': 'Periodo',
    'Export CSV': 'Exportar CSV',
    'Pick the day your money arrives. Each period runs from that day to the day before the next one. A change applies from your next period, so the current one and past ones stay exactly as they are.': 'Elige el día en que te llega el dinero. Cada periodo va desde ese día hasta el día anterior al siguiente. Un cambio se aplica desde tu próximo periodo, así que el actual y los pasados quedan exactamente como están.',
    'Saved. It applies from your next period.': 'Guardado. Se aplica desde tu próximo periodo.',
    'Export to a spreadsheet': 'Exportar a una hoja de cálculo',
    'Download your entries as a CSV file that opens in Excel, Numbers or Google Sheets.': 'Descarga tus gastos como archivo CSV que se abre en Excel, Numbers o Google Sheets.',
    'This period': 'Este periodo',
    'Everything': 'Todo',
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
