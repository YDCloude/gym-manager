/* Exercise catalogue: the 1,324 dataset exercises plus the user's own, with search/filter and plan templates. */
(function () {
  'use strict';
  const GM = window.GM;

  const builtin = window.GM_EXERCISES || [];
  const byId = new Map(builtin.map((e) => [e.id, e]));
  const byName = new Map();
  for (const e of builtin) if (!byName.has(e.name.toLowerCase())) byName.set(e.name.toLowerCase(), e);

  const PARTS = ['chest', 'back', 'shoulders', 'upper arms', 'lower arms', 'upper legs', 'lower legs', 'waist', 'neck', 'cardio'];
  const PART_LABELS = {
    chest: 'Chest', back: 'Back', shoulders: 'Shoulders', 'upper arms': 'Arms (upper)', 'lower arms': 'Forearms',
    'upper legs': 'Legs (upper)', 'lower legs': 'Calves', waist: 'Abs / waist', neck: 'Neck', cardio: 'Cardio',
  };
  const partLabel = (p) => PART_LABELS[p] || GM.fmt.cap(p);

  const hayCache = new WeakMap();
  function hayOf(e) {
    let h = hayCache.get(e);
    if (!h) {
      h = (e.name + ' ' + e.part + ' ' + (PART_LABELS[e.part] || '') + ' ' + e.equip + ' ' + e.target + ' ' + (e.sec || []).join(' ')).toLowerCase();
      hayCache.set(e, h);
    }
    return h;
  }

  const custom = () => GM.store.state.custom;
  const get = (id) => byId.get(id) || custom().find((c) => c.id === id) || null;
  const all = () => (custom().length ? builtin.concat(custom()) : builtin);
  /** 'reps' = weight x reps sets, 'time' = minutes. */
  const kind = (ex) => (ex && (ex.kind || (ex.part === 'cardio' ? 'time' : 'reps'))) || 'reps';

  const uniq = (key) => [...new Set(all().map((e) => e[key]).filter(Boolean))].sort();
  const equipments = () => uniq('equip');
  const targets = () => uniq('target');

  /** Filter + rank exercises. */
  function search(o) {
    o = o || {};
    const toks = (o.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const favSet = new Set(GM.store.state.favs);
    const doneSet = o.done ? GM.store.performedSet() : null;
    const parts = o.parts || [];
    const out = all().filter((e) =>
      (!parts.length || parts.includes(e.part)) &&
      (!o.equip || e.equip === o.equip) &&
      (!o.target || e.target === o.target) &&
      (!o.favs || favSet.has(e.id)) &&
      (!o.custom || e.custom) &&
      (!doneSet || doneSet.has(e.id)) &&
      toks.every((t) => hayOf(e).includes(t)));
    const q = (o.q || '').trim().toLowerCase();
    const score = (e) => {
      const n = e.name.toLowerCase();
      if (q && n === q) return 0;
      if (q && n.startsWith(q)) return 1;
      if (q && n.includes(q)) return 2;
      return 3;
    };
    out.sort((a, b) =>
      score(a) - score(b) ||
      (favSet.has(b.id) ? 1 : 0) - (favSet.has(a.id) ? 1 : 0) ||
      GM.store.performedCount(b.id) - GM.store.performedCount(a.id) ||
      a.name.localeCompare(b.name));
    return out;
  }

  const cfg = window.GM_CONFIG || { imageBase: 'assets/images/', gifBase: 'assets/videos/' };
  const thumb = (ex) => (ex && ex.img ? cfg.imageBase + ex.img : null);
  const gif = (ex) => (ex && ex.gif ? cfg.gifBase + ex.gif : null);
  /** Remote media must be fetched with CORS so the service worker can cache it without opaque-response quota padding. */
  const isRemote = (url) => /^https?:\/\//i.test(url || '');
  const mediaAttrs = (url) => (isRemote(url) ? { crossorigin: 'anonymous', referrerpolicy: 'no-referrer' } : {});

  /** Best-guess body parts from a day name like "Chest day" or "Legs". */
  function guessParts(name) {
    const n = (name || '').toLowerCase();
    const out = new Set();
    const add = (re, ...p) => { if (re.test(n)) p.forEach((x) => out.add(x)); };
    add(/chest|pec|push/, 'chest');
    add(/back|pull|lat/, 'back');
    add(/shoulder|delt|push|press/, 'shoulders');
    add(/arm|bicep|tricep|curl|push|pull/, 'upper arms');
    add(/forearm|grip/, 'lower arms');
    add(/leg|quad|ham|glute|squat|lower/, 'upper legs', 'lower legs');
    add(/calf|calves/, 'lower legs');
    add(/abs|core|waist/, 'waist');
    add(/upper/, 'chest', 'back', 'shoulders', 'upper arms');
    add(/full/, 'chest', 'back', 'upper legs');
    add(/cardio|run|hiit/, 'cardio');
    return [...out];
  }

  function addCustom(o) {
    const ex = {
      id: 'c_' + GM.uid(), custom: true, name: o.name.trim(), part: o.part, equip: o.equip || 'body weight',
      target: o.target || '', sec: [], steps: o.steps || [], kind: o.kind || 'reps', img: null, gif: null,
    };
    custom().push(ex);
    GM.store.save();
    return ex;
  }
  function removeCustom(id) {
    const s = GM.store.state;
    s.custom = s.custom.filter((c) => c.id !== id);
    s.favs = s.favs.filter((f) => f !== id);
    GM.store.save();
  }

  /* ---------- Plan templates ---------- */
  const D = {
    chest: { name: 'Chest day', parts: ['chest'], ex: [['Barbell Bench Press', 4, 8], ['Barbell Incline Bench Press', 3, 10], ['Dumbbell Fly', 3, 12], ['Cable Cross-over Variation', 3, 12], ['Chest Dip', 3, 10]] },
    back: { name: 'Back day', parts: ['back'], ex: [['Pull-up', 4, 8], ['Barbell Bent Over Row', 4, 8], ['Cable Bar Lateral Pulldown', 3, 10], ['Cable Seated Row', 3, 12], ['Barbell Shrug', 3, 12]] },
    legs: { name: 'Leg day', parts: ['upper legs', 'lower legs'], ex: [['Barbell Full Squat', 4, 8], ['Sled 45° Leg Press (side Pov)', 3, 10], ['Barbell Romanian Deadlift', 3, 10], ['Lever Leg Extension', 3, 12], ['Lever Seated Leg Curl', 3, 12], ['Barbell Standing Calf Raise', 4, 15]] },
    shoulders: { name: 'Shoulder day', parts: ['shoulders'], ex: [['Barbell Seated Overhead Press', 4, 8], ['Dumbbell Lateral Raise', 4, 12], ['Dumbbell Rear Lateral Raise', 3, 12], ['Barbell Shrug', 3, 12]] },
    arms: { name: 'Arm day', parts: ['upper arms'], ex: [['Barbell Curl', 3, 10], ['Dumbbell Hammer Curl', 3, 12], ['Cable Triceps Pushdown (v-bar)', 3, 12], ['Barbell Lying Triceps Extension Skull Crusher', 3, 10], ['Triceps Dip', 3, 10]] },
    push: { name: 'Push day', parts: ['chest', 'shoulders', 'upper arms'], ex: [['Barbell Bench Press', 4, 8], ['Barbell Incline Bench Press', 3, 10], ['Barbell Seated Overhead Press', 3, 8], ['Dumbbell Lateral Raise', 3, 12], ['Cable Triceps Pushdown (v-bar)', 3, 12], ['Triceps Dip', 3, 10]] },
    pull: { name: 'Pull day', parts: ['back', 'upper arms'], ex: [['Barbell Deadlift', 3, 5], ['Pull-up', 4, 8], ['Barbell Bent Over Row', 3, 10], ['Cable Seated Row', 3, 12], ['Dumbbell Rear Lateral Raise', 3, 12], ['Barbell Curl', 3, 10], ['Dumbbell Hammer Curl', 3, 12]] },
    upper: { name: 'Upper body', parts: ['chest', 'back', 'shoulders', 'upper arms'], ex: [['Barbell Bench Press', 4, 8], ['Barbell Bent Over Row', 4, 8], ['Barbell Seated Overhead Press', 3, 10], ['Cable Bar Lateral Pulldown', 3, 10], ['Barbell Curl', 3, 12], ['Cable Triceps Pushdown (v-bar)', 3, 12]] },
    lower: { name: 'Lower body', parts: ['upper legs', 'lower legs'], ex: [['Barbell Full Squat', 4, 8], ['Barbell Romanian Deadlift', 3, 10], ['Sled 45° Leg Press (side Pov)', 3, 12], ['Lever Seated Leg Curl', 3, 12], ['Barbell Standing Calf Raise', 4, 15]] },
    full: { name: 'Full body', parts: ['chest', 'back', 'upper legs'], ex: [['Barbell Full Squat', 3, 8], ['Barbell Bench Press', 3, 8], ['Barbell Bent Over Row', 3, 8], ['Barbell Seated Overhead Press', 3, 10], ['Hanging Leg Raise', 3, 12]] },
    cardio: { name: 'Cardio & abs', parts: ['cardio', 'waist'], ex: [['Run', 1, 30], ['Hanging Leg Raise', 3, 12], ['Crunch Floor', 3, 20]] },
  };
  const templates = [
    { id: 'ppl', name: 'Push / Pull / Legs', desc: '6 days: push, pull and legs, twice a week', days: ['push', 'pull', 'legs', 'push', 'pull', 'legs', null] },
    { id: 'ul', name: 'Upper / Lower', desc: '4 days: upper and lower body twice a week', days: ['upper', 'lower', null, 'upper', 'lower', null, null] },
    { id: 'bro', name: 'Body-part split', desc: '5 days: chest, back, shoulders, arms, legs', days: ['chest', 'back', 'shoulders', 'arms', 'legs', null, null] },
    { id: 'fb', name: 'Full body x3', desc: '3 days: full-body sessions on Mon / Wed / Fri', days: ['full', null, 'full', null, 'full', null, null] },
  ];
  /** Build a 7-day plan array from a template. Unresolved exercise names are skipped. */
  function buildTemplate(t) {
    return t.days.map((key) => {
      if (!key) return Object.assign(GM.store.blankDay(), { rest: true });
      const d = D[key];
      const items = d.ex.map(([n, sets, reps]) => {
        const ex = byName.get(n.toLowerCase());
        return ex ? { ex: ex.id, sets, reps } : null;
      }).filter(Boolean);
      return { name: d.name, rest: false, parts: d.parts.slice(), items };
    });
  }

  GM.catalog = {
    PARTS, partLabel, get, all, kind, equipments, targets, search, thumb, gif, mediaAttrs, guessParts,
    allThumbUrls: () => builtin.map((e) => cfg.imageBase + e.img),
    addCustom, removeCustom, templates, buildTemplate,
    byName: (n) => byName.get(String(n).toLowerCase()) || null,
    builtinCount: builtin.length,
  };
})();
