'use strict';

/* =====================================================================
   Utilidades
   ===================================================================== */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dateKey(new Date());
const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dateKey(d); };
const isValidKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(keyToDate(k));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtWeekday = (k) => keyToDate(k).toLocaleDateString('es-ES', { weekday: 'long' });
const fmtDayMonthYear = (k) => keyToDate(k).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtLong = (k) => cap(keyToDate(k).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
const mondayOf = (k) => { const d = keyToDate(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dateKey(d); };
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const isEmptyVal = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'string' && !v.trim());
const itemIsEmpty = (it) => !it || Object.values(it).every(isEmptyVal);
// Un elemento que solo tiene la hora (puesta automáticamente) cuenta como vacío
const itemHasContent = (it) => !!it && Object.entries(it).some(([k, v]) => k !== 'hora' && !isEmptyVal(v));

function tplOf(rec) { return TEMPLATES[rec.v] || TEMPLATES[CURRENT_VERSION]; }

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

const isTouch = () => matchMedia('(pointer: coarse)').matches;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** Entrega un archivo: en el móvil abre el menú Compartir (Guardar en Archivos, Drive…); en el ordenador lo descarga. */
async function deliverFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (isTouch() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return true;
}

/* =====================================================================
   Base de datos local (IndexedDB) — los datos solo viven en este dispositivo
   ===================================================================== */
const DB = {
  db: null,
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('registro-diario', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  },
  _req(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const r = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  get(store, key) { return this._req(store, 'readonly', (s) => s.get(key)); },
  all(store) { return this._req(store, 'readonly', (s) => s.getAll()); },
  put(store, val, key) { return this._req(store, 'readwrite', (s) => (key === undefined ? s.put(val) : s.put(val, key))); },
  del(store, key) { return this._req(store, 'readwrite', (s) => s.delete(key)); },
};

/* =====================================================================
   Estado y guardado automático
   ===================================================================== */
let current = null; // { date, rec, persisted }
let saveTimer = null;

function blankRecord(date) {
  const now = Date.now();
  return { date, v: CURRENT_VERSION, closed: false, createdAt: now, updatedAt: now, data: {} };
}

function markDirty() {
  current.rec.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}

async function flushSave() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!current || !current.dirtySince) return;
  const rec = current.rec;
  current.dirtySince = 0;
  try {
    await DB.put('days', JSON.parse(JSON.stringify(rec)));
    current.persisted = true;
  } catch (e) {
    console.error(e);
    toast('⚠️ No se ha podido guardar. Prueba a exportar una copia.');
  }
}
function touch() { if (current) { current.dirtySince = Date.now(); markDirty(); } }

/** Devuelve (y crea si hace falta) los elementos de un apartado, rellenando hasta el mínimo. */
function itemsOf(rec, secId, sec) {
  let arr = rec.data[secId];
  if (!Array.isArray(arr)) { arr = []; rec.data[secId] = arr; }
  const min = sec.kind === 'fixed' ? sec.count : sec.kind === 'single' ? 1 : (sec.min || 0);
  while (arr.length < min) arr.push({});
  return arr;
}

/* =====================================================================
   Vista: día (formulario o registro cerrado)
   ===================================================================== */
