/* Workout screen: start a session, then log exercises -> sets (weight x reps) with last-time hints and a rest timer. */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, icon, date, fmt, clear } = GM;
  const S = GM.store;
  const views = (GM.views = GM.views || {});

  let timerId = null;
  const stopTimer = () => { if (timerId) { clearInterval(timerId); timerId = null; } };

  /* ---------- Start screen (no workout in progress) ---------- */
  function renderStart(root) {
    const todayIdx = date.dow(date.today());
    const recents = S.workoutsSorted().slice(0, 5);
    const planned = S.state.plan.map((d, i) => ({ d, i })).filter((x) => !x.d.rest && x.d.items.length);
    GM.put(root,
      h('header', { class: 'page-head' }, h('h1', null, 'Start a workout'), h('p', { class: 'muted' }, 'Pick a plan day, repeat a session, or build one as you go.')),
      h('section', { class: 'card' },
        h('h2', null, 'Empty workout'),
        h('p', { class: 'muted' }, 'Name it (e.g. "Chest day") and add the exercises you do.'),
        h('button', { class: 'btn primary', type: 'button', onClick: () => { S.startWorkout({ name: '' }); GM.app.refresh(); } }, icon('plus'), ' Start empty workout')),
      h('section', { class: 'card' },
        h('h2', null, 'From your weekly plan'),
        planned.length
          ? h('div', { class: 'list' }, planned.map(({ d, i }) =>
              h('div', { class: 'list-row' },
                h('div', null, h('strong', null, d.name.trim() || date.DAYS[i]), i === todayIdx ? h('span', { class: 'tag accent' }, 'Today') : null,
                  h('div', { class: 'muted small' }, date.DAYS[i] + ' · ' + fmt.plural(d.items.length, 'exercise'))),
                h('button', { class: 'btn', type: 'button', onClick: () => { S.startFromPlan(i); GM.app.refresh(); } }, icon('play', 16), ' Start'))))
          : h('p', { class: 'muted' }, 'No planned workouts yet. ', h('a', { href: '#/plan' }, 'Set up your week'), '.')),
      recents.length ? h('section', { class: 'card' },
        h('h2', null, 'Repeat a recent workout'),
        h('div', { class: 'list' }, recents.map((w) =>
          h('div', { class: 'list-row' },
            h('div', null, h('strong', null, w.name), h('div', { class: 'muted small' }, date.rel(w.date) + ' · ' + fmt.plural(w.entries.length, 'exercise'))),
            h('button', { class: 'btn', type: 'button', onClick: () => { S.repeatWorkout(w.id); GM.app.refresh(); } }, icon('copy', 16), ' Repeat'))))) : null);
  }

  /* ---------- Active workout ---------- */
  function renderActive(root) {
    const d = S.state.draft;
    const kindOf = (exId) => GM.catalog.kind(GM.catalog.get(exId));
    const excl = () => ({ excludeWid: d.editingId || d.id, before: d.date });

    const timeEl = h('span', { class: 'big-time' });
    const statsEl = h('div', { class: 'live-stats' });
    const list = h('div', { class: 'entries' });

    function totals() {
      let sets = 0, vol = 0, ex = 0;
      for (const e of d.entries) {
        const k = kindOf(e.ex); let any = false;
        for (const s of e.sets) { if (!s.done) continue; sets++; any = true; if (k !== 'time') vol += (+s.w || 0) * (+s.r || 0); }
        if (any) ex++;
      }
      return { sets, vol, ex };
    }
    function paintStats() {
      const t = totals();
      GM.put(clear(statsEl),
        h('strong', null, fmt.plural(t.sets, 'set')),
        h('span', { class: 'muted' }, (t.vol ? ' · ' + S.units.fmt(t.vol, 0) : '') + ' · ' + t.ex + '/' + d.entries.length + ' exercises'));
    }
    const stat = (l, v) => h('div', { class: 'mini-stat' }, h('div', { class: 'mini-val' }, v), h('div', { class: 'muted tiny' }, l));
    function paintTime() {
      timeEl.textContent = d.editingId ? 'Editing' : fmt.clock((Date.now() - d.startedAt) / 1000);
    }
    stopTimer(); paintTime();
    if (!d.editingId) timerId = setInterval(paintTime, 1000);

    /* One exercise card. Re-rendered on its own when sets are added/removed. */
    function entryCard(entry) {
      const ex = GM.catalog.get(entry.ex) || { id: entry.ex, name: 'Unknown exercise', part: '', equip: '', target: '' };
      const kind = kindOf(entry.ex);
      const card = h('article', { class: 'card entry' });
      const prev = S.lastSession(entry.ex, excl());

      function prevText(i) {
        if (!prev) return '–';
        const ps = prev.sets[i];
        if (!ps) return '–';
        return kind === 'time' ? (ps.r || 0) + ' min' : (ps.w ? fmt.num(S.units.toDisp(ps.w)) + '×' : '') + (ps.r || 0);
      }
      const prBadge = h('span', { class: 'pr-badge', hidden: true }, icon('trophy', 14), h('span'));
      function paintPR() {
        const pr = S.prCheck(entry.ex, entry.sets, excl());
        prBadge.hidden = !pr;
        if (pr) prBadge.lastChild.textContent = pr.labels[0];
      }
      function setRow(s, i) {
        const doneBtn = h('button', { class: 'check' + (s.done ? ' on' : ''), type: 'button', 'aria-label': 'Mark set ' + (i + 1) + ' done', 'aria-pressed': String(!!s.done) }, icon('check', 18));
        const row = h('div', { class: 'set-row' + (s.done ? ' done' : ''), dataset: { kind } });
        const wIn = kind === 'time' ? null : h('input', {
          type: 'number', inputmode: 'decimal', step: 'any', min: '0', class: 'num', placeholder: prev && prev.sets[i] && prev.sets[i].w ? String(S.units.toDisp(prev.sets[i].w)) : (ex.equip === 'body weight' ? 'BW' : ''),
          value: s.w == null ? '' : S.units.toDisp(s.w), 'aria-label': 'Weight (' + S.units.unit + ') for set ' + (i + 1),
          onInput: (e) => { s.w = S.units.fromDisp(e.target.value); S.saveSoon(); paintPR(); paintStats(); },
          onFocus: (e) => { const t = e.target; setTimeout(() => t.select && t.select(), 0); },
        });
        const rIn = h('input', {
          type: 'number', inputmode: 'numeric', step: '1', min: '0', class: 'num', placeholder: prev && prev.sets[i] && prev.sets[i].r ? String(prev.sets[i].r) : '',
          value: s.r == null ? '' : s.r, 'aria-label': (kind === 'time' ? 'Minutes' : 'Reps') + ' for set ' + (i + 1),
          onInput: (e) => { s.r = e.target.value === '' ? null : +e.target.value; S.saveSoon(); paintPR(); paintStats(); },
          onFocus: (e) => { const t = e.target; setTimeout(() => t.select && t.select(), 0); },
        });
        doneBtn.addEventListener('click', () => {
          if (!s.done) {
            // Accept the greyed-out "last time" values if the fields were left empty.
            const ps = prev && prev.sets[i];
            if ((s.r == null || s.r === '') && ps && ps.r) { s.r = ps.r; rIn.value = ps.r; }
            if (kind !== 'time' && s.w == null && ps && ps.w) { s.w = ps.w; wIn.value = S.units.toDisp(ps.w); }
            if (!(+s.r > 0)) { GM.ui.toast(kind === 'time' ? 'Enter the minutes first.' : 'Enter the reps first.'); rIn.focus(); return; }
          }
          s.done = !s.done;
          row.classList.toggle('done', s.done);
          doneBtn.classList.toggle('on', s.done);
          doneBtn.setAttribute('aria-pressed', String(s.done));
          S.saveSoon(); paintPR(); paintStats();
          if (s.done) GM.haptic(20);
          if (s.done && S.state.settings.autoRest && S.state.settings.rest > 0) GM.ui.rest.start(S.state.settings.rest);
        });
        GM.put(row,
          h('span', { class: 'set-no' }, String(i + 1)),
          h('span', { class: 'set-prev muted' }, prevText(i)),
          wIn, rIn, doneBtn,
          h('button', { class: 'icon-btn tiny-btn', type: 'button', 'aria-label': 'Remove set ' + (i + 1), onClick: () => { entry.sets.splice(i, 1); S.saveSoon(); paint(); paintStats(); } }, icon('x', 16)));
        return row;
      }
      function paint() {
        clear(card);
        const idx = d.entries.indexOf(entry);
        const noteIn = h('input', { type: 'text', class: 'note-in', placeholder: 'Note (grip, tempo, how it felt…)', value: entry.note || '', maxlength: '200', onInput: (e) => { entry.note = e.target.value; S.saveSoon(); } });
        GM.put(card,
          h('header', { class: 'entry-head' },
            h('button', { class: 'thumb-btn', type: 'button', 'aria-label': 'Show details for ' + ex.name, onClick: () => GM.ui.exerciseDetail(ex, { onChange: () => GM.app.refresh() }) }, GM.ui.thumb(ex, 52)),
            h('div', { class: 'entry-title' },
              h('div', { class: 'ex-name' }, ex.name, prBadge),
              h('div', { class: 'ex-meta' }, prev ? 'Last time (' + date.rel(prev.date).toLowerCase() + '): ' + GM.ui.setsText(kind, prev.sets) : 'First time. Everything you log here becomes your baseline.')),
            h('div', { class: 'entry-actions' },
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', disabled: idx === 0, onClick: () => move(idx, -1) }, icon('up', 18)),
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move down', disabled: idx === d.entries.length - 1, onClick: () => move(idx, 1) }, icon('down', 18)),
              h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Remove exercise', onClick: () => removeEntry(idx) }, icon('trash', 18)))),
          h('div', { class: 'set-head', dataset: { kind } },
            h('span', null, 'Set'), h('span', null, 'Last'), kind === 'time' ? null : h('span', null, S.units.unit), h('span', null, kind === 'time' ? 'Minutes' : 'Reps'), h('span', null, 'Done'), h('span')),
          entry.sets.map(setRow),
          h('div', { class: 'entry-foot' },
            h('button', { class: 'btn small ghost', type: 'button', onClick: () => {
              const l = entry.sets[entry.sets.length - 1];
              entry.sets.push({ w: l ? l.w : null, r: l ? l.r : null, done: false });
              S.saveSoon(); paint(); paintStats();
            } }, icon('plus', 16), ' Add set'),
            noteIn));
        paintPR();
      }
      paint();
      return card;
    }

    function move(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= d.entries.length) return;
      [d.entries[i], d.entries[j]] = [d.entries[j], d.entries[i]];
      S.saveSoon(); paintList();
    }
    function removeEntry(i) {
      const [gone] = d.entries.splice(i, 1);
      S.saveSoon(); paintList(); paintStats();
      GM.ui.toast('Removed exercise', { action: { label: 'Undo', onClick: () => { d.entries.splice(i, 0, gone); S.saveSoon(); paintList(); paintStats(); } } });
    }
    function paintList() {
      clear(list);
      if (!d.entries.length) list.appendChild(h('div', { class: 'empty big' }, h('p', null, 'No exercises yet.'), h('p', { class: 'muted' }, 'Tap "Add exercise" to pick from the library, e.g. your chest exercises.')));
      d.entries.forEach((e) => list.appendChild(entryCard(e)));
    }

    function addExercises() {
      const day = d.planDay != null ? S.state.plan[d.planDay] : null;
      const parts = (day && day.parts.length ? day.parts : GM.catalog.guessParts(d.name)).slice();
      GM.ui.pickExercises({
        title: 'Add exercises', parts,
        onDone: (ids) => { ids.forEach((id) => S.addEntry(id)); paintList(); paintStats(); },
      });
    }

    async function finish() {
      let markUnchecked = false;
      const open = S.uncheckedSets();
      if (open) {
        const a = await GM.ui.dialog({
          title: 'Some sets are not checked',
          message: fmt.plural(open, 'set') + ' with reps entered ' + (open === 1 ? 'is' : 'are') + ' not marked done. Save ' + (open === 1 ? 'it' : 'them') + ' anyway?',
          buttons: [{ label: 'Keep editing', value: null, kind: 'ghost' }, { label: 'Skip them', value: 'skip' }, { label: 'Save them too', value: 'mark', kind: 'primary' }],
        });
        if (!a) return;
        markUnchecked = a === 'mark';
      }
      const res = S.finishDraft({ markUnchecked });
      if (res && res.empty) {
        GM.ui.toast('Nothing to save yet. Check off at least one set.');
        return;
      }
      stopTimer(); GM.ui.rest.stop();
      summary(res);
      GM.app.go('today');
    }
    function summary(res) {
      const w = res.workout;
      const m = GM.ui.modal({
        title: d.editingId ? 'Workout updated' : 'Workout saved',
        body: h('div', { class: 'summary' },
          h('p', { class: 'lead' }, w.name + ' · ' + date.fmt(w.date)),
          h('div', { class: 'stat-row' },
            stat('Exercises', res.totals.exercises), stat('Sets', res.totals.sets),
            stat('Volume', res.totals.vol ? S.units.fmt(res.totals.vol, 0) : '–'), stat('Time', fmt.mins(w.durationMin))),
          res.prs.length
            ? h('div', null, h('h3', null, icon('trophy', 18), ' New personal records'),
                h('ul', { class: 'pr-list' }, res.prs.map((p) => {
                  const ex = GM.catalog.get(p.ex);
                  return h('li', null, h('strong', null, ex ? ex.name : 'Exercise'), h('span', { class: 'muted' }, ' ' + p.labels[0] + (p.set ? ': ' + (p.set.w ? S.units.fmt(p.set.w) + ' × ' : '') + p.set.r : '')));
                })))
            : h('p', { class: 'muted' }, 'Nice work. Keep the streak going!')),
        footer: h('button', { class: 'btn primary', type: 'button', onClick: () => m.close() }, 'Done'),
      });
    }
    async function discard() {
      const ok = await GM.ui.confirm(d.editingId ? 'Discard changes?' : 'Discard this workout?', d.editingId ? 'Your edits will be lost. The saved workout stays as it was.' : 'Everything you have entered in this session will be lost.', { ok: 'Discard', danger: true });
      if (!ok) return;
      stopTimer(); GM.ui.rest.stop();
      S.discardDraft(); GM.app.refresh();
    }

    const nameIn = h('input', {
      class: 'title-input', type: 'text', value: d.name, placeholder: 'Workout name (e.g. Chest day)', maxlength: '60', 'aria-label': 'Workout name',
      onInput: (e) => { d.name = e.target.value; S.saveSoon(); },
    });
    const dateIn = h('input', { type: 'date', value: d.date, max: date.today(), 'aria-label': 'Workout date', onChange: (e) => { if (e.target.value) { d.date = e.target.value; S.saveSoon(); paintList(); } } });
    const notes = h('textarea', { rows: '2', placeholder: 'Workout notes (sleep, energy, injuries…)', onInput: (e) => { d.notes = e.target.value; S.saveSoon(); } }, d.notes || '');

    root.append(
      h('div', { class: 'live-bar' },
        h('div', { class: 'live-main' },
          h('div', { class: 'live-time' }, icon('timer', 18), timeEl),
          statsEl),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Add exercise', onClick: addExercises }, icon('plus', 24)),
        h('button', { class: 'btn primary small', type: 'button', onClick: finish }, icon('check', 16), d.editingId ? ' Save' : ' Finish')),
      h('header', { class: 'card active-head' },
        nameIn,
        h('div', { class: 'row gap wrap' }, h('span', { class: 'muted small' }, 'Date'), dateIn)),
      list,
      h('div', { class: 'row gap wrap action-bar' },
        h('button', { class: 'btn', type: 'button', onClick: addExercises }, icon('plus'), ' Add exercise'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn ghost danger', type: 'button', onClick: discard }, d.editingId ? 'Cancel edit' : 'Discard'),
        h('button', { class: 'btn primary', type: 'button', onClick: finish }, icon('check'), d.editingId ? ' Save changes' : ' Finish workout')),
      h('section', { class: 'card' }, h('h3', null, 'Notes'), notes));
    paintList(); paintStats();
  }

  views.workout = {
    render(root) {
      stopTimer();
      root.classList.add('view-workout');
      if (S.state.draft) renderActive(root); else renderStart(root);
    },
    leave() { stopTimer(); },
  };
})();
