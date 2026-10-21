/* Today: what's planned, the week at a glance, quick stats and recent records. */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, icon, date, fmt } = GM;
  const S = GM.store;
  const views = (GM.views = GM.views || {});

  const stat = (label, value, sub) => h('div', { class: 'stat-tile' },
    h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), sub ? h('div', { class: 'stat-sub muted' }, sub) : null);

  function planPreview(day) {
    return h('ul', { class: 'mini-list' }, day.items.slice(0, 6).map((it) => {
      const ex = GM.catalog.get(it.ex);
      if (!ex) return null;
      const time = GM.catalog.kind(ex) === 'time';
      return h('li', null, GM.ui.thumb(ex, 36), h('span', { class: 'mini-name' }, ex.name), h('span', { class: 'muted small' }, time ? it.reps + ' min' : it.sets + ' × ' + it.reps));
    }), day.items.length > 6 ? h('li', { class: 'muted small more-li' }, '+ ' + (day.items.length - 6) + ' more') : null);
  }

  function heroCard() {
    const today = date.today(), idx = date.dow(today), day = S.state.plan[idx], draft = S.state.draft;
    const doneToday = S.workoutsOn(today);

    if (draft) {
      return h('section', { class: 'card hero' },
        h('div', { class: 'eyebrow' }, 'In progress'),
        h('h2', null, draft.name || 'Workout'),
        h('p', { class: 'muted' }, fmt.plural(draft.entries.length, 'exercise') + ' · started ' + new Date(draft.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
        h('div', { class: 'row gap wrap' }, h('button', { class: 'btn primary', type: 'button', onClick: () => GM.app.go('workout') }, icon('play', 16), ' Continue workout')));
    }

    const children = [];
    if (day.rest) {
      children.push(h('div', { class: 'eyebrow' }, date.DAYS[idx]), h('h2', null, icon('moon', 22), ' Rest day'), h('p', { class: 'muted' }, 'Recovery is where the gains happen. Sleep, eat, stretch.'));
    } else if (day.name.trim() || day.items.length) {
      children.push(h('div', { class: 'eyebrow' }, 'Planned for ' + date.DAYS[idx]), h('h2', null, day.name.trim() || date.DAYS[idx]), day.items.length ? planPreview(day) : h('p', { class: 'muted' }, 'No exercises in this day yet.'));
    } else {
      children.push(h('div', { class: 'eyebrow' }, date.DAYS[idx]), h('h2', null, 'Nothing planned'), h('p', { class: 'muted' }, 'Set up your week, or just log a workout.'));
    }
    if (doneToday.length) {
      children.push(h('p', { class: 'done-note' }, icon('check', 16), ' Trained today: ' + doneToday.map((w) => w.name).join(', ')));
    }
    const actions = [];
    if (!day.rest && day.items.length) actions.push(h('button', { class: 'btn primary', type: 'button', onClick: () => { S.startFromPlan(idx); GM.app.go('workout'); } }, icon('play', 16), doneToday.length ? ' Train again' : ' Start workout'));
    else actions.push(h('button', { class: 'btn ' + (day.rest ? '' : 'primary'), type: 'button', onClick: () => { S.startWorkout({ name: '' }); GM.app.go('workout'); } }, icon('plus', 16), day.rest ? ' Train anyway' : ' Start empty workout'));
    if (!day.rest && day.items.length) actions.push(h('button', { class: 'btn ghost', type: 'button', onClick: () => { S.startWorkout({ name: '' }); GM.app.go('workout'); } }, 'Empty workout'));
    if (!day.name.trim() && !day.items.length && !day.rest) actions.push(h('a', { class: 'btn ghost', href: '#/plan' }, 'Set up weekly plan'));
    children.push(h('div', { class: 'row gap wrap' }, actions));
    return h('section', { class: 'card hero' }, children);
  }

  function weekStrip() {
    const today = date.today(), ws = date.weekStart(today), plan = S.state.plan;
    return h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', null, 'This week'), h('a', { href: '#/plan', class: 'link' }, 'Edit plan')),
      h('div', { class: 'week-strip' }, plan.map((d, i) => {
        const iso = date.addDays(ws, i), ws_ = S.workoutsOn(iso), done = ws_.length > 0;
        const label = d.rest ? 'Rest' : d.name.trim() || (d.items.length ? 'Workout' : '–');
        const missed = !done && !d.rest && iso < today && (d.name.trim() || d.items.length);
        const cls = 'wk-day' + (iso === today ? ' today' : '') + (done ? ' done' : '') + (missed ? ' missed' : '') + (d.rest ? ' rest' : '');
        const el = h('button', { type: 'button', class: cls, 'aria-label': date.DAYS[i] + ': ' + label + (done ? ', completed' : missed ? ', missed' : ''),
          onClick: () => { if (done) { GM.app.go('history'); } else GM.app.go('plan'); } },
          h('span', { class: 'wk-dow' }, date.SHORT[i]),
          h('span', { class: 'wk-mark' }, done ? icon('check', 16) : d.rest ? icon('moon', 14) : h('span', { class: 'wk-dot' })),
          h('span', { class: 'wk-name' }, label));
        return el;
      })));
  }

  function statsRow() {
    const ws = date.weekStart(date.today()), w = S.weekSummary(ws), goal = S.plannedCount(), streak = S.weekStreak();
    return h('div', { class: 'stats-grid' },
      stat('Workouts this week', w.count + (goal ? ' / ' + goal : ''), goal ? (w.count >= goal ? 'Weekly goal reached' : (goal - w.count) + ' to go') : 'Plan days to set a goal'),
      stat('Volume this week', w.vol ? S.units.fmt(w.vol, 0) : '–', w.sets ? fmt.plural(w.sets, 'set') : 'No sets yet'),
      stat('Week streak', streak, streak ? 'weeks on target' : 'Hit your goal this week'),
      stat('Total workouts', S.state.workouts.length, S.state.workouts.length ? 'Since ' + date.fmt(S.workoutsSorted().slice(-1)[0].date, { month: 'short', year: 'numeric' }) : 'Your first one is waiting'));
  }

  function prCard() {
    const prs = S.allPRs().slice(0, 5);
    if (!prs.length) return null;
    return h('section', { class: 'card' },
      h('h2', null, icon('trophy', 20), ' Recent records'),
      h('ul', { class: 'pr-list' }, prs.map((p) => {
        const ex = GM.catalog.get(p.ex);
        return h('li', null, h('div', null, h('strong', null, ex ? ex.name : 'Exercise'), h('div', { class: 'muted small' }, p.label + (p.set ? ' · ' + (p.set.w ? S.units.fmt(p.set.w) + ' × ' : '') + p.set.r + (p.e1 && p.set && p.set.w ? ' (est. 1RM ' + S.units.fmt(p.e1, 0) + ')' : '') : ''))),
          h('span', { class: 'muted small' }, date.rel(p.date)));
      })));
  }

  function recentCard() {
    const ws = S.workoutsSorted().slice(0, 3);
    if (!ws.length) return null;
    return h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', null, 'Recent workouts'), h('a', { href: '#/history', class: 'link' }, 'All history')),
      h('div', { class: 'list' }, ws.map((w) => {
        const t = S.workoutTotals(w);
        return h('div', { class: 'list-row' },
          h('div', null, h('strong', null, w.name), h('div', { class: 'muted small' }, date.rel(w.date) + ' · ' + fmt.plural(t.exercises, 'exercise') + ' · ' + fmt.plural(t.sets, 'set'))),
          h('span', { class: 'muted small' }, t.vol ? S.units.fmt(t.vol, 0) : ''));
      })));
  }

  function backupNudge() {
    const s = S.state;
    if (s.workouts.length < 3) return null;
    const last = s.settings.lastBackup;
    if (last && Date.now() - last < 30 * 86400000) return null;
    return h('div', { class: 'banner' },
      h('span', null, 'Your data lives only in this browser. Download a backup so it is never lost.'),
      h('a', { class: 'btn small', href: '#/settings' }, 'Back up'));
  }

  function installNudge() {
    const s = S.state.settings, app = GM.app;
    if (app.isStandalone || s.installDismissed || (!app.canInstall && !app.isIOS)) return null;
    return h('div', { class: 'banner' },
      h('span', null, 'Install Gym Manager for one-tap access and offline use at the gym.'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn small primary', type: 'button', onClick: async () => { if (app.canInstall) await app.install(); else GM.ui.installHelp(); } }, app.canInstall ? 'Install' : 'How'),
        h('button', { class: 'icon-btn tiny-btn', type: 'button', 'aria-label': 'Dismiss', onClick: () => { s.installDismissed = true; S.save(); app.refresh(); } }, icon('x', 16))));
  }

  views.today = {
    render(root) {
      const first = !S.state.workouts.length && !S.plannedCount();
      GM.put(root,
        h('header', { class: 'page-head row between' },
          h('div', null, h('h1', null, first ? 'Welcome' : 'Today'), h('p', { class: 'muted' }, date.fmt(date.today(), { weekday: 'long', month: 'long', day: 'numeric' }))),
          h('a', { class: 'icon-btn mobile-only', href: '#/settings', 'aria-label': 'Settings' }, icon('gear', 22))),
        installNudge(),
        backupNudge(),
        first ? h('section', { class: 'card intro' },
          h('h2', null, 'Let\'s get you set up'),
          h('ol', { class: 'steps' },
            h('li', null, h('strong', null, 'Plan your week. '), 'Name each day (e.g. "Chest day") and pick exercises, or start from a template.'),
            h('li', null, h('strong', null, 'Log your sets. '), 'Pick the exercises you did, then enter weight and reps for each set. Last time\'s numbers are pre-filled.'),
            h('li', null, h('strong', null, 'Watch the numbers climb. '), 'Records, volume and charts build up automatically.')),
          h('div', { class: 'row gap wrap' }, h('a', { class: 'btn primary', href: '#/plan' }, 'Set up weekly plan'), h('button', { class: 'btn', type: 'button', onClick: () => { S.startWorkout({ name: '' }); GM.app.go('workout'); } }, 'Log a workout now'))) : null,
        heroCard(), statsRow(), weekStrip(), prCard(), recentCard());
    },
  };
})();