async function renderDay(date) {
  const view = document.getElementById('view');
  let rec = await DB.get('days', date);
  const persisted = !!rec;
  if (!rec) rec = blankRecord(date);
  current = { date, rec, persisted, dirtySince: 0 };

  const isToday = date === todayKey();
  const head = h('div', { class: 'dayhead' },
    h('button', { class: 'iconbtn', 'aria-label': 'Día anterior', onclick: () => go(`#/dia/${addDays(date, -1)}`) }, '‹'),
    h('div', { class: 'title' },
      h('div', { class: 'weekday' }, isToday ? `Hoy · ${fmtWeekday(date)}` : fmtWeekday(date)),
      h('div', { class: 'date' }, fmtDayMonthYear(date))),
    h('button', { class: 'iconbtn', 'aria-label': 'Día siguiente', disabled: isToday, onclick: () => go(`#/dia/${addDays(date, 1)}`) }, '›'),
  );

  const status = h('div', { class: 'status-line' },
    rec.closed ? '✓ Día cerrado y archivado' : 'Se guarda automáticamente mientras escribes',
    !isToday ? h('span', null, ' · ', h('a', { href: '#/hoy' }, 'Ir a hoy')) : null);

  const frag = [head, status, ...banners()];

  if (rec.closed) {
    frag.push(h('p', { class: 'closed-note' }, 'Para modificarlo, pulsa «Reabrir».'));
    frag.push(renderReadOnly(rec));
    frag.push(h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: () => exportDayPdf(rec) }, '📄 Descargar PDF'),
      h('button', { class: 'btn', onclick: reopenDay }, '✏️ Reabrir')));
  } else {
    const tpl = tplOf(rec);
    for (const b of tpl.blocks) {
      const block = h('section', { class: `block ${b.id}` },
        h('div', { class: 'block-head' }, h('div', { class: 'block-icon' }, b.icon), h('h2', null, b.title)),
        b.note ? h('p', { class: 'block-note' }, b.note) : null);
      for (const sid of b.sections) block.append(renderSection(rec, sid, tpl.sections[sid]));
      frag.push(block);
    }
    frag.push(h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => exportDayPdf(current.rec) }, '📄 PDF'),
      h('button', { class: 'btn primary', onclick: closeDay }, '✓ Cerrar día')));
  }

  view.replaceChildren(...frag);
  view.querySelectorAll('textarea').forEach(autoGrow);
}

function banners() {
  const out = [];
  if (isIOS() && !isStandalone() && lsGet('hideInstall') !== '1') {
    const b = h('div', { class: 'banner' },
      h('div', null, '📲'),
      h('div', { class: 'grow' }, 'Instálala en el iPhone: en Safari pulsa ', h('b', null, 'Compartir'), ' → ', h('b', null, 'Añadir a pantalla de inicio'), '. Así los registros se conservan de forma segura.'),
      h('button', { 'aria-label': 'Cerrar aviso', onclick: () => { lsSet('hideInstall', '1'); b.remove(); } }, '×'));
    out.push(b);
  }
  if (backupState.needsReminder) {
    out.push(h('div', { class: 'banner' },
      h('div', null, '💾'),
      h('div', { class: 'grow' }, backupState.last ? `Tu última copia de seguridad es de hace ${backupState.daysAgo} días. ` : 'Aún no has hecho ninguna copia de seguridad. ',
        h('a', { href: '#/ajustes' }, 'Hacer copia'))));
  }
  return out;
}

