/* History: calendar of training days plus every logged workout (repeat, edit, delete). */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, icon, date, fmt, clear } = GM;
  const S = GM.store;
  const views = (GM.views = GM.views || {});

  let month = date.today().slice(0, 7) + '-01'; // first day of the visible month
  let picked = null;                             // selected day filter
  let limit = 20;

  function render(root) {
    const rerender = () => { clear(root); render(root); };
    const all = S.workoutsSorted();

    root.append(GM.ui.subnav('history'), h('header', { class: 'page-head' }, h('h1', null, 'History'),
      h('p', { class: 'muted' }, all.length ? fmt.plural(all.length, 'workout') + ' logged' : 'Finished workouts show up here.')));
    if (!all.length) {
      root.append(h('div', { class: 'empty big card' }, h('p', null, 'No workouts yet.'), h('a', { class: 'btn primary', href: '#/workout' }, 'Start your first workout')));
      return;
    }
    root.append(calendar(rerender));

    const list = all.filter((w) => !picked || w.date === picked);
    if (picked) {
      root.append(h('div', { class: 'row gap between filter-note' },
        h('span', null, 'Showing ' + date.fmt(picked, { weekday: 'long', month: 'long', day: 'numeric' })),
        h('button', { class: 'btn small ghost', type: 'button', onClick: () => { picked = null; rerender(); } }, 'Show all')));
    }
    let lastMonth = '';
    const wrap = h('div', { class: 'history' });
    list.slice(0, limit).forEach((w) => {
      const mk = w.date.slice(0, 7);
      if (mk !== lastMonth) {
        lastMonth = mk;
        wrap.appendChild(h('h3', { class: 'month-head' }, date.parse(mk + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })));
      }
      wrap.appendChild(workoutCard(w, rerender));
    });
    root.append(wrap);
    if (list.length > limit) root.append(h('button', { class: 'btn ghost more', type: 'button', onClick: () => { limit += 20; rerender(); } }, 'Show more'));
  }

  function calendar(rerender) {
    const first = date.parse(month), label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const start = date.addDays(month, -date.dow(month));
    const byDate = new Map();
    for (const w of S.state.workouts) byDate.set(w.date, (byDate.get(w.date) || 0) + 1);
    const today = date.today(), cells = [];
    for (let i = 0; i < 42; i++) {
      const iso = date.addDays(start, i), inMonth = iso.slice(0, 7) === month.slice(0, 7), n = byDate.get(iso) || 0;
      if (i >= 35 && !inMonth) break;
      cells.push(h('button', {
        type: 'button', class: 'cal-day' + (inMonth ? '' : ' out') + (n ? ' has' : '') + (iso === today ? ' today' : '') + (iso === picked ? ' sel' : ''),
        disabled: !n, 'aria-label': date.fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' }) + (n ? ', ' + fmt.plural(n, 'workout') : ''),
        'aria-pressed': n ? String(iso === picked) : null,
        onClick: () => { picked = picked === iso ? null : iso; rerender(); },
      }, h('span', null, String(date.parse(iso).getDate())), n ? h('i', { class: 'cal-dot' }) : null));
    }
    const shift = (n) => { const d = date.parse(month); d.setMonth(d.getMonth() + n); month = date.iso(d); rerender(); };
    const monthCount = S.state.workouts.filter((w) => w.date.slice(0, 7) === month.slice(0, 7)).length;
    return h('section', { class: 'card calendar' },
      h('div', { class: 'row between' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous month', onClick: () => shift(-1) }, icon('left', 20)),
        h('div', { class: 'cal-title' }, h('strong', null, label), h('span', { class: 'muted small' }, fmt.plural(monthCount, 'workout'))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next month', onClick: () => shift(1) }, icon('right', 20))),
      h('div', { class: 'cal-grid' }, date.SHORT.map((d) => h('span', { class: 'cal-dow' }, d[0])), cells));
  }

  function workoutCard(w, rerender) {
    const t = S.workoutTotals(w);
    const details = h('details', { class: 'card workout-card' },
      h('summary', null,
        h('div', { class: 'wc-main' }, h('strong', null, w.name), h('div', { class: 'muted small' }, date.fmt(w.date, { weekday: 'short', month: 'short', day: 'numeric' }))),
        h('div', { class: 'wc-stats muted small' }, fmt.plural(t.exercises, 'exercise') + ' · ' + fmt.plural(t.sets, 'set') + (t.vol ? ' · ' + S.units.fmt(t.vol, 0) : '') + (w.durationMin ? ' · ' + fmt.mins(w.durationMin) : ''))),
      h('div', { class: 'wc-body' },
        h('ul', { class: 'wc-list' }, w.entries.map((e) => {
          const ex = GM.catalog.get(e.ex);
          return h('li', null, GM.ui.thumb(ex || { name: '?' }, 40),
            h('div', null, h('div', { class: 'ex-name' }, ex ? ex.name : 'Unknown exercise'),
              h('div', { class: 'muted small' }, GM.ui.setsText(GM.catalog.kind(ex), e.sets)), e.note ? h('div', { class: 'muted small note' }, '“' + e.note + '”') : null));
        })),
        w.notes ? h('p', { class: 'muted note' }, 'Notes: ' + w.notes) : null,
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn small', type: 'button', onClick: async () => {
            if (S.state.draft && !(await GM.ui.confirm('Replace your current workout?', 'You have a workout in progress. Starting this one discards it.', { ok: 'Start new', danger: true }))) return;
            S.repeatWorkout(w.id); GM.app.go('workout');
          } }, icon('copy', 14), ' Repeat'),
          h('button', { class: 'btn small ghost', type: 'button', onClick: async () => {
            if (S.state.draft && !(await GM.ui.confirm('Replace your current workout?', 'You have a workout in progress. Editing this one discards it.', { ok: 'Edit anyway', danger: true }))) return;
            S.editWorkout(w.id); GM.app.go('workout');
          } }, icon('edit', 14), ' Edit'),
          h('button', { class: 'btn small ghost danger', type: 'button', onClick: () => {
            const gone = S.deleteWorkout(w.id);
            rerender();
            GM.ui.toast('Workout deleted', { action: { label: 'Undo', onClick: () => { S.restoreWorkout(gone); rerender(); } } });
          } }, icon('trash', 14), ' Delete'))));
    return details;
  }

  views.history = { render };
})();
