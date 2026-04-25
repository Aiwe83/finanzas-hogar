// =============================================================================
// Finanzas del Hogar - lógica principal
// -----------------------------------------------------------------------------
// Toda la app corre en el cliente. Los movimientos se guardan en localStorage
// bajo la clave STORAGE_KEY. No hay backend ni peticiones de red.
//
// Flujo de datos:
//   loadTransactions()  -> `transactions` (memoria)
//   cualquier cambio    -> saveTransactions() + render()
//   render()            -> redibuja resumen, lista y gráficos del mes visible.
// =============================================================================


// === Constantes y configuración ============================================

const STORAGE_KEY = 'finanzas_tx_v1';            // clave principal en localStorage
const SNAPSHOT_KEY = 'finanzas_snapshot_v1';     // copia previa al último "reemplazar" de import (para poder deshacer)
const MAX_CATEGORY_LEN = 60;
const MAX_DESCRIPTION_LEN = 80;
// Claves que NUNCA deben copiarse desde JSON externo: permitirlas abriría
// puertas a prototype pollution.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const UNDO_TIMEOUT_MS = 5000;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const CATEGORIES = {
  expense: [
    'Alimentación', 'Vivienda', 'Transporte', 'Suministros',
    'Ocio', 'Salud', 'Ropa', 'Educación', 'Restaurantes',
    'Suscripciones', 'Otros gastos'
  ],
  income: [
    'Nómina', 'Extra', 'Inversiones', 'Regalos', 'Otros ingresos'
  ]
};

// Paleta para los gráficos. Cada categoría se asigna a un color de esta
// paleta de forma determinista (mismo nombre -> mismo color siempre).
const CATEGORY_COLORS = [
  '#00F0FF', '#FF006E', '#7C3AED', '#F7DF1E', '#10B981',
  '#22D3EE', '#F472B6', '#A78BFA', '#FB923C', '#60A5FA',
  '#E879F9'
];

// Formateadores reutilizables (más rápido que crear uno por render).
const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const shortMonthFmt = new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' });


// === Estado global =========================================================

let transactions = loadTransactions();   // array de movimientos en memoria
let viewDate = new Date(); viewDate.setDate(1);   // mes que se está visualizando (siempre día 1)
let editingId = null;                    // id del movimiento en edición, o null
let filterText = '';                     // texto del filtro de búsqueda (lowercase)
let undoTimer = null;                    // timeout que oculta el toast
let pendingImport = null;                // datos del import mientras el diálogo está abierto

let categoryChart = null;                // instancia de Chart.js (doughnut)
let evolutionChart = null;               // instancia de Chart.js (barras)


// === Arranque ==============================================================

init();

function init() {
  document.getElementById('txDate').value = todayIso();
  populateCategoryOptions();

  // Listeners: se dejan enganchados de por vida (no hay teardown).
  document.getElementById('txType').addEventListener('change', populateCategoryOptions);
  document.getElementById('txForm').addEventListener('submit', onSubmitForm);
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
  document.getElementById('prevMonth').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => shiftMonth(1));
  document.getElementById('txFilter').addEventListener('input', onFilterChange);
  document.getElementById('exportBtn').addEventListener('click', exportExcel);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', onImportFile);
  document.getElementById('importDialog').addEventListener('close', onImportDialogClose);
  document.getElementById('toastAction').addEventListener('click', onUndo);

  render();
}


// === Utilidades ============================================================

// Fecha de hoy en formato YYYY-MM-DD usando componentes LOCALES.
// No usar `input.valueAsDate = new Date()` porque ese setter interpreta el
// Date como UTC: cerca de medianoche puede mostrar el día anterior.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Hash DJB2 simple. No es criptográfico, solo sirve para mapear un string
// a un índice estable dentro de CATEGORY_COLORS.
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0; // fuerza a int32
  }
  return Math.abs(h);
}

function colorForCategory(name) {
  return CATEGORY_COLORS[hashString(name) % CATEGORY_COLORS.length];
}

// Claves "YYYY-MM" — se comparan como strings porque las fechas ISO
// ordenan lexicográficamente igual que cronológicamente.
function monthKey(isoDate) {
  return isoDate.slice(0, 7);
}