function renderSection(rec, sid, sec) {
  const items = itemsOf(rec, sid, sec);
  const badge = h('span', { class: 'badge' });
  const updateBadge = () => {
    const n = items.filter(itemHasContent).length;
    if (n > 0) { badge.className = 'badge done'; badge.textContent = sec.kind === 'repeat' && n > 1 ? `✓ ${n}` : '✓'; }
    else if (sec.optional) { badge.className = 'badge opt'; badge.textContent = 'Opcional'; }
    else { badge.className = 'badge'; badge.textContent = 'Pendiente'; }
  };
  updateBadge();

  const guide = h('details', { class: 'guide' },
    h('summary', null, 'Cómo hacerlo'),
    h('div', { class: 'guide-body' },
      h('ul', null, sec.guide.map((g) => h('li', { html: g }))),
      sec.example ? [h('div', { class: 'example-title' }, 'Ejemplo'), h('ul', { class: 'example' }, sec.example.map((e) => h('li', null, e)))] : null));

  const list = h('div', { class: 'items' });
  const card = h('div', { class: 'card', id: `sec-${sid}` },
    h('div', { class: 'card-head' }, h('h3', null, sec.title), badge),
    h('p', { class: 'subtitle' }, sec.subtitle),
    guide, list);

  const drawItems = () => {
    list.replaceChildren(...items.map((it, i) => renderItem(sec, items, it, i, { onChange: updateBadge, redraw: drawItems })));
    list.querySelectorAll('textarea').forEach(autoGrow);
    updateBadge();
  };
  drawItems();

  if (sec.kind === 'repeat') {
    card.append(h('button', { class: 'addbtn', onclick: () => {
      items.push({});
      touch();
      drawItems();
      const last = list.lastElementChild;
      last && last.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }, `+ ${sec.addLabel}`));
  }
  return card;
}

function renderItem(sec, items, it, i, { onChange, redraw }) {
  const wrap = h('div', { class: 'item' });
  const canRemove = sec.kind === 'repeat' && items.length > Math.max(1, sec.min || 0);
  if (sec.itemLabel) {
    wrap.append(h('div', { class: 'item-head' },
      h('span', { class: 'label' }, sec.itemLabel.replace('{n}', i + 1)),
      canRemove ? h('button', { class: 'remove', onclick: () => {
        if (itemHasContent(it) && !confirm('¿Borrar este registro?')) return;
        items.splice(i, 1); touch(); redraw();
      } }, 'Quitar') : null));
  }

  const timeField = sec.fields.find((f) => f.type === 'time');
  let timeInput = null;

  const set = (fid, v) => {
    it[fid] = v;
    // La hora se apunta sola al empezar a escribir en ese momento
    if (timeField && fid !== timeField.id && isEmptyVal(it[timeField.id]) && !isEmptyVal(v)) {
      it[timeField.id] = nowHM();
      if (timeInput) timeInput.value = it[timeField.id];
    }
    touch(); onChange();
  };

  for (const f of sec.fields) {
    const fid = `f-${Math.random().toString(36).slice(2, 9)}`;
    const field = h('div', { class: 'field' });
    const val = it[f.id];
    if (!f.hideLabel) {
      field.append(f.type === 'scale' || f.type === 'chips'
        ? h('div', { class: 'flabel' }, f.label)
        : h('label', { for: fid }, f.label));
    }

    if (f.type === 'text') {
      field.append(h('input', { id: fid, type: 'text', value: val || '', placeholder: f.placeholder || '', 'aria-label': f.label, oninput: (e) => set(f.id, e.target.value) }));
    } else if (f.type === 'textarea') {
      const ta = h('textarea', { id: fid, rows: f.rows || 2, placeholder: f.placeholder || '', 'aria-label': f.label, oninput: (e) => { autoGrow(e.target); set(f.id, e.target.value); } });
      ta.value = val || '';
      field.append(ta);
    } else if (f.type === 'time') {
      timeInput = h('input', { id: fid, type: 'time', value: val || '', 'aria-label': f.label, onchange: (e) => { it[f.id] = e.target.value; touch(); } });
      field.append(timeInput);
    } else if (f.type === 'scale') {
      const row = h('div', { class: 'scale', role: 'group', 'aria-label': f.label });
      for (let n = 0; n <= 10; n++) {
        const btn = h('button', { type: 'button', class: val === n ? 'on' : '', 'aria-pressed': String(val === n), onclick: () => {
          const nv = it[f.id] === n ? null : n; // pulsar otra vez lo quita
          row.querySelectorAll('button').forEach((b, j) => { b.classList.toggle('on', j === nv); b.setAttribute('aria-pressed', String(j === nv)); });
          set(f.id, nv);
        } }, String(n));
        row.append(btn);
      }
      field.append(row, h('div', { class: 'scale-legend' }, h('span', null, 'Nada'), h('span', null, 'Máxima')));
    } else if (f.type === 'chips') {
      const sel = new Set(Array.isArray(val) ? val : []);
      const row = h('div', { class: 'chips', role: 'group', 'aria-label': f.label });
      for (const opt of f.options) {
        const btn = h('button', { type: 'button', class: sel.has(opt) ? 'on' : '', 'aria-pressed': String(sel.has(opt)), onclick: () => {
          sel.has(opt) ? sel.delete(opt) : sel.add(opt);
          btn.classList.toggle('on', sel.has(opt)); btn.setAttribute('aria-pressed', String(sel.has(opt)));
          set(f.id, f.options.filter((o) => sel.has(o)));
        } }, opt);
        row.append(btn);
      }
      field.append(row);
    }
    wrap.append(field);
  }
  return wrap;
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

async function closeDay() {
  const rec = current.rec;
  rec.closed = true;
  rec.closedAt = Date.now();
  touch();
  await flushSave();
  toast('Día cerrado y archivado');
  window.scrollTo({ top: 0 });
  renderDay(rec.date);
}

async function reopenDay() {
  current.rec.closed = false;
  touch();
  await flushSave();
  renderDay(current.rec.date);
}

/* =====================================================================
   Modelo "imprimible": lo usan la vista de día cerrado y el PDF
   ===================================================================== */
function fmtFieldVal(f, v) {
  if (isEmptyVal(v)) return '';
  if (f.type === 'chips') return v.join(', ');
  if (f.type === 'scale') return `${v}/10`;
  return String(v).trim();
}

function printable(rec) {
  const tpl = tplOf(rec);
  return tpl.blocks.map((b) => ({
    id: b.id, title: b.title,
    sections: b.sections.map((sid) => {
      const s = tpl.sections[sid];
      const items = (rec.data[sid] || []).filter(itemHasContent);
      return {
        id: sid, title: s.title, subtitle: s.subtitle, optional: !!s.optional,
        items: items.map((it, i) => {
          const meta = [];
          for (const f of s.fields) {
            if (f.type === 'time' && !isEmptyVal(it[f.id])) meta.push(it[f.id]);
            if (f.type === 'scale' && !isEmptyVal(it[f.id])) meta.push(`${f.short} ${it[f.id]}/10`);
          }
          return {
            label: s.itemLabel ? s.itemLabel.replace('{n}', i + 1) : null,
            meta: meta.join(' · '),
            fields: s.fields.filter((f) => f.type !== 'time' && f.type !== 'scale')
              .map((f) => ({ label: f.label, value: fmtFieldVal(f, it[f.id]) })),
          };
        }),
      };
    }),
  }));
}

function renderReadOnly(rec) {
  const wrap = h('div');
  for (const b of printable(rec)) {
    const block = h('section', { class: `block ${b.id}` },
      h('div', { class: 'block-head' }, h('div', { class: 'block-icon' }, tplOf(rec).blocks.find((x) => x.id === b.id).icon), h('h2', null, b.title)));
    for (const s of b.sections) {
      if (s.optional && !s.items.length) continue;
      const card = h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', null, s.title)),
        h('p', { class: 'subtitle' }, s.subtitle));
      if (!s.items.length) card.append(h('div', { class: 'ro-empty' }, 'Sin registro'));
      for (const it of s.items) {
        card.append(h('div', { class: 'ro-item' },
          it.label ? h('div', { class: 'label' }, it.label) : null,
          it.meta ? h('div', { class: 'meta' }, it.meta) : null,
          it.fields.filter((f) => f.value).map((f) => h('div', { class: 'ro-field' },
            s.id === 'reflexiones' ? null : h('div', { class: 'q' }, f.label),
            h('div', { class: 'a' }, f.value)))));
      }
      block.append(card);
    }
    wrap.append(block);
  }
  return wrap;
}

/* =====================================================================
   Estadísticas (historial y PDF semanal)
   ===================================================================== */
function dayStats(rec) {
  const d = rec.data || {};
  const content = (sid) => (d[sid] || []).filter(itemHasContent);
  const intens = (arr) => {
    const both = arr.filter((it) => typeof it.int_antes === 'number' && typeof it.int_despues === 'number');
    if (!both.length) return null;
    const avg = (k) => both.reduce((a, it) => a + it[k], 0) / both.length;
    return { antes: avg('int_antes'), despues: avg('int_despues'), n: both.length };
  };
  const rum = content('rumiacion');
  const ano = content('anoranza');
  return {
    actividades: content('satisfaccion').length,
    rumiacion: rum.length, rumInt: intens(rum),
    anoranza: ano.length, anoInt: intens(ano),
    etiquetas: rum.flatMap((it) => it.etiqueta || []),
    emociones: ano.flatMap((it) => it.emociones || []),
    negativos: content('pens_neg').length,
  };
}

function plural(n, s, p) { return `${n} ${n === 1 ? s : p}`; }

function summaryLine(st) {
  const parts = [];
  if (st.actividades) parts.push(plural(st.actividades, 'actividad', 'actividades'));
  if (st.rumiacion) parts.push(plural(st.rumiacion, 'rumiación', 'rumiaciones'));
  if (st.anoranza) parts.push(plural(st.anoranza, 'añoranza', 'añoranzas'));
  return parts.join(' · ') || 'Sin ejercicios del día registrados';
}

/* =====================================================================
   Vista: historial
   ===================================================================== */
async function renderHistory() {
  const view = document.getElementById('view');
  const all = (await DB.all('days')).filter((r) => Object.values(r.data || {}).some((arr) => (arr || []).some(itemHasContent)));
  all.sort((a, b) => b.date.localeCompare(a.date));

  const listWrap = h('div');
  const search = h('input', { class: 'search', type: 'search', placeholder: '🔎 Buscar en mis registros…', 'aria-label': 'Buscar', oninput: () => draw(search.value) });

  const draw = (q) => {
    const nq = norm(q.trim());
    const recs = nq ? all.filter((r) => norm(JSON.stringify(r.data)).includes(nq)) : all;
    if (!recs.length) {
      listWrap.replaceChildren(h('div', { class: 'empty' }, nq ? 'No hay registros que coincidan.' : 'Todavía no hay registros. Empieza en «Hoy».'));
      return;
    }
    const weeks = new Map();
    for (const r of recs) {
      const m = mondayOf(r.date);
      if (!weeks.has(m)) weeks.set(m, []);
      weeks.get(m).push(r);
    }
    const out = [];
    for (const [monday, days] of weeks) {
      const sunday = addDays(monday, 6);
      const label = `Semana del ${keyToDate(monday).getDate()} al ${keyToDate(sunday).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
      out.push(h('div', { class: 'week' },
        h('div', { class: 'week-head' },
          h('h3', null, label),
          h('button', { class: 'btn small', onclick: () => exportWeekPdf(monday) }, '📄 PDF semana')),
        h('div', { class: 'daylist' }, days.map((r) => {
          const st = dayStats(r);
          const d = keyToDate(r.date);
          return h('a', { class: 'dayrow', href: `#/dia/${r.date}` },
            h('div', { class: 'd' },
              h('div', { class: 'n' }, d.getDate()),
              h('div', { class: 'w' }, d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''))),
            h('div', { class: 'info' },
              h('div', { class: 't' }, cap(d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))),
              h('div', { class: 's' }, summaryLine(st))),
            h('span', { class: `pill ${r.closed ? 'closed' : ''}` }, r.closed ? 'Cerrado' : 'Abierto'));
        }))));
    }
    listWrap.replaceChildren(...out);
  };

  view.replaceChildren(
    h('h1', { class: 'page-title' }, 'Historial'),
    h('p', { class: 'page-sub' }, 'Revísalo con calma o en sesión. Si estás bajo, mejor no releer añoranzas antiguas.'),
    search, listWrap);
  draw('');
}

