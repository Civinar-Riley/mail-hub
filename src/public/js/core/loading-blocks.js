// js/core/loading-blocks.js — the loading skeleton: square cells sweep in along the diagonal, then wipe away.
import { _reducedMotion, prefersReducedMotion } from './motion.js';
// Hosts are plain markup (`.loading-blocks`, written by renderLoading()). The tables here are
// rebuilt with innerHTML, so hosts are picked up and dropped by watching the DOM. Each host
// keeps its own clock from the moment it appears, so the sweep always starts from empty.
// A host fades in; when it goes away because the data arrived, its canvas stays where it was
// and plays that fade backwards instead of vanishing under the new rows. A timer removes it
// even if the fade never runs.
const PITCH = 12, SIZE = 9, FPS = 24;
const FILL_MS = 1000, HOLD_MS = 300, CYCLE_MS = 2 * (FILL_MS + HOLD_MS);
// Entering and leaving are the same fade, the second played backwards.
const FADE = [{ opacity: 0 }, { opacity: 1 }];
const FADE_OPTS = { duration: 150, easing: 'ease-out' };

/** A fixed 0..1 value per cell and cycle, so a cycle draws the same pattern on every frame; each host adds its own seed. */
function cellRandom(i, cycle) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(cycle + 1, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function initLoadingBlocks() {
  const views = new Map();
  let frame = 0, lastDraw = -Infinity;

  const resize = new ResizeObserver(entries => {
    for (const entry of entries) {
      const view = views.get(entry.target);
      if (!view) continue;
      const { width, height } = entry.contentRect;
      const dpr = devicePixelRatio || 1;
      view.width = width;
      view.height = height;
      view.canvas.width = Math.round(width * dpr);
      view.canvas.height = Math.round(height * dpr);
      view.canvas.style.width = `${width}px`;
      view.canvas.style.height = `${height}px`;
      view.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.dirty = true;
    }
    schedule();
  });
  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const view = views.get(entry.target);
      if (!view) continue;
      view.visible = entry.isIntersecting;
      view.dirty ||= entry.isIntersecting;
    }
    schedule();
  }, { rootMargin: '64px' });

  function attach(host) {
    if (views.has(host)) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    host.append(canvas);
    if (!prefersReducedMotion()) canvas.animate(FADE, FADE_OPTS);
    views.set(host, { host, canvas, context, start: performance.now(), seed: Math.floor(Math.random() * 1e6), width: 0, height: 0, visible: false, dirty: true, rect: null });
    resize.observe(host);
    intersection.observe(host);
  }

  function detach(view) {
    views.delete(view.host);
    resize.unobserve(view.host);
    intersection.unobserve(view.host);
    const { canvas, rect } = view;
    if (prefersReducedMotion() || !view.visible || !rect || !rect.width) return;
    Object.assign(canvas.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, pointerEvents: 'none', zIndex: '5' });
    document.body.append(canvas);
    canvas.animate(FADE, { ...FADE_OPTS, direction: 'reverse', fill: 'forwards' });
    setTimeout(() => canvas.remove(), FADE_OPTS.duration + 80);
  }

  function draw(view, now) {
    view.dirty = false;
    view.rect = view.host.getBoundingClientRect();
    const { context: ctx, width, height } = view;
    const cols = Math.ceil(width / PITCH), rows = Math.ceil(height / PITCH);
    const span = Math.max(1, cols + rows - 2);
    // Reduced motion: one still frame with every cell on.
    const still = prefersReducedMotion();
    const elapsed = now - view.start;
    const cycle = still ? 0 : Math.floor(elapsed / CYCLE_MS);
    const t = still ? FILL_MS : elapsed % CYCLE_MS;
    // A front runs 0 → 1 across the diagonal: cells switch on as it passes, the bar holds full,
    // then a second front switches them off in the same order, and the bar holds empty.
    const filling = t < FILL_MS + HOLD_MS;
    const front = Math.min(1, (filling ? t : t - FILL_MS - HOLD_MS) / FILL_MS);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(view.host).color;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const order = (c + r) / span * 0.75 + cellRandom(i + view.seed, cycle) * 0.25;
        const on = filling ? order <= front : order > front;
        const edge = front > 0 && front < 1 && Math.abs(order - front) < 0.04;
        if (!on && !edge) continue;
        ctx.globalAlpha = edge ? 1 : 0.35 + 0.35 * cellRandom(i + view.seed + 7919, cycle);
        ctx.fillRect(c * PITCH, r * PITCH, SIZE, SIZE);
      }
    }
    ctx.globalAlpha = 1;
  }

  function schedule() {
    if (frame || document.hidden) return;
    const animate = !prefersReducedMotion();
    for (const view of views.values()) {
      if (view.visible && view.width && (animate || view.dirty)) {
        frame = requestAnimationFrame(tick);
        return;
      }
    }
  }

  function tick(now) {
    frame = 0;
    const due = !prefersReducedMotion() && now - lastDraw >= 1000 / FPS - 1;
    if (due) lastDraw = now;
    for (const view of views.values()) {
      if (view.visible && view.width && (due || view.dirty)) draw(view, now);
    }
    schedule();
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('.loading-blocks')) attach(node);
    node.querySelectorAll('.loading-blocks').forEach(attach);
  }
  new MutationObserver(records => {
    for (const record of records) record.addedNodes.forEach(scan);
    for (const view of [...views.values()]) if (!view.host.isConnected) detach(view);
  }).observe(document.body, { childList: true, subtree: true });
  // A theme switch changes the cell colour, which is read on every draw.
  const redraw = () => { for (const view of views.values()) view.dirty = true; schedule(); };
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
  _reducedMotion.addEventListener('change', redraw);
  document.addEventListener('visibilitychange', schedule);
  scan(document.body);
}
export { initLoadingBlocks };
