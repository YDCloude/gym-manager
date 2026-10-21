/* Small shared helpers: DOM builder, dates, number formatting, icons. */
(function () {
  'use strict';
  const GM = (window.GM = window.GM || {});

  /* ---------- DOM ---------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set(['svg', 'g', 'path', 'line', 'circle', 'rect', 'text', 'polyline', 'polygon', 'defs', 'title']);
  const DEFERRED = new Set(['value', 'checked', 'selected', 'indeterminate']);

  function append(el, children) {
    for (const c of children) {
      if (c == null || c === false || c === true) continue;
      if (Array.isArray(c)) append(el, c);
      else if (c instanceof Node) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    }
  }

  /** Hyperscript-style element builder. Text children are always inserted as text (never HTML). */
  function h(tag, attrs, ...children) {
    const isSvg = SVG_TAGS.has(tag);
    const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    const deferred = [];
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.setAttribute('class', v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (!isSvg && DEFERRED.has(k)) deferred.push([k, v]);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, children);
    for (const [k, v] of deferred) el[k] = v;
    return el;
  }

  /** Append children to an existing element; unlike Element.append it skips null/false and flattens arrays. */
  function put(el, ...children) {
    append(el, children);
    return el;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /* ---------- Icons (static trusted markup) ---------- */
  const ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 15l4-4 3 3 5-6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
    flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  };

  function icon(name, size) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'icon');
    s.setAttribute('aria-hidden', 'true');
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    s.innerHTML = ICONS[name] || '';
    return s;
  }

  /* ---------- Dates (local time, ISO yyyy-mm-dd strings; weeks start Monday) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const date = {
    iso(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
    today() { return date.iso(new Date()); },
    parse(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); },
    addDays(iso, n) { const d = date.parse(iso); d.setDate(d.getDate() + n); return date.iso(d); },
    dow(iso) { return (date.parse(iso).getDay() + 6) % 7; }, // Monday = 0
    weekStart(iso) { return date.addDays(iso, -date.dow(iso)); },
    diffDays(a, b) { return Math.round((date.parse(a) - date.parse(b)) / 86400000); },
    fmt(iso, opts) { return date.parse(iso).toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric' }); },
    rel(iso) {
      const n = date.diffDays(date.today(), iso);
      if (n === 0) return 'Today';
      if (n === 1) return 'Yesterday';
      if (n > 1 && n < 14) return n + ' days ago';
      return date.fmt(iso, { month: 'short', day: 'numeric', year: n > 300 ? 'numeric' : undefined });
    },
  };
  date.DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  date.SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /* ---------- Formatting ---------- */
  const fmt = {
    num(n, digits) {
      if (n == null || Number.isNaN(Number(n))) return '–';
      return String(+Number(n).toFixed(digits == null ? 1 : digits));
    },
    compact(n) {
      n = Number(n) || 0;
      if (Math.abs(n) >= 1e6) return +(n / 1e6).toFixed(1) + 'M';
      if (Math.abs(n) >= 1e3) return +(n / 1e3).toFixed(1) + 'K';
      return String(Math.round(n));
    },
    clock(sec) {
      sec = Math.max(0, Math.round(sec));
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
    },
    mins(min) {
      min = Math.round(min || 0);
      if (min < 60) return min + ' min';
      return Math.floor(min / 60) + 'h ' + pad(min % 60) + 'm';
    },
    plural(n, word, pl) { return n + ' ' + (n === 1 ? word : pl || word + 's'); },
    title(s) { return String(s || '').replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()); },
    cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); },
  };

  /* ---------- Misc ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function debounce(fn, ms) {
    let t;
    const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    wrapped.flush = () => { clearTimeout(t); };
    return wrapped;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  let audioCtx;
  function beep(times) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < (times || 2); i++) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
        const t = audioCtx.currentTime + i * 0.28;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.start(t); o.stop(t + 0.22);
      }
    } catch (e) { /* audio unavailable */ }
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ }
  }

  /** Short vibration where supported (Android). */
  function haptic(ms) { try { navigator.vibrate && navigator.vibrate(ms || 15); } catch (e) { /* ignore */ } }

  Object.assign(GM, { haptic, h, put, clear, icon, date, fmt, uid, clamp, debounce, clone, beep });
})();
