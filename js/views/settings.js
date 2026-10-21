/* Settings: units, rest timer, theme, backup / restore, reset. */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, icon, date, fmt } = GM;
  const S = GM.store;
  const views = (GM.views = GM.views || {});

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Save every exercise thumbnail into the offline media cache (used by the service worker). */
  async function saveImagesOffline(btn, status) {
    if (!('caches' in window)) { GM.ui.toast('Offline storage is only available on the secure (https) address.'); return; }
    const cache = await caches.open('gm-media-v1');
    const urls = GM.catalog.allThumbUrls(), total = urls.length, remote = /^https?:/i.test(urls[0]);
    const queue = urls.slice();
    let done = 0, failed = 0;
    btn.disabled = true;
    const worker = async () => {
      while (queue.length) {
        const u = queue.pop();
        try {
          const req = new Request(u, remote ? { mode: 'cors', credentials: 'omit' } : undefined);
          if (!(await cache.match(req))) {
            const res = await fetch(req);
            if (res.ok) await cache.put(req, res); else failed++;
          }
        } catch (e) { failed++; }
        done++;
        if (done % 10 === 0 || done === total) status.textContent = 'Saved ' + done + ' of ' + total + '…';
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    btn.disabled = false;
    status.textContent = failed ? 'Saved ' + (total - failed) + ' of ' + total + '. Try again when you have a signal.' : 'All ' + total + ' images saved for offline use.';
    GM.ui.toast(failed ? 'Some images could not be saved' : 'Images saved for offline use');
  }

  function resetDialog() {
    const word = h('input', { type: 'text', placeholder: 'Type DELETE to confirm', autofocus: true, autocomplete: 'off' });
    const go = h('button', { class: 'btn danger', type: 'button', disabled: true }, 'Delete everything');
    word.addEventListener('input', () => { go.disabled = word.value.trim().toUpperCase() !== 'DELETE'; });
    const m = GM.ui.modal({
      title: 'Delete all data?',
      body: h('div', { class: 'form' }, h('p', null, 'This permanently removes every workout, your weekly plan, custom exercises and body-weight log from this browser. Download a backup first if you might want it back.'), word),
      footer: [h('button', { class: 'btn ghost', type: 'button', onClick: () => m.close() }, 'Cancel'), go],
    });
    go.addEventListener('click', () => { GM.ui.rest.stop(); S.reset(); m.close(); GM.app.applyTheme(); GM.ui.toast('All data deleted'); GM.app.go('today'); });
  }

  views.settings = {
    render(root) {
      const st = S.state.settings;
      const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onChange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const text = await f.text();
        e.target.value = '';
        let probe; try { probe = JSON.parse(text); } catch (err) { probe = null; }
        const d = probe && (probe.data || probe);
        const n = d && Array.isArray(d.workouts) ? d.workouts.length : null;
        if (n == null) { GM.ui.toast('That file is not a Gym Manager backup.'); return; }
        if (!(await GM.ui.confirm('Restore this backup?', 'It contains ' + fmt.plural(n, 'workout') + '. Your current data on this device will be replaced.', { ok: 'Restore', danger: true }))) return;
        const res = S.importJSON(text);
        if (res.ok) { GM.app.applyTheme(); GM.ui.toast('Restored ' + fmt.plural(res.workouts, 'workout')); GM.app.go('today'); } else GM.ui.toast(res.msg);
      } });
      const imgStatus = h('div', { class: 'muted small', role: 'status' });
      const imagesBtn = h('div', { class: 'stack-end' });
      const imgBtn = h('button', { class: 'btn small', type: 'button', onClick: () => saveImagesOffline(imgBtn, imgStatus) }, 'Save images');
      imagesBtn.append(imgBtn, imgStatus);
      const size = Math.round(JSON.stringify(S.state).length / 1024);
      const shareFile = () => new File([S.exportJSON()], 'gym-manager-backup-' + date.today() + '.json', { type: 'application/json' });
      const canShare = !!(navigator.canShare && navigator.share && (() => { try { return navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }); } catch (e) { return false; } })());
      const last = st.lastBackup ? 'Last backup: ' + new Date(st.lastBackup).toLocaleDateString() : 'No backup yet';

      GM.put(root,
        h('header', { class: 'page-head' }, h('h1', null, 'Settings')),
        !S.storageOk ? h('div', { class: 'banner warn' }, 'This browser is blocking storage, so your data will not be saved. Open the app via start.bat (http://localhost) or allow site data.') : null,
        h('section', { class: 'card' },
          h('h2', null, 'Training'),
          row('Weight unit', 'Existing logs convert automatically.', GM.ui.segmented([{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }], st.unit, (v) => { st.unit = v; S.save(); })),
          row('Rest timer', 'Default countdown after a set.', GM.ui.select([0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => ({ value: String(s), label: s ? (s >= 60 ? fmt.num(s / 60) + ' min' : s + ' s') : 'Off' })), String(st.rest), (v) => { st.rest = +v; S.save(); })),
          row('Start rest timer automatically', 'When you tick a set as done.', h('input', { type: 'checkbox', class: 'switch', checked: st.autoRest, 'aria-label': 'Auto-start rest timer', onChange: (e) => { st.autoRest = e.target.checked; S.save(); } }))),
        h('section', { class: 'card' },
          h('h2', null, 'On your phone'),
          row('Keep screen on during a workout', 'Stops the screen from locking mid-set.', h('input', { type: 'checkbox', class: 'switch', checked: st.keepAwake !== false, 'aria-label': 'Keep screen on', onChange: (e) => { st.keepAwake = e.target.checked; S.save(); GM.app.wakeSync(); } })),
          row('Install app', GM.app.isStandalone ? 'Running as an installed app.' : 'Home-screen icon, full screen, works offline.',
            GM.app.isStandalone ? h('span', { class: 'tag' }, 'Installed')
              : h('button', { class: 'btn small', type: 'button', onClick: async () => { if (GM.app.canInstall) await GM.app.install(); else GM.ui.installHelp(); } }, GM.app.canInstall ? 'Install' : 'How to')),
          row('Offline exercise images', 'Saves all thumbnails (about 12 MB) so the library works without signal.', imagesBtn)),
        h('section', { class: 'card' },
          h('h2', null, 'Appearance'),
          row('Theme', 'Follows your system by default.', GM.ui.segmented([{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], st.theme, (v) => { st.theme = v; S.save(); GM.app.applyTheme(); }))),
        h('section', { class: 'card' },
          h('h2', null, 'Your data'),
          h('p', { class: 'muted' }, 'Everything is stored in this browser on this device (about ' + size + ' KB). Clearing site data would erase it, so back up now and then. ' + last + '.'),
          h('div', { class: 'row gap wrap' },
            h('button', { class: 'btn primary', type: 'button', onClick: () => { download('gym-manager-backup-' + date.today() + '.json', S.exportJSON()); GM.ui.toast('Backup downloaded'); GM.app.refresh(); } }, icon('download', 16), ' Download backup'),
            canShare ? h('button', { class: 'btn', type: 'button', onClick: async () => {
              try { await navigator.share({ files: [shareFile()], title: 'Gym Manager backup' }); GM.app.refresh(); } catch (e) { /* cancelled */ }
            } }, icon('upload', 16), ' Share backup') : null,
            h('button', { class: 'btn', type: 'button', onClick: () => fileIn.click() }, icon('upload', 16), ' Restore backup'),
            h('button', { class: 'btn ghost danger', type: 'button', onClick: resetDialog }, icon('trash', 16), ' Delete all data')),
          fileIn),
        h('section', { class: 'card' },
          h('h2', null, 'About'),
          h('p', { class: 'muted' }, 'Exercise names, categories and instructions come from the open ', h('a', { href: 'https://github.com/hasaneyldrm/exercises-dataset', target: '_blank', rel: 'noopener' }, 'exercises-dataset'), ' (MIT).'),
          h('p', { class: 'muted' }, 'Exercise images and animations: © Gym visual, ', h('a', { href: 'https://gymvisual.com/', target: '_blank', rel: 'noopener' }, 'gymvisual.com'), '. They are shown at 180×180 as provided and remain subject to Gym visual\'s terms (see assets/MEDIA-NOTICE.md). Check those terms before sharing or publishing this app.')));
    },
  };

  function row(title, sub, control) {
    return h('div', { class: 'setting-row' }, h('div', null, h('div', { class: 'setting-title' }, title), h('div', { class: 'muted small' }, sub)), control);
  }
})();