function viewMonthKey() {
  return `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
}


// === Validación y carga/guardado ==========================================

// Rechaza cualquier objeto que no cumpla el contrato exacto del movimiento.
// Se usa al cargar de localStorage y al restaurar snapshots: si el storage
// fue manipulado, los valores corruptos se descartan en silencio.
function isValidTx(t) {
  if (!t || typeof t !== 'object') return false;
  if (typeof t.id !== 'string' || !t.id) return false;
  if (t.type !== 'income' && t.type !== 'expense') return false;
  if (typeof t.date !== 'string' || !DATE_ISO_RE.test(t.date)) return false;
  if (typeof t.amount !== 'number' || !Number.isFinite(t.amount) || t.amount <= 0) return false;
  if (typeof t.category !== 'string' || !t.category.trim()) return false;
  if (t.description !== undefined && typeof t.description !== 'string') return false;
  return true;
}

// Redondea importes a 2 decimales y recorta strings. Se asume que el
// objeto ya pasó isValidTx (o viene del formulario con validación HTML5).
function sanitizeTx(t) {
  return {
    id: t.id,
    type: t.type,
    date: t.date,
    amount: Math.round(t.amount * 100) / 100,
    category: t.category.trim().slice(0, MAX_CATEGORY_LEN),
    description: (t.description || '').slice(0, MAX_DESCRIPTION_LEN)
  };
}

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTx).map(sanitizeTx);
  } catch {
    // JSON corrupto -> empezar de cero en vez de crashear.
    return [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function saveSnapshot() {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(transactions));
}


// === Formulario ============================================================

// Repobla el <select> de categorías según el tipo seleccionado, intentando
// preservar la categoría previa si todavía es válida para el nuevo tipo.
function populateCategoryOptions() {
  const type = document.getElementById('txType').value;
  const select = document.getElementById('txCategory');
  const previous = select.value;
  select.textContent = '';
  for (const cat of CATEGORIES[type]) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  }
  if (previous && CATEGORIES[type].includes(previous)) {
    select.value = previous;
  }
}

function onSubmitForm(e) {
  e.preventDefault();
  const type = document.getElementById('txType').value;
  const date = document.getElementById('txDate').value;
  const amount = parseFloat(document.getElementById('txAmount').value);
  const category = document.getElementById('txCategory').value;
  const description = document.getElementById('txDescription').value.trim();

  // Doble validación por si alguien bypassea la validación HTML5.
  if (!DATE_ISO_RE.test(date)) return;
  if (!Number.isFinite(amount) || amount <= 0) return;

  if (editingId) {
    const idx = transactions.findIndex(t => t.id === editingId);
    if (idx >= 0) {
      transactions[idx] = sanitizeTx({ id: editingId, type, date, amount, category, description });
    }
    editingId = null;
    exitEditMode();
    saveTransactions();
    resetForm();   // sin esto, quedan los valores del movimiento editado y el usuario podría duplicar sin querer
    showToast('Movimiento actualizado.');
  } else {
    transactions.push(sanitizeTx({
      id: crypto.randomUUID(), type, date, amount, category, description
    }));
    saveTransactions();
    resetForm();
  }
  render();
}

function resetForm() {
  const form = document.getElementById('txForm');
  form.reset();
  document.getElementById('txDate').value = todayIso();
  populateCategoryOptions();
}

function enterEditMode(tx) {
  editingId = tx.id;
  document.getElementById('txType').value = tx.type;
  populateCategoryOptions();
  // Si el movimiento viene de un import con categoría custom que no está en
  // CATEGORIES, la añadimos como option temporal para no perderla al guardar.
  const catSelect = document.getElementById('txCategory');
  if (!CATEGORIES[tx.type].includes(tx.category)) {
    const opt = document.createElement('option');
    opt.value = tx.category;
    opt.textContent = tx.category;
    catSelect.appendChild(opt);
  }
  document.getElementById('txDate').value = tx.date;
  document.getElementById('txAmount').value = tx.amount;
  catSelect.value = tx.category;
  document.getElementById('txDescription').value = tx.description || '';
  document.getElementById('formHeading').textContent = 'Editar movimiento';
  document.getElementById('submitBtn').textContent = 'Guardar cambios';
  document.getElementById('cancelEditBtn').hidden = false;
  document.querySelector('.form-section').classList.add('editing');
  document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  render();
}

function exitEditMode() {
  document.getElementById('formHeading').textContent = 'Nuevo movimiento';
  document.getElementById('submitBtn').textContent = 'Añadir';
  document.getElementById('cancelEditBtn').hidden = true;
  document.querySelector('.form-section').classList.remove('editing');
}

function cancelEdit() {
  editingId = null;
  resetForm();
  exitEditMode();
  render();
}

// Borrado con "undo": el toast captura la posición original por si el
// usuario pulsa Deshacer antes de que el timer expire.
function deleteTransaction(id) {
  const idx = transactions.findIndex(t => t.id === id);
  if (idx < 0) return;
  const removed = transactions[idx];
  transactions.splice(idx, 1);
  saveTransactions();
  if (editingId === id) cancelEdit();
  render();
  showToast('Movimiento eliminado.', () => {
    transactions.splice(idx, 0, removed);
    saveTransactions();
    render();
  });
}


// === Navegación y filtro ===================================================

function shiftMonth(delta) {
  viewDate.setMonth(viewDate.getMonth() + delta);
  render();
}

// El filtro solo afecta a la lista; resumen y gráficos siguen mostrando todo el mes.
function onFilterChange(e) {
  filterText = e.target.value.trim().toLowerCase();
  renderTransactionList(getMonthTx());
}

function getMonthTx() {
  const key = viewMonthKey();
  return transactions.filter(t => monthKey(t.date) === key);
}


// === Render ================================================================

function render() {
  renderMonthLabel();
  const monthTx = getMonthTx();
  renderSummary(monthTx);
  renderTransactionList(monthTx);
  renderCategoryChart(monthTx);
  renderEvolutionChart();
}

function renderMonthLabel() {
  document.getElementById('currentMonthLabel').textContent = monthFmt.format(viewDate);
}

function renderSummary(monthTx) {
  let income = 0, expense = 0;
  for (const t of monthTx) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  document.getElementById('totalIncome').textContent = eurFmt.format(income);
  document.getElementById('totalExpense').textContent = eurFmt.format(expense);
  document.getElementById('totalBalance').textContent = eurFmt.format(income - expense);
}

function renderTransactionList(monthTx) {
  const list = document.getElementById('txList');
  const empty = document.getElementById('txEmpty');
  list.textContent = '';   // limpia el <ul>

  let items = monthTx;
  if (filterText) {
    items = items.filter(t =>
      t.category.toLowerCase().includes(filterText) ||
      (t.description || '').toLowerCase().includes(filterText)
    );
  }

  if (items.length === 0) {
    empty.textContent = filterText
      ? 'Ningún movimiento coincide con el filtro.'
      : 'Aún no hay movimientos este mes.';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');

  // Orden: fecha descendente y, a igualdad, id descendente (estable).
  const sorted = [...items].sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    return d !== 0 ? d : b.id.localeCompare(a.id);
  });

  for (const t of sorted) {
    const li = document.createElement('li');
    if (t.id === editingId) li.classList.add('editing');
    // Extraemos el día directamente del string ISO para evitar el desfase
    // de timezone de `new Date("2026-01-05").getDate()`.
    const day = t.date.slice(8, 10);
    const sign = t.type === 'income' ? '+' : '-';

    const dateEl = document.createElement('span');
    dateEl.className = 'tx-date';
    dateEl.textContent = day;

    const info = document.createElement('div');
    info.className = 'tx-info';
    const cat = document.createElement('span');
    cat.className = 'tx-category';
    cat.textContent = t.category;
    info.appendChild(cat);
    if (t.description) {
      const desc = document.createElement('span');
      desc.className = 'tx-description';
      desc.textContent = t.description;
      desc.title = t.description;
      info.appendChild(desc);
    }

    const amount = document.createElement('span');
    amount.className = `tx-amount ${t.type}`;
    amount.textContent = `${sign}${eurFmt.format(t.amount)}`;

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn edit-btn';
    editBtn.type = 'button';
    editBtn.textContent = '✎';
    editBtn.title = 'Editar';
    editBtn.setAttribute('aria-label', 'Editar movimiento');
    editBtn.addEventListener('click', () => enterEditMode(t));

    const del = document.createElement('button');
    del.className = 'icon-btn delete-btn';
    del.type = 'button';
    del.textContent = '×';
    del.title = 'Eliminar';
    del.setAttribute('aria-label', 'Eliminar movimiento');
    del.addEventListener('click', () => deleteTransaction(t.id));

    li.appendChild(dateEl);
    li.appendChild(info);
    li.appendChild(amount);
    li.appendChild(editBtn);
    li.appendChild(del);
    list.appendChild(li);
  }
}


// === Gráficos ==============================================================

// Reutiliza la instancia de Chart.js entre renders en vez de destruirla y
// recrearla: evita flicker y preserva la animación de transición.
function upsertChart(existing, canvas, config) {
  if (!existing) return new Chart(canvas, config);
  existing.data.labels = config.data.labels;
  existing.data.datasets = config.data.datasets;
  existing.update();
  return existing;
}

function renderCategoryChart(monthTx) {
  // Agrupamos solo los gastos por categoría (los ingresos no aportan a este gráfico).
  const byCat = new Map();
  for (const t of monthTx) {
    if (t.type !== 'expense') continue;
    byCat.set(t.category, (byCat.get(t.category) || 0) + t.amount);
  }

  const entries = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const empty = document.getElementById('categoryEmpty');
  const canvas = document.getElementById('categoryChart');

  // Sin gastos: mostramos el mensaje y destruimos la instancia para liberar memoria.
  if (entries.length === 0) {
    empty.classList.add('show');
    canvas.style.display = 'none';
    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
    return;
  }
  empty.classList.remove('show');
  canvas.style.display = '';

  const labels = entries.map(e => e[0]);
  const data = entries.map(e => e[1]);
  const colors = labels.map(colorForCategory);

  categoryChart = upsertChart(categoryChart, canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: '#161B22', borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#E6EDF3', padding: 12 } },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.label}: ${eurFmt.format(ctx.parsed)}` }
        }
      }
    }
  });
}

