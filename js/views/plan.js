/* Weekly plan: name each day (e.g. "Chest day"), choose its exercises with target sets x reps. */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, icon, date, fmt, clear, clone } = GM;
  const S = GM.store;
  const views = (GM.views = GM.views || {});

  const open = new Set([date.dow(date.today())]); // expanded day cards
  const SUGGESTIONS = ['Chest day', 'Back day', 'Leg day', 'Shoulder day', 'Arm day', 'Push day', 'Pull day', 'Upper body', 'Lower body', 'Full body', 'Cardio & abs'];

  function render(root) {
    const plan = S.state.plan, todayIdx = date.dow(date.today());
    const rerender = () => { clear(root); render(root); };

    const planned = S.plannedCount();
    const exCount = plan.reduce((n, d) => n + (d.rest ? 0 : d.items.length), 0);

    root.append(
      h('header', { class: 'page-head row between wrap gap' },
        h('div', null, h('h1', null, 'Weekly plan'),
          h('p', { class: 'muted' }, planned ? fmt.plural(planned, 'training day') + ' · ' + fmt.plural(exCount, 'planned exercise') : 'Name your days and pick exercises. You can change it any time.')),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn', type: 'button', onClick: () => templates(rerender) }, 'Templates'),
          h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => {
            if (await GM.ui.confirm('Clear the whole week?', 'All days and planned exercises will be removed. Your logged workouts are not affected.', { ok: 'Clear plan', danger: true })) {
              S.state.plan = Array.from({ length: 7 }, S.blankDay); S.save(); rerender();
            }
          } }, 'Clear')),
      ),
      h('datalist', { id: 'day-names' }, SUGGESTIONS.map((s) => h('option', { value: s }))),
      h('div', { class: 'days' }, plan.map((d, i) => dayCard(d, i, i === todayIdx, rerender))));
  }

  function dayCard(d, i, isToday, rerender) {
    const isOpen = open.has(i);
    const parts = [...new Set(d.items.map((it) => (GM.catalog.get(it.ex) || {}).part).filter(Boolean))];
    const summary = d.rest ? 'Rest day' : d.items.length
      ? fmt.plural(d.items.length, 'exercise') + ' · ' + parts.map(GM.catalog.partLabel).join(', ')
      : 'No exercises yet';

    const nameIn = h('input', {
      type: 'text', list: 'day-names', class: 'day-name', value: d.name, maxlength: '40',
      placeholder: d.rest ? 'Rest' : 'Name this day (e.g. Chest day)', 'aria-label': date.DAYS[i] + ' workout name',
      onInput: (e) => { d.name = e.target.value; S.saveSoon(); },
    });
    const head = h('div', { class: 'day-head' },
      h('button', { class: 'day-toggle', type: 'button', 'aria-expanded': String(isOpen), 'aria-label': (isOpen ? 'Collapse ' : 'Expand ') + date.DAYS[i], onClick: () => { if (open.has(i)) open.delete(i); else open.add(i); rerender(); } },
        h('span', { class: 'day-dow' }, date.SHORT[i]), icon(isOpen ? 'up' : 'down', 18)),
      h('div', { class: 'day-main' }, nameIn, h('div', { class: 'muted small' }, summary)),
      isToday ? h('span', { class: 'tag accent' }, 'Today') : null,
      h('button', { class: 'btn small ' + (d.rest ? 'primary' : 'ghost'), type: 'button', 'aria-pressed': String(d.rest), onClick: () => { d.rest = !d.rest; S.save(); rerender(); } }, icon('moon', 14), ' Rest'));

    const card = h('section', { class: 'card day' + (d.rest ? ' rest' : '') + (isToday ? ' today' : '') }, head);
    if (!isOpen) return card;

    const body = h('div', { class: 'day-body' });
    if (d.rest) {
      body.appendChild(h('p', { class: 'muted' }, 'Recovery day. Tap "Rest" again if you want to train.'));
    } else {
      body.appendChild(h('div', { class: 'chips', role: 'group', 'aria-label': 'Focus' },
        h('span', { class: 'muted small chip-label' }, 'Focus:'),
        GM.catalog.PARTS.map((p) => h('button', {
          type: 'button', class: 'chip small' + (d.parts.includes(p) ? ' on' : ''), 'aria-pressed': String(d.parts.includes(p)),
          onClick: () => { const k = d.parts.indexOf(p); if (k >= 0) d.parts.splice(k, 1); else d.parts.push(p); S.save(); rerender(); },
        }, GM.catalog.partLabel(p)))));

      if (d.items.length) body.appendChild(h('div', { class: 'plan-items' }, d.items.map((it, k) => itemRow(d, it, k, rerender))));
      else body.appendChild(h('div', { class: 'empty' }, 'Add the exercises you do on this day.'));

      body.appendChild(h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn primary', type: 'button', onClick: () => {
          const focus = d.parts.length ? d.parts : GM.catalog.guessParts(d.name);
          GM.ui.pickExercises({ title: 'Add to ' + (d.name.trim() || date.DAYS[i]), parts: focus, onDone: (ids) => {
            ids.forEach((id) => { const ex = GM.catalog.get(id); const t = GM.catalog.kind(ex) === 'time'; d.items.push({ ex: id, sets: t ? 1 : 3, reps: t ? 20 : 10 }); });
            S.save(); rerender();
          } });
        } }, icon('plus'), ' Add exercises'),
        d.items.length ? h('button', { class: 'btn', type: 'button', onClick: async () => {
          if (S.state.draft && !(await GM.ui.confirm('Replace your current workout?', 'You have a workout in progress. Starting this one discards it.', { ok: 'Start new', danger: true }))) return;
          S.startFromPlan(i); GM.app.go('workout');
        } }, icon('play', 16), ' Start now') : null,
        d.items.length ? h('button', { class: 'btn ghost', type: 'button', onClick: () => copyTo(i, rerender) }, icon('copy', 16), ' Copy to…') : null));
    }
    card.appendChild(body);
    return card;
  }

  function itemRow(d, it, k, rerender) {
    const ex = GM.catalog.get(it.ex) || { id: it.ex, name: 'Unknown exercise', part: '', equip: '' };
    const time = GM.catalog.kind(ex) === 'time';
    const num = (key, label, max) => h('label', { class: 'mini-field' },
      h('input', {
        type: 'number', inputmode: 'numeric', min: '1', max: String(max), class: 'num sm', value: it[key],
        onInput: (e) => { const v = Math.round(+e.target.value); if (v > 0) { it[key] = Math.min(v, max); S.saveSoon(); } },
      }), h('span', { class: 'muted tiny' }, label));
    const swap = (j) => { if (j < 0 || j >= d.items.length) return; [d.items[k], d.items[j]] = [d.items[j], d.items[k]]; S.save(); rerender(); };
    return h('div', { class: 'plan-item' },
      h('button', { class: 'thumb-btn', type: 'button', 'aria-label': 'Details for ' + ex.name, onClick: () => GM.ui.exerciseDetail(ex, { onChange: rerender }) }, GM.ui.thumb(ex, 44)),
      h('div', { class: 'plan-item-name' }, h('div', { class: 'ex-name' }, ex.name), h('div', { class: 'ex-meta' }, GM.ui.metaLine(ex))),
      h('div', { class: 'plan-nums' }, num('sets', 'sets', 20), h('span', { class: 'muted' }, '×'), num('reps', time ? 'min' : 'reps', 999)),
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', disabled: k === 0, onClick: () => swap(k - 1) }, icon('up', 18)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move down', disabled: k === d.items.length - 1, onClick: () => swap(k + 1) }, icon('down', 18)),
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Remove', onClick: () => { d.items.splice(k, 1); S.save(); rerender(); } }, icon('trash', 18))));
  }

  function copyTo(src, rerender) {
    const picked = new Set();
    const m = GM.ui.modal({
      title: 'Copy ' + date.DAYS[src] + ' to…',
      body: h('div', { class: 'list' }, date.DAYS.map((name, i) => i === src ? null :
        h('label', { class: 'list-row check-row' }, h('span', null, name),
          h('input', { type: 'checkbox', onChange: (e) => { if (e.target.checked) picked.add(i); else picked.delete(i); } })))),
      footer: [h('button', { class: 'btn ghost', type: 'button', onClick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'button', onClick: () => {
          const from = S.state.plan[src];
          picked.forEach((i) => { S.state.plan[i] = { name: from.name, rest: false, parts: from.parts.slice(), items: clone(from.items) }; });
          S.save(); m.close(); GM.ui.toast('Copied to ' + fmt.plural(picked.size, 'day')); rerender();
        } }, 'Copy')],
    });
  }

  function templates(rerender) {
    const m = GM.ui.modal({
      title: 'Start from a template',
      body: h('div', null,
        h('p', { class: 'muted' }, 'Fills your week with a classic split and sensible exercises. Edit anything afterwards.'),
        h('div', { class: 'list' }, GM.catalog.templates.map((t) =>
          h('div', { class: 'list-row' },
            h('div', null, h('strong', null, t.name), h('div', { class: 'muted small' }, t.desc)),
            h('button', { class: 'btn', type: 'button', onClick: async () => {
              const has = S.state.plan.some((d) => d.name || d.items.length || d.rest);
              if (has && !(await GM.ui.confirm('Replace your current plan?', 'The template overwrites all seven days.', { ok: 'Replace', danger: true }))) return;
              S.state.plan = GM.catalog.buildTemplate(t); S.save(); m.close(); rerender();
              GM.ui.toast('Applied "' + t.name + '"');
            } }, 'Use'))))),
      footer: h('button', { class: 'btn ghost', type: 'button', onClick: () => m.close() }, 'Close'),
    });
  }

  views.plan = { render };
})();
