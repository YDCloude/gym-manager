/* Dependency-free SVG charts: line (progress over time) and columns (per-week counts). */
(function () {
  'use strict';
  const GM = window.GM;
  const { h, clear, date } = GM;

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function niceScale(min, max, count, integer) {
    if (min === max) { max = min + 1; if (min > 0) min = Math.max(0, min - 1); }
    let step = niceStep((max - min) / (count || 4));
    if (integer) step = Math.max(1, Math.ceil(step));
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
    return { lo, hi, ticks };
  }
  const tickText = (v) => (Math.abs(v) >= 1000 ? GM.fmt.compact(v) : String(+v.toFixed(2)));

  /** A div that redraws via draw(width) whenever its width changes. */
  function responsive(draw) {
    const wrap = h('div', { class: 'chart' });
    let w = 0;
    const render = () => {
      const nw = Math.floor(wrap.clientWidth);
      if (!nw || nw === w) return;
      w = nw; clear(wrap); draw(wrap, nw);
    };
    if (window.ResizeObserver) new ResizeObserver(render).observe(wrap);
    else window.addEventListener('resize', render);
    requestAnimationFrame(render);
    return wrap;
  }

  function tooltipEl(wrap) {
    const tip = h('div', { class: 'chart-tip', role: 'tooltip' });
    tip.style.display = 'none';
    wrap.appendChild(tip);
    return {
      show(x, y, lines, W) {
        GM.clear(tip);
        lines.forEach((l, i) => tip.appendChild(h('div', { class: i === 0 ? 'tip-title' : 'tip-line' }, l)));
        tip.style.display = '';
        const tw = tip.offsetWidth;
        tip.style.left = Math.max(0, Math.min(W - tw, x - tw / 2)) + 'px';
        tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px';
      },
      hide() { tip.style.display = 'none'; },
    };
  }

  /**
   * points: [{x: 'yyyy-mm-dd', y: number, tip: [title, ...lines]}] sorted by x.
   * o: {height, fmtY(v), zeroBase}
   */
  function line(points, o) {
    o = o || {};
    return responsive((wrap, W) => {
      const H = o.height || 220, m = { l: 44, r: 20, t: 22, b: 26 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const t = points.map((p) => date.parse(p.x).getTime());
      let x0 = Math.min(...t), x1 = Math.max(...t);
      if (x0 === x1) { x0 -= 3 * 86400000; x1 += 3 * 86400000; }
      const ys = points.map((p) => p.y);
      let lo = Math.min(...ys), hi = Math.max(...ys);
      const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
      const sc = niceScale(o.zeroBase ? 0 : Math.max(0, lo - pad), hi + pad, 4);
      const X = (v) => m.l + ((v - x0) / (x1 - x0)) * iw;
      const Y = (v) => m.t + ih - ((v - sc.lo) / (sc.hi - sc.lo)) * ih;
      const px = t.map(X), py = ys.map(Y);

      const svg = h('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.label || 'Line chart' });
      for (const v of sc.ticks) {
        svg.appendChild(h('line', { class: v === sc.lo ? 'axis' : 'grid', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
        svg.appendChild(h('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, tickText(v)));
      }
      const nx = Math.max(2, Math.min(5, Math.floor(iw / 90)));
      for (let i = 0; i < nx; i++) {
        const tv = x0 + ((x1 - x0) * i) / (nx - 1);
        svg.appendChild(h('text', { x: X(tv), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === nx - 1 ? 'end' : 'middle' },
          new Date(tv).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
      }
      if (points.length > 1) {
        const d = px.map((x, i) => (i ? 'L' : 'M') + x.toFixed(1) + ',' + py[i].toFixed(1)).join('');
        svg.appendChild(h('path', { class: 'series-area', d: d + 'L' + px[px.length - 1] + ',' + Y(sc.lo) + 'L' + px[0] + ',' + Y(sc.lo) + 'Z' }));
        svg.appendChild(h('path', { class: 'series-line', d }));
      }
      const dots = points.map((p, i) => h('circle', { class: 'dot', cx: px[i], cy: py[i], r: 4.5 }));
      dots.forEach((d) => svg.appendChild(d));
      const li = points.length - 1, f = o.fmtY || tickText;
      svg.appendChild(h('text', { class: 'end-label', x: Math.min(px[li], W - m.r), y: py[li] - 11, 'text-anchor': px[li] > W - 60 ? 'end' : 'middle' }, f(ys[li])));

      const cross = h('line', { class: 'cross', y1: m.t, y2: m.t + ih, x1: 0, x2: 0 });
      cross.style.display = 'none';
      svg.appendChild(cross);
      const tip = tooltipEl(wrap);
      const hit = h('rect', { x: m.l - 6, y: 0, width: iw + 12, height: H, fill: 'transparent' });
      let cur = -1;
      const move = (ev) => {
        const r = svg.getBoundingClientRect(), mx = ev.clientX - r.left;
        let best = 0;
        for (let i = 1; i < px.length; i++) if (Math.abs(px[i] - mx) < Math.abs(px[best] - mx)) best = i;
        if (best === cur) return;
        if (cur >= 0) dots[cur].setAttribute('r', 4.5);
        cur = best;
        dots[best].setAttribute('r', 6.5);
        cross.setAttribute('x1', px[best]); cross.setAttribute('x2', px[best]); cross.style.display = '';
        tip.show(px[best], py[best], points[best].tip || [points[best].x, f(ys[best])], W);
      };
      const leave = () => { if (cur >= 0) dots[cur].setAttribute('r', 4.5); cur = -1; cross.style.display = 'none'; tip.hide(); };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerdown', move);
      hit.addEventListener('pointerleave', leave);
      svg.appendChild(hit);
      wrap.insertBefore(svg, wrap.firstChild);
    });
  }

  /** Column chart. items: [{label, value, tip: [title, ...lines]}]. o: {height, fmtY} */
  function columns(items, o) {
    o = o || {};
    return responsive((wrap, W) => {
      const H = o.height || 190, m = { l: 34, r: 6, t: 14, b: 26 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b, n = items.length;
      const sc = niceScale(0, Math.max(...items.map((i) => i.value), 1), 4, o.integer);
      const band = iw / n, bw = Math.min(24, Math.max(6, band - 6));
      const Y = (v) => m.t + ih - (v / sc.hi) * ih;
      const svg = h('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.label || 'Column chart' });
      for (const v of sc.ticks) {
        svg.appendChild(h('line', { class: v === 0 ? 'axis' : 'grid', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
        svg.appendChild(h('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, tickText(v)));
      }
      const every = Math.ceil((n * 44) / iw);
      const tip = tooltipEl(wrap);
      const bars = [];
      items.forEach((it, i) => {
        const cx = m.l + band * i + band / 2, x = cx - bw / 2, y = Y(it.value), bh = Math.max(0, m.t + ih - y);
        if (bh > 0) {
          const r = Math.min(4, bh, bw / 2), yb = m.t + ih;
          const b = h('path', {
            class: 'bar',
            d: 'M' + x + ',' + yb + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + r) + 'V' + yb + 'Z',
          });
          svg.appendChild(b); bars[i] = b;
        }
        if (i % every === 0 || i === n - 1 && every === 1) svg.appendChild(h('text', { x: cx, y: H - 6, 'text-anchor': 'middle' }, it.label));
        const hit = h('rect', { x: m.l + band * i, y: 0, width: band, height: H, fill: 'transparent' });
        const on = () => { if (bars[i]) bars[i].classList.add('hot'); tip.show(cx, y, it.tip || [it.label, String(it.value)], W); };
        const off = () => { if (bars[i]) bars[i].classList.remove('hot'); tip.hide(); };
        hit.addEventListener('pointerenter', on); hit.addEventListener('pointerdown', on); hit.addEventListener('pointerleave', off);
        svg.appendChild(hit);
      });
      wrap.insertBefore(svg, wrap.firstChild);
    });
  }

  GM.charts = { line, columns };
})();