/* =====================================================================
   PDF
   ===================================================================== */
async function exportDayPdf(rec) {
  await flushSave();
  try {
    const blob = PDF.day(rec);
    await deliverFile(blob, `Registro ${rec.date}.pdf`);
  } catch (e) { console.error(e); toast('No se ha podido crear el PDF'); }
}

async function exportWeekPdf(monday) {
  await flushSave();
  const keys = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const recs = (await Promise.all(keys.map((k) => DB.get('days', k)))).filter(Boolean);
  try {
    const blob = PDF.week(monday, recs);
    await deliverFile(blob, `Registro semana ${monday}.pdf`);
  } catch (e) { console.error(e); toast('No se ha podido crear el PDF'); }
}

/* =====================================================================
   Copia de seguridad
   ===================================================================== */
const backupState = { last: 0, daysAgo: 0, needsReminder: false };

async function refreshBackupState() {
  const last = (await DB.get('meta', 'lastBackup')) || 0;
  const days = await DB.all('days');
  const hasData = days.some((r) => Object.values(r.data || {}).some((arr) => (arr || []).some(itemHasContent)));
  backupState.last = last;
  backupState.daysAgo = last ? Math.floor((Date.now() - last) / 86400000) : 0;
  const firstData = days.reduce((m, r) => Math.min(m, r.createdAt || Infinity), Infinity);
  // Recordatorio semanal (y la primera vez, a los 3 días de empezar)
  backupState.needsReminder = hasData && (last ? backupState.daysAgo >= 7 : (Date.now() - firstData) > 3 * 86400000);
}

