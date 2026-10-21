/* Shared UI pieces: modals, dialogs, toasts, rest timer, exercise browser/detail, small form helpers. */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, icon, date, fmt } = GM;
  const $ = (id) => document.getElementById(id);

  /* ---------- Modal ---------- */
  const stack = [];
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
  });

  function modal(o) {
    let closed = false;
    const m = { el: null, body: null, close() {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(m);
      if (i >= 0) stack.splice(i, 1);
      m.el.remove();
      if (!stack.length) document.body.classList.remove('modal-open');
      if (o.onClose) o.onClose();
    } };
    m.body = h('div', { class: 'modal-body' }, o.body);
    m.el = h('div', { class: 'modal-backdrop', onMousedown: (e) => { if (e.target === m.el) m.close(); } },
      h('div', { class: 'modal' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, tabindex: '-1' },
        h('header', { class: 'modal-head' },
          h('h2', null, o.title),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: m.close }, icon('x'))),
        m.body,
        o.footer ? h('footer', { class: 'modal-foot' }, o.footer) : null));
    $('modal-root').appendChild(m.el);
    document.body.classList.add('modal-open');
    stack.push(m);
    const first = m.el.querySelector('[autofocus]');
    (first || m.el.querySelector('.modal')).focus();
    return m;
  }

  /** Dialog with custom buttons; resolves to the clicked button's value (null if dismissed). */
  function dialog(o) {
    return new Promise((resolve) => {
      let answer = null;
      const m = modal({
        title: o.title,
        body: o.message ? h('p', { class: 'dialog-msg' }, o.message) : null,
        footer: o.buttons.map((b) => h('button', {
          class: 'btn ' + (b.kind || ''), type: 'button',
          onClick: () => { answer = b.value; m.close(); },
        }, b.label)),
        onClose: () => resolve(answer),
      });
    });
  }
  function confirm(title, message, o) {
    o = o || {};
    return dialog({
      title, message,
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: o.ok || 'OK', value: true, kind: o.danger ? 'danger' : 'primary' }],
    }).then((v) => v === true);
  }

  /* ---------- Toast ---------- */
  function toast(msg, o) {
    o = o || {};
    const t = h('div', { class: 'toast', role: 'status' }, h('span', null, msg),
      o.action ? h('button', { class: 'toast-action', type: 'button', onClick: () => { o.action.onClick(); t.remove(); } }, o.action.label) : null);
    $('toast-root').appendChild(t);
    setTimeout(() => t.remove(), o.ms || (o.action ? 6000 : 2600));
  }

  /* ---------- Rest timer (floating widget) ---------- */
  const rest = (() => {
    let end = 0, total = 0, tick = null, node = null, label, bar;
    const remaining = () => Math.max(0, Math.ceil((end - Date.now()) / 1000));
    function draw() {
      const r = remaining();
      label.textContent = fmt.clock(r);
      bar.style.width = (total ? (100 * (total - r)) / total : 0) + '%';
      if (r <= 0) finish();
    }
    function finish() {
      clearInterval(tick); tick = null;
      GM.beep(2);
      toast('Rest over. Next set!');
      stop();
    }
    function stop() {
      clearInterval(tick); tick = null; end = 0;
      if (node) { node.remove(); node = null; }
    }
    function adjust(sec) { if (!end) return; end += sec * 1000; total = Math.max(total + sec, 1); draw(); }
    function start(sec) {
      end = Date.now() + sec * 1000; total = sec;
      if (!node) {
        label = h('div', { class: 'rest-time' }); bar = h('div', { class: 'rest-bar-fill' });
        node = h('div', { class: 'rest-widget', role: 'timer' },
          h('div', { class: 'rest-top' },
            h('span', { class: 'rest-title' }, icon('timer', 16), ' Rest'),
            label,
            h('button', { class: 'btn small ghost', type: 'button', onClick: () => adjust(-15) }, '−15'),
            h('button', { class: 'btn small ghost', type: 'button', onClick: () => adjust(15) }, '+15'),
            h('button', { class: 'btn small', type: 'button', onClick: stop }, 'Skip')),
          h('div', { class: 'rest-bar' }, bar));
        $('rest-root').appendChild(node);
      }
      clearInterval(tick);
      tick = setInterval(draw, 250);
      draw();
    }
    return { start, stop, adjust, get active() { return !!end; } };
  })();

  /* ---------- Small form helpers ---------- */
  function select(opts, value, onChange, cls) {
    return h('select', { class: cls || '', value, onChange: (e) => onChange(e.target.value) },
      opts.map((o) => h('option', { value: o.value }, o.label)));
  }
  function segmented(opts, value, onChange) {
    const wrap = h('div', { class: 'segmented', role: 'group' });
    const paint = (v) => wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    for (const o of opts) {
      wrap.appendChild(h('button', {
        type: 'button', dataset: { v: o.value }, 'aria-pressed': String(o.value === value),
        onClick: () => { paint(o.value); onChange(o.value); },
      }, o.label));
    }
    paint(value);
    return wrap;
  }
  const field = (label, control, hint) =>
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);

  /* ---------- Exercise thumbnail / rows ---------- */
  function thumb(ex, size) {
    const src = GM.catalog.thumb(ex);
    size = size || 56;
    if (src) return h('img', Object.assign({ class: 'thumb', src, alt: '', width: size, height: size, loading: 'lazy', decoding: 'async', style: { width: size + 'px', height: size + 'px' } }, GM.catalog.mediaAttrs(src)));
    return h('div', { class: 'thumb ph', style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' }, (ex && ex.name ? ex.name[0] : '?').toUpperCase());
  }
  const metaLine = (ex) => [GM.catalog.partLabel(ex.part), fmt.cap(ex.equip), ex.target && fmt.cap(ex.target)].filter(Boolean).join(' · ');
  function lastLine(ex) {
    const last = GM.store.lastSession(ex.id);
    if (!last) return null;
    const b = GM.store.best(ex.id);
    const parts = ['Last ' + date.rel(last.date).toLowerCase()];
    if (GM.catalog.kind(ex) === 'reps' && b.topW) parts.push('best ' + GM.units.fmt(b.topW));
    return parts.join(' · ');
  }

  /* ---------- Exercise browser (used by the Library and the picker dialog) ---------- */
  function exerciseBrowser(o) {
    const st = { q: '', parts: (o.parts || []).slice(), equip: '', target: '', favs: false, custom: false, done: false, limit: 40 };
    const selected = o.selected || new Set();
    const root = h('div', { class: 'browser' });

    const search = h('input', {
      type: 'search', class: 'search', placeholder: 'Search ' + GM.catalog.builtinCount.toLocaleString() + ' exercises (e.g. bench, curl, cable)…',
      'aria-label': 'Search exercises', autocomplete: 'off',
      onInput: GM.debounce((e) => { st.q = e.target.value; st.limit = 40; renderList(); }, 120),
    });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Body part' });
    const toggles = h('div', { class: 'toggles' });
    const count = h('div', { class: 'muted small count' });
    const list = h('div', { class: 'ex-list' });
    const more = h('button', { class: 'btn ghost more', type: 'button', onClick: () => { st.limit += 60; renderList(); } }, 'Show more');

    function paintChips() {
      GM.clear(chips);
      const chip = (label, on, fn) => chips.appendChild(h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onClick: fn }, label));
      chip('All', !st.parts.length, () => { st.parts = []; st.limit = 40; paintChips(); renderList(); });
      for (const p of GM.catalog.PARTS) {
        chip(GM.catalog.partLabel(p), st.parts.includes(p), () => {
          const i = st.parts.indexOf(p);
          if (i >= 0) st.parts.splice(i, 1); else st.parts.push(p);
          st.limit = 40; paintChips(); renderList();
        });
      }
    }
    function paintToggles() {
      GM.clear(toggles);
      const mk = (key, label) => toggles.appendChild(h('button', {
        type: 'button', class: 'chip small' + (st[key] ? ' on' : ''), 'aria-pressed': String(st[key]),
        onClick: () => { st[key] = !st[key]; st.limit = 40; paintToggles(); renderList(); },
      }, label));
      mk('favs', '★ Favourites'); mk('done', 'Done before'); mk('custom', 'My exercises');
    }
    const eqOpts = [{ value: '', label: 'Any equipment' }].concat(GM.catalog.equipments().map((e) => ({ value: e, label: fmt.cap(e) })));
    const tgOpts = [{ value: '', label: 'Any muscle' }].concat(GM.catalog.targets().map((e) => ({ value: e, label: fmt.cap(e) })));

    function row(ex) {
      const on = selected.has(ex.id);
      const sub = lastLine(ex);
      const b = h('button', {
        type: 'button', class: 'ex-row' + (on ? ' sel' : ''), dataset: { id: ex.id },
        'aria-pressed': o.mode === 'pick' ? String(on) : null,
        onClick: () => {
          if (o.mode === 'pick') {
            if (selected.has(ex.id)) selected.delete(ex.id); else selected.add(ex.id);
            b.classList.toggle('sel', selected.has(ex.id));
            b.setAttribute('aria-pressed', String(selected.has(ex.id)));
            if (o.onChange) o.onChange(selected);
          } else if (o.onOpen) o.onOpen(ex);
        },
      },
        thumb(ex, 56),
        h('div', { class: 'ex-main' },
          h('div', { class: 'ex-name' }, ex.name, GM.store.isFav(ex.id) ? h('span', { class: 'fav-mark', title: 'Favourite' }, icon('star', 14)) : null),
          h('div', { class: 'ex-meta' }, metaLine(ex)),
          sub ? h('div', { class: 'ex-last' }, sub) : null),
        o.mode === 'pick' ? h('span', { class: 'pick-mark', 'aria-hidden': 'true' }, icon('check', 18)) : null);
      return b;
    }
    function renderList() {
      const res = GM.catalog.search(st);
      const shown = res.slice(0, st.limit);
      GM.clear(list);
      if (!res.length) {
        list.appendChild(h('div', { class: 'empty' }, 'No exercises match. Try fewer filters or a different word.'));
      } else {
        const frag = document.createDocumentFragment();
        shown.forEach((ex) => frag.appendChild(row(ex)));
        list.appendChild(frag);
      }
      count.textContent = res.length > shown.length ? 'Showing ' + shown.length + ' of ' + res.length + ' exercises' : fmt.plural(res.length, 'exercise');
      more.style.display = res.length > shown.length ? '' : 'none';
    }

    root.append(
      search, chips,
      h('div', { class: 'filter-row' },
        select(eqOpts, st.equip, (v) => { st.equip = v; st.limit = 40; renderList(); }, 'sel'),
        select(tgOpts, st.target, (v) => { st.target = v; st.limit = 40; renderList(); }, 'sel'),
        toggles),
      count, list, more);
    paintChips(); paintToggles(); renderList();
    return { el: root, selected, focus: () => search.focus(), refresh: renderList };
  }

  /** Picker dialog: choose one or more exercises. onDone(ids[]) */
  function pickExercises(o) {
    const selected = new Set();
    const btn = h('button', { class: 'btn primary', type: 'button', disabled: true }, o.confirmLabel || 'Add');
    const update = () => { btn.disabled = !selected.size; btn.textContent = (o.confirmLabel || 'Add') + (selected.size ? ' (' + selected.size + ')' : ''); };
    const br = exerciseBrowser({ mode: 'pick', parts: o.parts, selected, onChange: update });
    const m = modal({
      title: o.title || 'Add exercises', wide: true, body: br.el,
      footer: [h('button', { class: 'btn ghost', type: 'button', onClick: () => m.close() }, 'Cancel'), btn],
    });
    btn.addEventListener('click', () => { const ids = [...selected]; m.close(); o.onDone(ids); });
    setTimeout(() => br.focus(), 30);
  }

  /* ---------- Exercise detail ---------- */
  function exerciseDetail(ex, o) {
    o = o || {};
    const S = GM.store, kind = GM.catalog.kind(ex);
    const changed = () => { if (o.onChange) o.onChange(); };
    const favBtn = h('button', { class: 'btn ghost', type: 'button' });
    const paintFav = () => { GM.clear(favBtn); favBtn.append(icon('star', 18), S.isFav(ex.id) ? ' Favourited' : ' Favourite'); favBtn.classList.toggle('on', S.isFav(ex.id)); };
    favBtn.addEventListener('click', () => { S.toggleFav(ex.id); paintFav(); changed(); });
    paintFav();

    const gifSrc = GM.catalog.gif(ex);
    const hist = S.history(ex.id);
    const b = S.best(ex.id);
    const body = h('div', { class: 'detail' },
      h('div', { class: 'detail-top' },
        gifSrc ? h('img', Object.assign({ class: 'detail-gif', src: gifSrc, alt: 'Animation of ' + ex.name, width: 180, height: 180 }, GM.catalog.mediaAttrs(gifSrc))) : thumb(ex, 120),
        h('div', { class: 'detail-info' },
          h('div', { class: 'tags' },
            h('span', { class: 'tag' }, GM.catalog.partLabel(ex.part)),
            h('span', { class: 'tag' }, fmt.cap(ex.equip)),
            ex.target ? h('span', { class: 'tag' }, 'Target: ' + ex.target) : null,
            ex.custom ? h('span', { class: 'tag accent' }, 'My exercise') : null),
          ex.sec && ex.sec.length ? h('p', { class: 'muted small' }, 'Also works: ' + ex.sec.join(', ')) : null,
          h('div', { class: 'row gap wrap' }, favBtn))),
      h('section', null,
        h('h3', null, 'Your history'),
        hist.length
          ? h('div', null,
              h('div', { class: 'stat-row' },
                kind === 'time'
                  ? [stat('Sessions', hist.length), stat('Longest', fmt.mins(b.mins))]
                  : [stat('Sessions', hist.length), stat('Heaviest', b.topW ? S.units.fmt(b.topW) : '–'), stat('Est. 1RM', b.e1 ? S.units.fmt(b.e1, 0) : '–')]),
              h('ul', { class: 'hist-list' }, hist.slice(-5).reverse().map((x) =>
                h('li', null, h('span', { class: 'muted' }, date.fmt(x.date, { month: 'short', day: 'numeric', year: 'numeric' })), h('span', null, setsText(kind, x.sets))))))
          : h('p', { class: 'muted' }, 'Not logged yet. Add it to a workout to start tracking.')),
      ex.steps && ex.steps.length ? h('section', null, h('h3', null, 'How to do it'), h('ol', { class: 'steps' }, ex.steps.map((s) => h('li', null, s)))) : null,
      !ex.custom ? h('p', { class: 'muted tiny' }, '© Gym visual (gymvisual.com). Exercise data from the open exercises-dataset.') : null);

    const dayIdx = date.dow(date.today());
    const daySel = select(date.DAYS.map((d, i) => ({ value: String(i), label: d })), String(dayIdx), () => {}, 'sel');
    const m = modal({
      title: ex.name, wide: true, body,
      footer: [
        ex.custom ? h('button', { class: 'btn danger ghost', type: 'button', onClick: async () => {
          if (await confirm('Delete "' + ex.name + '"?', 'Past workouts that used it keep their history, but the exercise name will show as unknown.', { ok: 'Delete', danger: true })) {
            GM.catalog.removeCustom(ex.id); m.close(); changed();
          }
        } }, 'Delete') : null,
        h('span', { class: 'spacer' }),
        h('div', { class: 'row gap wrap' },
          h('span', { class: 'muted small' }, 'Add to plan:'), daySel,
          h('button', { class: 'btn', type: 'button', onClick: () => {
            const i = +daySel.value, d = S.state.plan[i];
            d.rest = false;
            d.items.push({ ex: ex.id, sets: kind === 'time' ? 1 : 3, reps: kind === 'time' ? 20 : 10 });
            S.save(); toast('Added to ' + date.DAYS[i] + "'s plan"); changed();
          } }, 'Add'),
          S.state.draft ? h('button', { class: 'btn primary', type: 'button', onClick: () => {
            S.addEntry(ex.id); toast('Added to your workout'); m.close(); changed();
          } }, 'Add to workout') : null),
      ],
    });
  }
  const stat = (label, value) => h('div', { class: 'mini-stat' }, h('div', { class: 'mini-val' }, value), h('div', { class: 'muted tiny' }, label));
  /** "60 kg × 10, 60 kg × 8" style summary of completed sets. */
  function setsText(kind, sets) {
    return sets.filter((s) => s.done).map((s) => {
      if (kind === 'time') return (s.r || 0) + ' min';
      const w = s.w ? fmt.num(GM.units.toDisp(s.w)) + '×' : '';
      return w + (s.r || 0);
    }).join(', ');
  }

  /* ---------- Create custom exercise ---------- */
  function customExerciseForm(o) {
    o = o || {};
    const f = { name: '', part: 'chest', equip: 'body weight', target: '', kind: 'reps', steps: '' };
    const name = h('input', { type: 'text', placeholder: 'e.g. Hammer Strength Chest Press', maxlength: '80', autofocus: true, onInput: (e) => { f.name = e.target.value; } });
    const partSel = select(GM.catalog.PARTS.map((p) => ({ value: p, label: GM.catalog.partLabel(p) })), f.part, (v) => { f.part = v; if (v === 'cardio') kindSeg.setValue('time'); });
    const eqSel = select(GM.catalog.equipments().map((e) => ({ value: e, label: fmt.cap(e) })), f.equip, (v) => { f.equip = v; });
    const tgSel = select([{ value: '', label: 'Not sure' }].concat(GM.catalog.targets().map((e) => ({ value: e, label: fmt.cap(e) }))), f.target, (v) => { f.target = v; });
    const kindSeg = segmented([{ value: 'reps', label: 'Weight × reps' }, { value: 'time', label: 'Time (minutes)' }], f.kind, (v) => { f.kind = v; });
    kindSeg.setValue = (v) => { f.kind = v; kindSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); };
    const steps = h('textarea', { rows: '3', placeholder: 'Optional notes or steps, one per line', onInput: (e) => { f.steps = e.target.value; } });
    const err = h('div', { class: 'error', role: 'alert' });
    const m = modal({
      title: 'New exercise',
      body: h('div', { class: 'form' }, field('Name', name), h('div', { class: 'grid2' }, field('Body part', partSel), field('Equipment', eqSel)),
        field('Main muscle', tgSel), field('Track as', kindSeg), field('Notes', steps), err),
      footer: [h('button', { class: 'btn ghost', type: 'button', onClick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'button', onClick: () => {
          if (!f.name.trim()) { err.textContent = 'Give the exercise a name.'; name.focus(); return; }
          const ex = GM.catalog.addCustom({ name: f.name, part: f.part, equip: f.equip, target: f.target, kind: f.kind, steps: f.steps.split('\n').map((s) => s.trim()).filter(Boolean) });
          m.close(); toast('Created "' + ex.name + '"'); if (o.onSaved) o.onSaved(ex);
        } }, 'Create exercise')],
    });
  }

  /* ---------- Phone-only switch between the Progress and History screens ---------- */
  function subnav(active) {
    return h('div', { class: 'subnav mobile-only' },
      h('a', { href: '#/progress', class: active === 'progress' ? 'on' : '' }, icon('chart', 16), ' Progress'),
      h('a', { href: '#/history', class: active === 'history' ? 'on' : '' }, icon('clock', 16), ' History'));
  }

  /** How to add the app to the home screen (iOS has no install button). */
  function installHelp() {
    const m = modal({
      title: 'Install on your phone',
      body: h('div', null,
        h('p', null, 'Installing gives you a home-screen icon, full-screen use and offline access at the gym.'),
        h('h3', null, 'iPhone / iPad (Safari)'),
        h('ol', { class: 'steps' }, h('li', null, 'Open this page in Safari.'), h('li', null, 'Tap the Share button.'), h('li', null, 'Choose "Add to Home Screen", then Add.')),
        h('h3', null, 'Android (Chrome)'),
        h('ol', { class: 'steps' }, h('li', null, 'Tap the ⋮ menu.'), h('li', null, 'Choose "Install app" (or "Add to Home screen").')),
        h('p', { class: 'muted small' }, 'Installing needs the secure (https) address of the app. On your home Wi-Fi preview it works as a normal web page, but without install and offline mode.')),
      footer: h('button', { class: 'btn primary', type: 'button', onClick: () => m.close() }, 'Got it'),
    });
  }

  GM.ui = { modal, dialog, confirm, toast, rest, select, segmented, field, thumb, metaLine, exerciseBrowser, pickExercises, exerciseDetail, customExerciseForm, setsText, subnav, installHelp };
})();
