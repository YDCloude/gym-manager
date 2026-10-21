/* Progress: weekly consistency, per-body-part volume, per-exercise trends, personal bests, body weight. */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, icon, date, fmt, clear } = GM;
  const S = GM.store;
  const views = (GM.views = GM.views || {});

  let weekMetric = 'count';   // count | sets | vol
  let exId = null;            // exercise shown in the trend chart
  let exMetric = 'topW';      // topW | e1 | vol | mins

  const WEEK_METRICS = [{ value: 'count', label: 'Workouts' }, { value: 'sets', label: 'Sets' }, { value: 'vol', label: 'Volume' }];

  function weeklySection() {
    const series = S.weeklySeries(12);
    const u = S.units;
    const val = (w) => weekMetric === 'vol' ? +(u.toDisp(w.vol) || 0).toFixed(0) : w[weekMetric];
    const unitLabel = weekMetric === 'vol' ? ' ' + u.unit : '';
    const holder = h('div');
    const paint = () => {
      clear(holder).appendChild(GM.charts.columns(series.map((w) => ({
        label: date.fmt(w.start, { month: 'short', day: 'numeric' }), value: val(w),
        tip: ['Week of ' + date.fmt(w.start, { month: 'short', day: 'numeric' }), fmt.plural(w.count, 'workout'), fmt.plural(w.sets, 'set'), w.vol ? 'Volume ' + u.fmt(w.vol, 0) : 'No weighted volume'],
      })), { label: 'Weekly ' + weekMetric, integer: true }));
    };
    const total = series.reduce((n, w) => n + w.count, 0);
    paint();
    return h('section', { class: 'card' },
      h('div', { class: 'row between wrap gap' },
        h('div', null, h('h2', null, 'Last 12 weeks'), h('p', { class: 'muted small' }, fmt.plural(total, 'workout') + ' · ' + fmt.num(total / 12, 1) + ' per week on average' + (weekMetric === 'vol' ? ' · volume in ' + u.unit : ''))),
        GM.ui.segmented(WEEK_METRICS, weekMetric, (v) => { weekMetric = v; paint(); })),
      holder);
  }

  function partSection() {
    const rows = S.setsByPart(30);
    if (!rows.length) return null;
    const max = rows[0].sets;
    return h('section', { class: 'card' },
      h('h2', null, 'Sets by body part'), h('p', { class: 'muted small' }, 'Last 30 days. A quick check that nothing is being skipped.'),
      h('div', { class: 'hbars' }, rows.map((r) =>
        h('div', { class: 'hbar-row', title: GM.catalog.partLabel(r.part) + ': ' + fmt.plural(r.sets, 'set') },
          h('span', { class: 'hbar-label' }, GM.catalog.partLabel(r.part)),
          h('div', { class: 'hbar-track' },
            h('div', { class: 'hbar-bar' }, h('div', { class: 'hbar-fill', style: { width: Math.max(2, (100 * r.sets) / max) + '%' } })),
            h('span', { class: 'hbar-val' }, String(r.sets)))))));
  }

  function exerciseSection() {
    const counts = [...S.performedSet()].map((id) => ({ id, ex: GM.catalog.get(id), n: S.performedCount(id) })).filter((x) => x.ex).sort((a, b) => b.n - a.n || a.ex.name.localeCompare(b.ex.name));
    if (!counts.length) return h('section', { class: 'card' }, h('h2', null, 'Exercise progress'), h('div', { class: 'empty' }, 'Log a workout and your lifts will be charted here.'));
    if (!exId || !counts.some((c) => c.id === exId)) exId = counts[0].id;
    const body = h('div');
    const sel = GM.ui.select(counts.map((c) => ({ value: c.id, label: c.ex.name + ' (' + c.n + '×)' })), exId, (v) => { exId = v; paint(); }, 'sel wide');
    const metricHolder = h('div');

    function paint() {
      const ex = GM.catalog.get(exId), kind = GM.catalog.kind(ex), u = S.units;
      const hist = S.history(exId);
      const metrics = kind === 'time' ? [{ value: 'mins', label: 'Minutes' }] : [{ value: 'topW', label: 'Top weight' }, { value: 'e1', label: 'Est. 1RM' }, { value: 'vol', label: 'Volume' }];
      if (!metrics.some((m) => m.value === exMetric)) exMetric = metrics[0].value;
      // Bodyweight-only exercises: chart reps instead of weight.
      const stats = hist.map((x) => ({ x, s: S.sessionStats(kind, x.sets) }));
      const weighted = stats.some((r) => r.s.topW > 0);
      const conv = (m, s) => (m === 'mins' ? s.mins : m === 'topW' ? (weighted ? u.toDisp(s.topW) : s.maxReps) : m === 'e1' ? u.toDisp(s.e1) : u.toDisp(s.vol));
      const unitText = exMetric === 'mins' ? 'min' : exMetric === 'topW' && !weighted ? 'reps' : u.unit;
      const pts = stats.filter((r) => conv(exMetric, r.s) > 0).map((r) => ({
        x: r.x.date, y: +conv(exMetric, r.s).toFixed(2),
        tip: [date.fmt(r.x.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), fmt.num(conv(exMetric, r.s)) + ' ' + unitText, GM.ui.setsText(kind, r.x.sets)],
      }));

      clear(metricHolder).appendChild(GM.ui.segmented(metrics, exMetric, (v) => { exMetric = v; paint(); }));
      clear(body);
      body.append(
        pts.length ? GM.charts.line(pts, { fmtY: (v) => fmt.num(v) + ' ' + unitText, label: ex.name + ' ' + exMetric })
          : h('div', { class: 'empty' }, 'Nothing to chart yet for this metric. Log weights and reps to see a trend.'),
        records(ex, kind, weighted),
        sessionsTable(ex, kind, stats));
    }
    function records(ex, kind, weighted) {
      const b = S.best(exId), u = S.units;
      const tiles = kind === 'time'
        ? [tile('Sessions', b.sessions), tile('Longest', fmt.mins(b.mins))]
        : weighted
          ? [tile('Heaviest set', b.topSet ? u.fmt(b.topSet.w) + ' × ' + b.topSet.r : '–'), tile('Est. 1RM', b.e1 ? u.fmt(b.e1, 0) : '–'), tile('Best session volume', u.fmt(b.vol, 0)), tile('Sessions', b.sessions)]
          : [tile('Most reps in a set', b.maxReps), tile('Sessions', b.sessions)];
      return h('div', { class: 'stats-grid tight' }, tiles);
    }
    const tile = (l, v) => h('div', { class: 'stat-tile' }, h('div', { class: 'stat-label' }, l), h('div', { class: 'stat-value sm' }, String(v)));
    function sessionsTable(ex, kind, stats) {
      const rows = stats.slice(-8).reverse();
      return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Sets'), kind === 'time' ? null : h('th', { class: 'r' }, 'Volume'))),
        h('tbody', null, rows.map((r) => h('tr', null,
          h('td', null, date.fmt(r.x.date, { month: 'short', day: 'numeric', year: 'numeric' })),
          h('td', null, GM.ui.setsText(kind, r.x.sets)),
          kind === 'time' ? null : h('td', { class: 'r' }, r.s.vol ? S.units.fmt(r.s.vol, 0) : '–'))))));
    }
    paint();
    return h('section', { class: 'card' },
      h('h2', null, 'Exercise progress'),
      h('div', { class: 'row gap wrap between' }, sel, metricHolder), body);
  }

  function bodyWeightSection() {
    const u = S.units, list = S.state.weights;
    const holder = h('div');
    const dIn = h('input', { type: 'date', value: date.today(), max: date.today(), 'aria-label': 'Date' });
    const wIn = h('input', { type: 'number', step: 'any', min: '0', inputmode: 'decimal', class: 'num', placeholder: u.unit, 'aria-label': 'Body weight (' + u.unit + ')' });
    function paint() {
      clear(holder);
      const ws = S.state.weights;
      if (ws.length) {
        const pts = ws.map((w) => ({ x: w.date, y: +u.toDisp(w.kg).toFixed(1), tip: [date.fmt(w.date, { month: 'short', day: 'numeric', year: 'numeric' }), fmt.num(u.toDisp(w.kg)) + ' ' + u.unit] }));
        holder.append(GM.charts.line(pts, { height: 180, fmtY: (v) => fmt.num(v) + ' ' + u.unit, label: 'Body weight' }),
          h('div', { class: 'chips recent-weights' }, ws.slice(-6).reverse().map((w) =>
            h('span', { class: 'chip static' }, date.fmt(w.date, { month: 'short', day: 'numeric' }) + ': ' + fmt.num(u.toDisp(w.kg)) + ' ' + u.unit,
              h('button', { class: 'chip-x', type: 'button', 'aria-label': 'Delete entry', onClick: () => { S.removeWeight(w.date); paint(); } }, icon('x', 12))))));
      } else holder.append(h('div', { class: 'empty' }, 'No entries yet. Add your weight to see the trend.'));
    }
    paint();
    return h('section', { class: 'card' },
      h('h2', null, 'Body weight'),
      h('form', { class: 'row gap wrap', onSubmit: (e) => {
        e.preventDefault();
        const kg = u.fromDisp(wIn.value);
        if (!kg || kg <= 0 || !dIn.value) { GM.ui.toast('Enter a date and a weight.'); return; }
        S.addWeight(dIn.value, kg); wIn.value = ''; paint(); GM.ui.toast('Saved');
      } }, dIn, wIn, h('button', { class: 'btn', type: 'submit' }, icon('plus', 16), ' Add')),
      holder);
  }

  views.progress = {
    render(root) {
      GM.put(root, GM.ui.subnav('progress'), h('header', { class: 'page-head' }, h('h1', null, 'Progress'), h('p', { class: 'muted' }, 'Hover or tap the charts for exact numbers.')),
        weeklySection(), exerciseSection(), partSection(), bodyWeightSection());
    },
  };
})();
