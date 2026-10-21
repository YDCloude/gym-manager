/* App shell: hash router, navigation, theme, screen wake lock, install prompt, offline support. */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, icon, clear } = GM;
  const S = GM.store;

  // mobile: false = only in the desktop sidebar (on phones History lives under Progress, Settings behind the gear on Today)
  const ROUTES = [
    { id: 'today', label: 'Today', icon: 'home', mobile: true },
    { id: 'workout', label: 'Workout', icon: 'dumbbell', mobile: true },
    { id: 'plan', label: 'Plan', icon: 'calendar', mobile: true },
    { id: 'library', label: 'Library', icon: 'list', mobile: true },
    { id: 'history', label: 'History', icon: 'clock', mobile: false, mobileParent: 'progress' },
    { id: 'progress', label: 'Progress', icon: 'chart', mobile: true },
    { id: 'settings', label: 'Settings', icon: 'gear', mobile: false },
  ];
  const view = document.getElementById('view');
  const nav = document.getElementById('nav');
  let current = null;

  const routeId = () => {
    const id = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.some((r) => r.id === id) ? id : 'today';
  };

  function paintNav() {
    clear(nav);
    const parent = (ROUTES.find((r) => r.id === current) || {}).mobileParent;
    nav.append(
      h('a', { class: 'brand', href: '#/today' }, icon('dumbbell', 22), h('span', null, 'Gym Manager')),
      h('div', { class: 'nav-items' }, ROUTES.map((r) =>
        h('a', {
          class: 'nav-item' + (r.id === current ? ' on' : '') + (r.id === parent ? ' on-mobile' : '') + (r.mobile ? '' : ' desktop-only'),
          href: '#/' + r.id, 'aria-current': r.id === current ? 'page' : null,
        }, icon(r.icon, 22), h('span', null, r.label),
        r.id === 'workout' && S.state.draft ? h('i', { class: 'live-dot', title: 'Workout in progress' }) : null))));
  }

  /* ---------- Keep the screen on while a workout is in progress ---------- */
  const wake = (() => {
    let lock = null;
    async function sync() {
      const want = !!S.state.draft && S.state.settings.keepAwake !== false && document.visibilityState === 'visible';
      if (want && !lock && navigator.wakeLock) {
        try {
          lock = await navigator.wakeLock.request('screen');
          lock.addEventListener('release', () => { lock = null; });
        } catch (e) { lock = null; }
      } else if (!want && lock) {
        lock.release().catch(() => {});
        lock = null;
      }
    }
    document.addEventListener('visibilitychange', sync);
    return { sync };
  })();

  /** Render the current route. keepScroll preserves the scroll position (used after in-page changes). */
  function render(keepScroll) {
    const y = window.scrollY;
    const id = routeId();
    const prev = GM.views[current];
    if (prev && prev.leave && (current !== id || !keepScroll)) prev.leave();
    current = id;
    clear(view);
    view.className = 'view view-' + id;
    try { GM.views[id].render(view); }
    catch (e) {
      console.error(e);
      view.append(h('div', { class: 'card' }, h('h2', null, 'Something went wrong'), h('p', { class: 'muted' }, String(e && e.message || e))));
    }
    paintNav();
    wake.sync();
    window.scrollTo(0, keepScroll ? y : 0);
  }

  const THEME_COLORS = { light: '#fcfcfb', dark: '#1a1a19' };
  function applyTheme() {
    const t = S.state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    // Keep the phone's status bar colour in step with an explicit theme choice.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (!m.dataset.auto) m.dataset.auto = m.getAttribute('content');
      m.setAttribute('content', THEME_COLORS[t] || m.dataset.auto);
    });
  }

  /* ---------- Install to home screen ---------- */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    if (current === 'today' || current === 'settings') render(true);
  });
  window.addEventListener('appinstalled', () => { deferredInstall = null; if (current === 'today' || current === 'settings') render(true); });

  GM.app = {
    refresh: () => render(true),
    go(id) { if (routeId() === id && location.hash === '#/' + id) render(false); else location.hash = '#/' + id; },
    applyTheme,
    wakeSync: wake.sync,
    get canInstall() { return !!deferredInstall; },
    get isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; },
    get isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
    async install() {
      if (!deferredInstall) return false;
      deferredInstall.prompt();
      const choice = await deferredInstall.userChoice;
      deferredInstall = null;
      return choice.outcome === 'accepted';
    },
  };

  window.addEventListener('hashchange', () => render(false));
  applyTheme();
  render(false);
  if (!S.storageOk) GM.ui.toast('Storage is blocked in this browser, so changes will not be saved.', { ms: 8000 });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }

  // Offline support (needs https or localhost).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered', e)); });
  }
})();