async function exportBackup() {
  await flushSave();
  const days = await DB.all('days');
  const payload = { app: 'registro-diario', format: 1, exportedAt: new Date().toISOString(), days };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const ok = await deliverFile(blob, `registro-diario-copia-${todayKey()}.json`);
  if (ok) {
    await DB.put('meta', Date.now(), 'lastBackup');
    await refreshBackupState();
    toast(`Copia creada (${plural(days.length, 'día', 'días')})`);
    if (location.hash === '#/ajustes') renderSettings();
  }
}

async function importBackup(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); } catch { toast('El archivo no es una copia válida'); return; }
  if (!payload || payload.app !== 'registro-diario' || !Array.isArray(payload.days)) { toast('El archivo no es una copia de esta app'); return; }
  let added = 0, updated = 0, kept = 0;
  for (const d of payload.days) {
    if (!d || !isValidKey(d.date) || typeof d.data !== 'object') continue;
    const existing = await DB.get('days', d.date);
    if (!existing) { await DB.put('days', d); added++; }
    else if ((d.updatedAt || 0) > (existing.updatedAt || 0)) { await DB.put('days', d); updated++; }
    else kept++;
  }
  await refreshBackupState();
  toast(`Importado: ${added} nuevos, ${updated} actualizados, ${kept} sin cambios`);
}

