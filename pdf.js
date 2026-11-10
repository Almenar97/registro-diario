'use strict';
/* Generación de PDF en el propio dispositivo (jsPDF). Usa printable(), dayStats() y fechas de app.js. */

const PDF = (() => {
  const PAGE_W = 210, PAGE_H = 297, M = 18, W = PAGE_W - 2 * M, BOTTOM = PAGE_H - 20;
  const PT = 0.3528; // mm por punto
  const C = {
    text: [43, 42, 39], muted: [112, 108, 100], line: [222, 217, 207], soft: [246, 244, 239],
    manana: [176, 112, 40], dia: [69, 112, 94], noche: [80, 94, 145],
  };

  // Las fuentes estándar de PDF solo cubren Latin-1: se sustituyen los signos que no entran
  // (los emojis se omiten).
  function clean(s) {
    return String(s)
      .replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
      .replace(/[—–−]/g, '-')
      .replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'")
      .replace(/…/g, '...').replace(/[→➡]/g, '->').replace(/←/g, '<-')
      .replace(/[•●]/g, '·').replace(/ /g, ' ')
      .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '')
      .replace(/[ \t]+\n/g, '\n');
  }

  function create() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: 'Registro diario', creator: 'Registro diario' });
    const ctx = { doc, y: M };

    ctx.ensure = (hgt) => { if (ctx.y + hgt > BOTTOM) { doc.addPage(); ctx.y = M; } };
    ctx.text = (str, { size = 10.5, style = 'normal', color = C.text, indent = 0, lh = 1.4, after = 0, keep = 0 } = {}) => {
      doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
      const lineH = size * PT * lh;
      const lines = doc.splitTextToSize(clean(str), W - indent);
      ctx.ensure(lineH * Math.min(lines.length, 2) + keep);
      for (const ln of lines) {
        ctx.ensure(lineH);
        doc.text(ln, M + indent, ctx.y + size * PT * 0.85);
        ctx.y += lineH;
      }
      ctx.y += after;
    };
    ctx.rule = (color = C.line, width = 0.3) => {
      doc.setDrawColor(...color); doc.setLineWidth(width);
      doc.line(M, ctx.y, M + W, ctx.y);
    };
    return ctx;
  }

  function footer(doc, label) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C.muted);
      doc.text(clean(label), M, PAGE_H - 10);
      doc.text(`${i} / ${n}`, PAGE_W - M, PAGE_H - 10, { align: 'right' });
    }
  }

  function drawDay(ctx, rec) {
    const { doc } = ctx;
    ctx.text('REGISTRO DIARIO', { size: 8.5, style: 'bold', color: C.dia, after: 0.5 });
    ctx.text(fmtLong(rec.date), { size: 19, style: 'bold', lh: 1.25, after: 1 });
    const gen = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.text(`${rec.closed ? 'Día cerrado' : 'Borrador (día sin cerrar)'} · PDF generado el ${gen}`, { size: 9, color: C.muted, after: 3 });
    ctx.rule(C.line, 0.4);
    ctx.y += 6;

    for (const b of printable(rec)) {
      const col = C[b.id] || C.dia;
      const visible = b.sections.filter((s) => s.items.length || !s.optional);
      if (!visible.length) continue;
      ctx.ensure(30);
      ctx.text(b.title.toUpperCase(), { size: 9, style: 'bold', color: col, after: 1 });
      ctx.rule(col, 0.6);
      ctx.y += 5;

      for (const s of visible) {
        ctx.text(s.title, { size: 13, style: 'bold', lh: 1.3, keep: 14 });
        ctx.text(s.subtitle, { size: 9, style: 'italic', color: C.muted, after: 2.5 });
        if (!s.items.length) { ctx.text('Sin registro', { size: 10, style: 'italic', color: C.muted, after: 5 }); continue; }

        s.items.forEach((it, idx) => {
          if (idx > 0) { ctx.y += 1; ctx.ensure(12); doc.setLineDashPattern([1, 1], 0); ctx.rule(); doc.setLineDashPattern([], 0); ctx.y += 3.5; }
          if (it.label) ctx.text(it.label, { size: 10.5, style: 'bold', color: col, keep: 10 });
          if (it.meta) ctx.text(it.meta, { size: 9, color: C.muted, after: 1 });
          for (const f of it.fields) {
            if (s.id === 'reflexiones') { ctx.text(f.value || '-', { size: 10.5, after: 2 }); continue; }
            ctx.text(f.label, { size: 9, style: 'bold', color: C.muted, lh: 1.3, indent: 3, keep: 5 });
            ctx.text(f.value || '-', { size: 10.5, color: f.value ? C.text : C.muted, indent: 3, after: 1.8 });
          }
        });
        ctx.y += 5;
      }
      ctx.y += 2;
    }
  }

  const fmt1 = (n) => n.toFixed(1).replace('.', ',');
  const intensTxt = (count, it) => (count ? `${count}${it ? ` · ${fmt1(it.antes)} -> ${fmt1(it.despues)}` : ''}` : '-');

  function topCounts(arr, n = 4) {
    const m = new Map();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (${v})`).join(', ');
  }

  function drawWeekSummary(ctx, monday, recs) {
    const { doc } = ctx;
    const sunday = addDays(monday, 6);
    ctx.text('REGISTRO DIARIO · RESUMEN SEMANAL', { size: 8.5, style: 'bold', color: C.dia, after: 0.5 });
    ctx.text(`Semana del ${keyToDate(monday).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} al ${fmtDayMonthYear(sunday)}`, { size: 17, style: 'bold', lh: 1.25, after: 3 });
    ctx.rule(C.line, 0.4); ctx.y += 6;

    const cols = [
      { t: 'Día', w: 42 }, { t: 'Activ.', w: 18 }, { t: 'Rumiación', w: 38 }, { t: 'Añoranza', w: 38 }, { t: 'Pens. neg.', w: W - 136 },
    ];
    const rowH = 8;
    const drawRow = (vals, { bold = false, fill = null } = {}) => {
      ctx.ensure(rowH);
      if (fill) { doc.setFillColor(...fill); doc.rect(M, ctx.y, W, rowH, 'F'); }
      let x = M;
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9.5); doc.setTextColor(...C.text);
      vals.forEach((v, i) => { doc.text(clean(v), x + 2, ctx.y + 5.4); x += cols[i].w; });
      ctx.y += rowH;
      doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(M, ctx.y, M + W, ctx.y);
    };
    drawRow(cols.map((c) => c.t), { bold: true, fill: C.soft });

    const all = { act: 0, rum: [], ano: [], neg: 0, etiquetas: [], emociones: [] };
    const byDate = new Map(recs.map((r) => [r.date, r]));
    for (let i = 0; i < 7; i++) {
      const k = addDays(monday, i);
      const label = cap(keyToDate(k).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }));
      const r = byDate.get(k);
      if (!r) { drawRow([label, '-', '-', '-', '-']); continue; }
      const st = dayStats(r);
      all.act += st.actividades; all.neg += st.negativos;
      all.etiquetas.push(...st.etiquetas); all.emociones.push(...st.emociones);
      for (const sid of ['rumiacion', 'anoranza']) {
        for (const it of (r.data[sid] || []).filter(itemHasContent)) (sid === 'rumiacion' ? all.rum : all.ano).push(it);
      }
      drawRow([label, String(st.actividades || '-'), intensTxt(st.rumiacion, st.rumInt), intensTxt(st.anoranza, st.anoInt), String(st.negativos || '-')]);
    }
    const avgInt = (arr) => {
      const both = arr.filter((it) => typeof it.int_antes === 'number' && typeof it.int_despues === 'number');
      if (!both.length) return null;
      const avg = (k) => both.reduce((a, it) => a + it[k], 0) / both.length;
      return { antes: avg('int_antes'), despues: avg('int_despues') };
    };
    drawRow(['Total semana', String(all.act || '-'), intensTxt(all.rum.length, avgInt(all.rum)), intensTxt(all.ano.length, avgInt(all.ano)), String(all.neg || '-')], { bold: true, fill: C.soft });
    ctx.y += 3;
    ctx.text('Rumiación y añoranza: número de registros · intensidad media antes -> después (0-10), solo de los registros con ambas marcadas.', { size: 8.5, style: 'italic', color: C.muted, after: 5 });

    if (all.etiquetas.length) ctx.text(`Etiquetas más frecuentes (rumiación): ${topCounts(all.etiquetas)}`, { size: 10, after: 1.5 });
    if (all.emociones.length) ctx.text(`Emociones más frecuentes (añoranza): ${topCounts(all.emociones)}`, { size: 10, after: 1.5 });
  }

  function day(rec) {
    const ctx = create();
    drawDay(ctx, rec);
    footer(ctx.doc, `Registro diario · ${fmtDayMonthYear(rec.date)}`);
    return ctx.doc.output('blob');
  }

  function week(monday, recs) {
    const ctx = create();
    recs = recs.slice().sort((a, b) => a.date.localeCompare(b.date));
    drawWeekSummary(ctx, monday, recs);
    for (const r of recs) {
      if (!Object.values(r.data || {}).some((arr) => (arr || []).some(itemHasContent))) continue;
      ctx.doc.addPage(); ctx.y = M;
      drawDay(ctx, r);
    }
    footer(ctx.doc, `Registro diario · semana del ${fmtDayMonthYear(monday)}`);
    return ctx.doc.output('blob');
  }

  return { day, week };
})();
