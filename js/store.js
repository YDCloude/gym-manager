/* App state, persistence (localStorage), unit conversion and all workout-history queries. */
(function () {
  'use strict';
  const GM = window.GM;
  const { date, uid, clone } = GM;

  const KEY = 'gymmanager.v1';
  const LB = 2.20462262185;

  const blankDay = () => ({ name: '', rest: false, parts: [], items: [] });
  const defaults = () => ({
    v: 1,
    settings: { unit: 'kg', rest: 90, autoRest: true, keepAwake: true, theme: 'auto', lastBackup: null, installDismissed: false },
    custom: [],       // user-created exercises
    favs: [],         // favourite exercise ids
    plan: Array.from({ length: 7 }, blankDay), // Monday..Sunday: {name, rest, parts[], items:[{ex, sets, reps}]}
    workouts: [],     // finished workouts: {id, date, name, planDay, startedAt, endedAt, durationMin, notes, entries:[{ex, sets:[{w(kg), r, done}], note}]}
    draft: null,      // workout in progress (same shape + editingId)
    weights: [],      // body-weight log: {date, kg}
  });

  function normalise(s) {
    const d = defaults();
    const out = Object.assign(d, s || {});
    out.settings = Object.assign(defaults().settings, (s && s.settings) || {});
    for (const k of ['custom', 'favs', 'workouts', 'weights']) if (!Array.isArray(out[k])) out[k] = [];
    out.plan = Array.from({ length: 7 }, (_, i) => {
      const p = Object.assign(blankDay(), ((s && s.plan) || [])[i] || {});
      if (!Array.isArray(p.parts)) p.parts = [];
      if (!Array.isArray(p.items)) p.items = [];
      return p;
    });
    return out;
  }

  let storageOk = true;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalise(JSON.parse(raw));
    } catch (e) { console.warn('Could not read saved data', e); storageOk = false; }
    return defaults();
  }
  let state = load();

  function writeNow() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; }
    catch (e) { storageOk = false; console.warn('Could not save data', e); }
  }
  const saveSoon = GM.debounce(writeNow, 250);
  window.addEventListener('pagehide', writeNow);
  window.addEventListener('beforeunload', writeNow);

  /* ---------- Units (weights are stored in kg) ---------- */
  const units = {
    get unit() { return state.settings.unit; },
    toDisp(kg) {
      if (kg == null || kg === '') return null;
      const v = state.settings.unit === 'lb' ? kg * LB : kg;
      return Math.round(v * 100) / 100;
    },
    fromDisp(v) {
      if (v === '' || v == null || Number.isNaN(Number(v))) return null;
      const n = Number(v);
      return Math.round((state.settings.unit === 'lb' ? n / LB : n) * 10000) / 10000;
    },
    fmt(kg, digits) { return GM.fmt.num(units.toDisp(kg), digits == null ? 1 : digits) + ' ' + state.settings.unit; },
  };

  /* ---------- Per-exercise history (index rebuilt lazily after any change) ---------- */
  let idx = null;
  const cmpAsc = (a, b) => a.date.localeCompare(b.date) || (a.startedAt || 0) - (b.startedAt || 0);
  const cmpDesc = (a, b) => cmpAsc(b, a);
  function touchWorkouts() { idx = null; }
  function index() {
    if (idx) return idx;
    idx = new Map();
    for (const w of [...state.workouts].sort(cmpAsc)) {
      for (const e of w.entries) {
        if (!idx.has(e.ex)) idx.set(e.ex, []);
        idx.get(e.ex).push({ date: w.date, wid: w.id, wname: w.name, sets: e.sets, note: e.note });
      }
    }
    return idx;
  }
  /** Sessions in which `exId` was performed, oldest first. opts: {excludeWid, before: iso date (inclusive)} */
  function history(exId, opts) {
    let a = index().get(exId) || [];
    if (opts && (opts.excludeWid || opts.before)) {
      a = a.filter((x) => (!opts.excludeWid || x.wid !== opts.excludeWid) && (!opts.before || x.date <= opts.before));
    }
    return a;
  }
  const lastSession = (exId, opts) => { const a = history(exId, opts); return a[a.length - 1] || null; };
  const performedCount = (exId) => (index().get(exId) || []).length;
  const performedSet = () => new Set(index().keys());

  /* ---------- Set / session metrics ---------- */
  const e1rm = (w, r) => (!w || !r || r > 15 ? 0 : r === 1 ? w : w * (1 + r / 30)); // Epley
  const kindOf = (exId) => GM.catalog.kind(GM.catalog.get(exId));

  /** Metrics over the completed sets of one session of one exercise. */
  function sessionStats(kind, sets) {
    const o = { topW: 0, topSet: null, e1: 0, vol: 0, reps: 0, maxReps: 0, mins: 0, n: 0 };
    for (const s of sets) {
      if (!s.done) continue;
      o.n++;
      const w = +s.w || 0, r = +s.r || 0;
      if (kind === 'time') { o.mins += r; continue; }
      o.reps += r; o.vol += w * r;
      if (r > o.maxReps) o.maxReps = r;
      if (w > o.topW || (w === o.topW && w > 0 && r > (o.topSet ? o.topSet.r : 0))) { o.topW = w; o.topSet = { w, r }; }
      o.e1 = Math.max(o.e1, e1rm(w, r));
    }
    if (!o.topSet && o.maxReps) o.topSet = { w: 0, r: o.maxReps };
    return o;
  }
  /** All-time bests for an exercise. */
  function best(exId, opts) {
    const kind = kindOf(exId);
    const b = { topW: 0, topSet: null, e1: 0, vol: 0, maxReps: 0, mins: 0, sessions: 0 };
    for (const h of history(exId, opts)) {
      const s = sessionStats(kind, h.sets);
      b.sessions++;
      if (s.topW > b.topW) { b.topW = s.topW; b.topSet = s.topSet; }
      b.e1 = Math.max(b.e1, s.e1); b.vol = Math.max(b.vol, s.vol);
      b.maxReps = Math.max(b.maxReps, s.maxReps); b.mins = Math.max(b.mins, s.mins);
    }
    return b;
  }
  /** Does this (in-progress) entry beat what was done before? Returns null or {labels, set}. */
  function prCheck(exId, sets, opts) {
    const kind = kindOf(exId);
    if (kind === 'time' || !history(exId, opts).length) return null;
    const prev = best(exId, opts), cur = sessionStats(kind, sets);
    if (!cur.n) return null;
    const labels = [];
    if (cur.topW > prev.topW) labels.push('Weight PR');
    else if (cur.e1 > prev.e1 + 0.01) labels.push('Est. 1RM PR');
    else if (prev.topW === 0 && cur.topW === 0 && cur.maxReps > prev.maxReps) labels.push('Reps PR');
    return labels.length ? { labels, set: cur.topSet } : null;
  }
  /** Every PR ever set (newest first). A PR needs earlier history to beat. */
  function allPRs() {
    const run = new Map(), out = [];
    for (const w of [...state.workouts].sort(cmpAsc)) {
      for (const e of w.entries) {
        const kind = kindOf(e.ex);
        if (kind === 'time') continue;
        const cur = sessionStats(kind, e.sets), prev = run.get(e.ex);
        if (prev) {
          let label = null;
          if (cur.topW > prev.topW) label = 'Weight PR';
          else if (cur.e1 > prev.e1 + 0.01) label = 'Est. 1RM PR';
          else if (prev.topW === 0 && cur.topW === 0 && cur.maxReps > prev.maxReps) label = 'Reps PR';
          if (label) out.push({ date: w.date, wid: w.id, ex: e.ex, label, set: cur.topSet, e1: cur.e1 });
        }
        const p = prev || { topW: 0, e1: 0, maxReps: 0 };
        run.set(e.ex, { topW: Math.max(p.topW, cur.topW), e1: Math.max(p.e1, cur.e1), maxReps: Math.max(p.maxReps, cur.maxReps) });
      }
    }
    return out.reverse();
  }

  /* ---------- Workout totals / weekly summaries ---------- */
  function workoutTotals(w) {
    let sets = 0, vol = 0;
    for (const e of w.entries) {
      const k = kindOf(e.ex);
      for (const s of e.sets) { if (!s.done) continue; sets++; if (k !== 'time') vol += (+s.w || 0) * (+s.r || 0); }
    }
    return { exercises: w.entries.length, sets, vol };
  }
  const workoutsSorted = () => [...state.workouts].sort(cmpDesc);
  const workoutsOn = (iso) => state.workouts.filter((w) => w.date === iso);
  function weekSummary(weekStartIso) {
    const end = date.addDays(weekStartIso, 6);
    const ws = state.workouts.filter((w) => w.date >= weekStartIso && w.date <= end);
    let vol = 0, sets = 0, minutes = 0;
    for (const w of ws) { const t = workoutTotals(w); vol += t.vol; sets += t.sets; minutes += w.durationMin || 0; }
    return { start: weekStartIso, count: ws.length, vol, sets, minutes };
  }
  function weeklySeries(n) {
    const cur = date.weekStart(date.today());
    return Array.from({ length: n }, (_, i) => weekSummary(date.addDays(cur, -7 * (n - 1 - i))));
  }
  function plannedCount() { return state.plan.filter((d) => !d.rest && (d.name.trim() || d.items.length)).length; }
  /** Consecutive weeks hitting the weekly goal (planned days, at least 1). The current week counts once reached. */
  function weekStreak() {
    const goal = Math.max(1, plannedCount());
    let ws = date.weekStart(date.today()), streak = 0;
    if (weekSummary(ws).count >= goal) streak++;
    ws = date.addDays(ws, -7);
    for (let i = 0; i < 520; i++, ws = date.addDays(ws, -7)) {
      if (weekSummary(ws).count >= goal) streak++; else break;
    }
    return streak;
  }
  /** Sets per body part over the last `days` days. */
  function setsByPart(days) {
    const from = date.addDays(date.today(), -(days - 1)), m = new Map();
    for (const w of state.workouts) {
      if (w.date < from) continue;
      for (const e of w.entries) {
        const ex = GM.catalog.get(e.ex);
        if (!ex) continue;
        const n = e.sets.filter((s) => s.done).length;
        m.set(ex.part, (m.get(ex.part) || 0) + n);
      }
    }
    return [...m.entries()].map(([part, sets]) => ({ part, sets })).sort((a, b) => b.sets - a.sets);
  }

  /* ---------- Workout in progress ---------- */
  function makeEntry(exId, o) {
    o = o || {};
    const kind = kindOf(exId);
    const last = lastSession(exId, { before: (state.draft && state.draft.date) || date.today() });
    const n = o.sets || (last ? last.sets.length : 3);
    const sets = [];
    for (let i = 0; i < n; i++) {
      const ls = last && (last.sets[i] || last.sets[last.sets.length - 1]);
      sets.push({
        w: kind === 'time' ? null : ls && ls.w != null ? ls.w : null,
        r: o.reps || (ls ? ls.r : null),
        done: false,
      });
    }
    return { ex: exId, sets, note: '' };
  }
  function newDraft(o) {
    state.draft = {
      id: uid(), name: o.name || '', date: o.date || date.today(), startedAt: Date.now(),
      planDay: o.planDay == null ? null : o.planDay, notes: '', entries: [], editingId: o.editingId || null,
    };
    return state.draft;
  }
  function startWorkout(o) {
    o = o || {};
    newDraft(o);
    for (const it of o.items || []) {
      if (GM.catalog.get(it.ex)) state.draft.entries.push(makeEntry(it.ex, { sets: it.sets, reps: it.reps }));
    }
    writeNow();
    return state.draft;
  }
  function startFromPlan(dayIdx) {
    const d = state.plan[dayIdx];
    return startWorkout({ name: d.name.trim() || date.DAYS[dayIdx], planDay: dayIdx, items: d.items });
  }
  function repeatWorkout(id) {
    const w = state.workouts.find((x) => x.id === id);
    if (!w) return null;
    newDraft({ name: w.name, planDay: w.planDay });
    for (const e of w.entries) {
      state.draft.entries.push({ ex: e.ex, note: '', sets: e.sets.map((s) => ({ w: s.w, r: s.r, done: false })) });
    }
    writeNow();
    return state.draft;
  }
  function editWorkout(id) {
    const w = state.workouts.find((x) => x.id === id);
    if (!w) return null;
    state.draft = Object.assign(clone(w), { editingId: w.id, startedAt: w.startedAt || Date.now() });
    state.draft.entries.forEach((e) => e.sets.forEach((s) => { s.done = true; }));
    writeNow();
    return state.draft;
  }
  function addEntry(exId, o) {
    const e = makeEntry(exId, o);
    state.draft.entries.push(e);
    saveSoon();
    return e;
  }
  function discardDraft() { state.draft = null; writeNow(); }
  const hasReps = (s) => (+s.r || 0) > 0;
  /** Sets with reps/minutes entered but not ticked. */
  function uncheckedSets() {
    let n = 0;
    if (state.draft) for (const e of state.draft.entries) for (const s of e.sets) if (!s.done && hasReps(s)) n++;
    return n;
  }
  /** Turn the draft into a saved workout. opts.markUnchecked saves un-ticked sets that have reps. */
  function finishDraft(opts) {
    const d = state.draft;
    if (!d) return null;
    const markUnchecked = !!(opts && opts.markUnchecked);
    const entries = [];
    for (const e of d.entries) {
      const sets = e.sets
        .filter((s) => s.done || (markUnchecked && hasReps(s)))
        .map((s) => ({ w: s.w === '' || s.w == null ? null : +s.w, r: s.r === '' || s.r == null ? null : +s.r, done: true }));
      if (sets.length) entries.push({ ex: e.ex, sets, note: e.note || '' });
    }
    if (!entries.length) return { empty: true };
    const wid = d.editingId || d.id;
    const existing = d.editingId && state.workouts.find((x) => x.id === wid);
    const endedAt = Date.now();
    const w = {
      id: wid, date: d.date, name: (d.name || '').trim() || 'Workout', planDay: d.planDay,
      startedAt: d.startedAt, endedAt,
      durationMin: existing ? existing.durationMin : Math.min(360, Math.max(1, Math.round((endedAt - d.startedAt) / 60000))),
      notes: d.notes || '', entries,
    };
    const prs = [];
    for (const e of entries) {
      const pr = prCheck(e.ex, e.sets, { excludeWid: wid, before: w.date });
      if (pr) prs.push({ ex: e.ex, labels: pr.labels, set: pr.set });
    }
    const i = state.workouts.findIndex((x) => x.id === wid);
    if (i >= 0) state.workouts[i] = w; else state.workouts.push(w);
    state.draft = null;
    touchWorkouts();
    writeNow();
    return { workout: w, prs, totals: workoutTotals(w) };
  }
  function deleteWorkout(id) {
    const i = state.workouts.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const [w] = state.workouts.splice(i, 1);
    touchWorkouts(); writeNow();
    return w;
  }
  function restoreWorkout(w) { state.workouts.push(w); touchWorkouts(); writeNow(); }

  /* ---------- Favourites / custom exercises / body weight ---------- */
  function toggleFav(exId) {
    const i = state.favs.indexOf(exId);
    if (i >= 0) state.favs.splice(i, 1); else state.favs.push(exId);
    writeNow();
    return i < 0;
  }
  const isFav = (exId) => state.favs.includes(exId);
  function addWeight(iso, kg) {
    state.weights = state.weights.filter((x) => x.date !== iso);
    state.weights.push({ date: iso, kg });
    state.weights.sort((a, b) => a.date.localeCompare(b.date));
    writeNow();
  }
  function removeWeight(iso) { state.weights = state.weights.filter((x) => x.date !== iso); writeNow(); }

  /* ---------- Backup ---------- */
  function exportJSON() {
    state.settings.lastBackup = Date.now();
    writeNow();
    return JSON.stringify({ app: 'gym-manager', exportedAt: new Date().toISOString(), data: state }, null, 1);
  }
  function importJSON(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, msg: 'That file is not valid JSON.' }; }
    const data = obj && obj.data ? obj.data : obj;
    if (!data || !Array.isArray(data.workouts) || !Array.isArray(data.plan)) {
      return { ok: false, msg: 'That file does not look like a Gym Manager backup.' };
    }
    state = normalise(data);
    touchWorkouts(); writeNow();
    return { ok: true, workouts: state.workouts.length };
  }
  function reset() { state = defaults(); touchWorkouts(); writeNow(); }

  GM.store = {
    get state() { return state; },
    get storageOk() { return storageOk; },
    save: writeNow, saveSoon, units,
    history, lastSession, performedCount, performedSet, best, prCheck, allPRs, sessionStats, e1rm,
    workoutTotals, workoutsSorted, workoutsOn, weekSummary, weeklySeries, weekStreak, plannedCount, setsByPart,
    makeEntry, startWorkout, startFromPlan, repeatWorkout, editWorkout, addEntry, discardDraft,
    uncheckedSets, finishDraft, deleteWorkout, restoreWorkout, touchWorkouts,
    toggleFav, isFav, addWeight, removeWeight, exportJSON, importJSON, reset, blankDay,
  };
  GM.units = units;
})();