/* =====================================================================
   PIN (pantalla de privacidad; los datos no se cifran)
   ===================================================================== */
async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
let pinConf = null;
let hiddenAt = 0;

async function checkPin(pin) { return pinConf && (await sha(pinConf.salt + pin)) === pinConf.hash; }

function showLock() {
  if (!pinConf) return;
  const lock = document.getElementById('lock');
  lock.hidden = false;
  document.getElementById('lock-error').textContent = '';
  const inp = document.getElementById('lock-input');
  inp.value = '';
  setTimeout(() => inp.focus(), 50);
}

function setupLock() {
  document.getElementById('lock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = document.getElementById('lock-input');
    if (await checkPin(inp.value)) {
      document.getElementById('lock').hidden = true;
      inp.value = '';
      inp.blur();
    } else {
      document.getElementById('lock-error').textContent = 'PIN incorrecto';
      inp.value = '';
    }
  });
}

/* =====================================================================
   Vista: ajustes
   ===================================================================== */
async function renderSettings() {
  const view = document.getElementById('view');
  await refreshBackupState();
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) { await importBackup(f); renderSettings(); }
  } });

  const backupCard = h('div', { class: 'card set-card' },
    h('h3', null, '💾 Copia de seguridad'),
    h('p', null, 'Tus registros solo están guardados en este dispositivo. Si borras los datos de Safari o cambias de iPhone, se pierden. Exporta una copia de vez en cuando y guárdala en Archivos, iCloud o Drive.'),
    h('p', null, backupState.last ? `Última copia: ${new Date(backupState.last).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Todavía no has hecho ninguna copia.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: exportBackup }, 'Exportar copia'),
      h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Importar copia')),
    fileInput);

  const pinCard = h('div', { class: 'card set-card' }, h('h3', null, '🔒 Bloqueo con PIN'));
  if (pinConf) {
    const cur = h('input', { type: 'password', inputmode: 'numeric', placeholder: 'PIN actual', 'aria-label': 'PIN actual', maxlength: 8 });
    pinCard.append(
      h('p', null, 'Activado. La app pide el PIN al abrirse y al volver tras más de un minuto fuera.'),
      h('div', { class: 'row' }, cur, h('button', { class: 'btn danger', onclick: async () => {
        if (!(await checkPin(cur.value))) { toast('PIN incorrecto'); return; }
        await DB.del('meta', 'pin'); pinConf = null; toast('Bloqueo desactivado'); renderSettings();
      } }, 'Desactivar')));
  } else {
    const p1 = h('input', { type: 'password', inputmode: 'numeric', placeholder: 'Nuevo PIN', 'aria-label': 'Nuevo PIN', maxlength: 8 });
    const p2 = h('input', { type: 'password', inputmode: 'numeric', placeholder: 'Repetir', 'aria-label': 'Repetir PIN', maxlength: 8 });
    pinCard.append(
      h('p', null, 'Opcional. Evita que alguien que coja tu móvil desbloqueado lea tus registros. Si lo olvidas, no hay forma de recuperarlo salvo borrando los datos de la app (ten una copia).'),
      h('div', { class: 'row' }, p1, p2, h('button', { class: 'btn', onclick: async () => {
        if (!/^\d{4,8}$/.test(p1.value)) { toast('El PIN debe tener entre 4 y 8 números'); return; }
        if (p1.value !== p2.value) { toast('Los PIN no coinciden'); return; }
        const salt = Math.random().toString(36).slice(2);
        pinConf = { salt, hash: await sha(salt + p1.value) };
        await DB.put('meta', pinConf, 'pin'); toast('Bloqueo activado'); renderSettings();
      } }, 'Activar')));
  }

  const installCard = h('div', { class: 'card set-card' },
    h('h3', null, '📲 Instalar en el iPhone'),
    isStandalone()
      ? h('p', null, '✓ La app está instalada en tu pantalla de inicio.')
      : [h('p', null, 'Ábrela en Safari y:'),
        h('ol', null, h('li', null, 'Pulsa el botón Compartir (cuadrado con flecha).'), h('li', null, 'Elige «Añadir a pantalla de inicio».'), h('li', null, 'Usa siempre el icono instalado: los datos quedan guardados ahí.'))],
    persisted === true ? h('p', null, '✓ Almacenamiento persistente concedido.') : null);

  const aboutCard = h('div', { class: 'card set-card' },
    h('h3', null, 'ℹ️ Sobre esta app'),
    h('p', null, 'Es una herramienta de apoyo a la terapia, no la sustituye. Si algún día notas que todo pesa demasiado, contacta con tu psicólogo/a sin esperar a la siguiente sesión.'),
    h('p', null, 'Ningún dato sale de tu dispositivo: no hay servidor ni cuenta.'));

  view.replaceChildren(h('h1', { class: 'page-title' }, 'Ajustes'), backupCard, pinCard, installCard, aboutCard);
}

/* =====================================================================
   Navegación
   ===================================================================== */
function go(hash) { location.hash = hash; }

async function route() {
  await flushSave();
  const hash = location.hash || '#/hoy';
  let tab = 'hoy';
  if (hash.startsWith('#/dia/')) {
    const k = hash.slice(6);
    if (!isValidKey(k) || k > todayKey()) { go('#/hoy'); return; }
    tab = k === todayKey() ? 'hoy' : 'historial';
    await renderDay(k);
  } else if (hash === '#/historial') { tab = 'historial'; current = null; await renderHistory(); }
  else if (hash === '#/ajustes') { tab = 'ajustes'; current = null; await renderSettings(); }
  else { await renderDay(todayKey()); }
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  window.scrollTo({ top: 0 });
}

async function init() {
  setupLock();
  try { await DB.open(); }
  catch (e) {
    document.getElementById('view').replaceChildren(h('div', { class: 'empty' }, 'No se puede acceder al almacenamiento del navegador. Si estás en modo privado, ábrela en una ventana normal.'));
    return;
  }
  pinConf = (await DB.get('meta', 'pin')) || null;
  showLock();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await refreshBackupState();

  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); flushSave(); }
    else {
      if (pinConf && hiddenAt && Date.now() - hiddenAt > 60000) showLock();
      // Si ha cambiado el día mientras la app estaba abierta en «Hoy»
      if ((!location.hash || location.hash === '#/hoy') && current && current.date !== todayKey()) route();
    }
  });
  window.addEventListener('pagehide', flushSave);
  await route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
}

init();