// Ventana móvil de 6 meses terminando en el mes visible (inclusive).
function renderEvolutionChart() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth() - i, 1);
    months.push(d);
  }
  const keys = months.map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  // Pre-poblamos el Map con 0s para que meses sin movimientos aparezcan como barra vacía.
  const agg = new Map(keys.map(k => [k, { income: 0, expense: 0 }]));

  for (const t of transactions) {
    const entry = agg.get(monthKey(t.date));
    if (!entry) continue;   // fuera de la ventana de 6 meses
    entry[t.type] += t.amount;
  }

  const labels = months.map(d => shortMonthFmt.format(d));
  const incomeData = keys.map(k => agg.get(k).income);
  const expenseData = keys.map(k => agg.get(k).expense);

  const canvas = document.getElementById('evolutionChart');

  evolutionChart = upsertChart(evolutionChart, canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ingresos', data: incomeData, backgroundColor: '#10B981' },
        { label: 'Gastos', data: expenseData, backgroundColor: '#FF006E' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#E6EDF3' } },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${eurFmt.format(ctx.parsed.y)}` }
        }
      },
      scales: {
        x: { ticks: { color: '#9CA3AF' }, grid: { color: '#30363D' } },
        y: {
          ticks: { color: '#9CA3AF', callback: (v) => eurFmt.format(v) },
          grid: { color: '#30363D' }
        }
      }
    }
  });
}


