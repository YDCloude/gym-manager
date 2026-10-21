/* Exercise library: browse/search the whole dataset, favourite, add your own. */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, icon } = GM;
  const views = (GM.views = GM.views || {});

  views.library = {
    render(root) {
      let br;
      const open = (ex) => GM.ui.exerciseDetail(ex, { onChange: () => br.refresh() });
      br = GM.ui.exerciseBrowser({ mode: 'browse', onOpen: open });
      root.append(
        h('header', { class: 'page-head row between wrap gap' },
          h('div', null, h('h1', null, 'Exercise library'),
            h('p', { class: 'muted' }, GM.catalog.builtinCount.toLocaleString() + ' exercises with animations. Tap one for details, history and to add it to a plan or workout.')),
          h('button', { class: 'btn', type: 'button', onClick: () => GM.ui.customExerciseForm({ onSaved: () => br.refresh() }) }, icon('plus'), ' New exercise')),
        br.el);
    },
  };
})();