// === Export Excel ==========================================================

function exportExcel() {
  if (transactions.length === 0) {
    showToast('No hay movimientos para exportar.');
    return;
  }
  // Ordenados por fecha ascendente para que el Excel sea legible.
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => ({
      Fecha: t.date,
      Tipo: t.type === 'income' ? 'Ingreso' : 'Gasto',
      Categoría: t.category,
      'Importe (€)': t.amount,
      Descripción: t.description || ''
    }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['Fecha', 'Tipo', 'Categoría', 'Importe (€)', 'Descripción']
  });
  // Anchos de columna en "character widths" (aprox. caracteres visibles).
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `finanzas-${stamp}.xlsx`);
}


// === Import Excel ==========================================================

// Convierte un valor de celda de Excel (número serial, Date, o string) a
// "YYYY-MM-DD". Devuelve null si no se puede interpretar.
function excelDateToIso(value) {
  // Serial de Excel (p.ej. 45292 = 2024-01-01).
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  // Date ya parseado (gracias a `cellDates: true`).
  if (value instanceof Date && !isNaN(value)) {
    const y = value.getFullYear();
    const mo = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dd}`;
  }
  // String: aceptamos ISO directamente o formato DMY con / ó -.
  if (typeof value === 'string') {
    const s = value.trim();
    if (DATE_ISO_RE.test(s.slice(0, 10))) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return null;
}

function normalizeType(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'ingreso' || s === 'income') return 'income';
  if (s === 'gasto' || s === 'expense') return 'expense';
  return null;
}

// Parsea importes aceptando tanto formato español ("1.234,56") como inglés
// ("1,234.56"). La regla: el último separador que aparece es el decimal;
// los otros se consideran separadores de miles y se eliminan.
function parseImportAmount(value) {
  if (typeof value === 'number') return value;
  const s = String(value ?? '').trim();
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized;
  if (lastComma > lastDot) {
    // Formato ES: "1.234,56" -> "1234.56"
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Formato EN: "1,234.56" -> "1234.56"
    normalized = s.replace(/,/g, '');
  } else {
    // Sin separadores (o un único tipo sin ambigüedad).
    normalized = s;
  }
  return parseFloat(normalized);
}

// Busca el primer nombre de columna existente en la fila, ignorando
// claves peligrosas como __proto__ para evitar prototype pollution.
function pickField(row, names) {
  for (const n of names) {
    if (DANGEROUS_KEYS.has(n)) continue;
    if (Object.prototype.hasOwnProperty.call(row, n)) return row[n];
  }
  return undefined;
}

function onImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = new Uint8Array(reader.result);
      // Opciones defensivas: sin fórmulas, sin HTML, y fechas como objetos Date.
      const wb = XLSX.read(data, {
        type: 'array',
        cellDates: true,
        cellHTML: false,
        cellFormula: false
      });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('El archivo no tiene hojas.');
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const valid = [];
      const errors = [];   // índices de filas (1-based, contando el header) que se descartan
      rows.forEach((r, idx) => {
        const date = excelDateToIso(pickField(r, ['Fecha', 'fecha', 'Date']));
        const type = normalizeType(pickField(r, ['Tipo', 'tipo', 'Type']));
        const rawCategory = pickField(r, ['Categoría', 'Categoria', 'categoría', 'Category']);
        const category = String(rawCategory ?? '').trim().slice(0, MAX_CATEGORY_LEN);
        const rawAmount = pickField(r, ['Importe (€)', 'Importe', 'importe', 'Amount']);
        const amount = parseImportAmount(rawAmount);
        const description = String(pickField(r, ['Descripción', 'Descripcion', 'descripción', 'Description']) ?? '').trim().slice(0, MAX_DESCRIPTION_LEN);

        if (!date || !type || !category || !Number.isFinite(amount) || amount <= 0) {
          errors.push(idx + 2);   // +2: fila del Excel (1-based + header)
          return;
        }
        valid.push(sanitizeTx({
          id: crypto.randomUUID(), type, date, amount, category, description
        }));
      });

      if (valid.length === 0) {
        showToast('No se encontraron movimientos válidos en el archivo.');
        return;
      }

      // Parkeamos los datos y abrimos el diálogo; la decisión (append/replace)
      // se procesa en onImportDialogClose.
      pendingImport = { valid, errors };
      const summary = document.getElementById('importSummary');
      const parts = [`${valid.length} movimiento${valid.length === 1 ? '' : 's'} válido${valid.length === 1 ? '' : 's'} encontrado${valid.length === 1 ? '' : 's'}.`];
      if (errors.length) parts.push(`${errors.length} fila${errors.length === 1 ? '' : 's'} omitida${errors.length === 1 ? '' : 's'} por datos inválidos.`);
      summary.textContent = parts.join(' ');
      document.getElementById('importDialog').showModal();
    } catch (err) {
      showToast('Error al importar: ' + err.message);
    }
  };
  reader.onerror = () => showToast('No se pudo leer el archivo.');
  reader.readAsArrayBuffer(file);
  // Reset del input para que volver a elegir el MISMO archivo dispare un nuevo change.
  e.target.value = '';
}

function onImportDialogClose(e) {
  const action = e.target.returnValue;
  const pending = pendingImport;
  pendingImport = null;   // se limpia siempre, incluso si se cancela
  if (!pending || action === 'cancel' || !action) return;

  if (action === 'replace') {
    // Antes de sobreescribir guardamos una copia, así el toast puede ofrecer deshacer.
    saveSnapshot();
    transactions = pending.valid;
    saveTransactions();
    render();
    showToast(`${pending.valid.length} movimientos importados (reemplazo). Snapshot guardado.`, () => {
      restoreSnapshot();
    });
  } else if (action === 'append') {
    transactions = transactions.concat(pending.valid);
    saveTransactions();
    render();
    showToast(`${pending.valid.length} movimientos añadidos.`);
  }
}

function restoreSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    transactions = parsed.filter(isValidTx).map(sanitizeTx);
    saveTransactions();
    render();
    showToast('Snapshot restaurado.');
  } catch {
    showToast('No se pudo restaurar el snapshot.');
  }
}


// === Toast de notificaciones (con undo opcional) ==========================

// Guardamos el callback de undo directamente en una propiedad del botón
// (action._undo). Es un patrón feo pero evita tener que gestionar closures
// cuando llegan toasts encadenados: cada nuevo toast simplemente reemplaza
// la referencia.
function showToast(message, undoFn) {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toastMsg');
  const action = document.getElementById('toastAction');

  msg.textContent = message;
  action.hidden = !undoFn;
  action._undo = undoFn || null;
  toast.hidden = false;

  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    toast.hidden = true;
    action._undo = null;
  }, UNDO_TIMEOUT_MS);
}

function onUndo() {
  const action = document.getElementById('toastAction');
  const fn = action._undo;
  action._undo = null;   // previene doble ejecución si el usuario hace doble click
  document.getElementById('toast').hidden = true;
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  if (typeof fn === 'function') fn();
}
