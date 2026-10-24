// js/core/loading-blocks.js — the loading skeleton: a field of square cells, each slowly brightening and dimming.
import { _reducedMotion, prefersReducedMotion } from './motion.js';
// Hosts are plain markup (`.loading-blocks`, written by renderLoading()). The tables here are
// rebuilt with innerHTML, so hosts are picked up and dropped by watching the DOM.
// The field is full from its first frame and has no direction or end, so a load that finishes at
// any moment cuts nothing short. It only appears once a load has taken 150ms; faster loads show
// nothing at all. When the rows arrive, the skeleton's canvas stays where it was and plays its
// fade-in backwards while the new rows fade in with the same curve. A timer removes the canvas
// even if that fade never finishes.
const PITCH = 12, SIZE = 9, FPS = 24;
const SHOW_DELAY_MS = 150;
const FADE = [{ opacity: 0 }, { opacity: 1 }];
const FADE_OPTS = { duration: 150, easing: 'ease-out' };

/** A fixed 0..1 value per cell and channel; each host adds its own seed, so two never match. */
function cellRandom(i, channel) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
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
    const view = { host, tbody: host.closest('tbody'), canvas, context, start: performance.now(), seed: Math.floor(Math.random() * 1e6), width: 0, height: 0, visible: false, dirty: true, rect: null, shown: false, fadeIn: null };
    view.showTimer = setTimeout(() => show(view), SHOW_DELAY_MS);
    views.set(host, view);
    resize.observe(host);
    intersection.observe(host);
  }

  function show(view) {
    if (!views.has(view.host)) return;
    view.shown = true;
    view.dirty = true;
    if (!prefersReducedMotion()) view.fadeIn = view.canvas.animate(FADE, { ...FADE_OPTS, fill: 'both' });
    schedule();
  }

  function detach(view) {
    clearTimeout(view.showTimer);
    views.delete(view.host);
    resize.unobserve(view.host);
    intersection.unobserve(view.host);
    const { canvas, rect, fadeIn } = view;
    if (!view.shown || !fadeIn || prefersReducedMotion() || !view.visible || !rect || !rect.width) return;
    Object.assign(canvas.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, pointerEvents: 'none', zIndex: '5' });
    document.body.append(canvas);
    fadeIn.reverse();
    if (view.tbody?.isConnected) view.tbody.animate(FADE, FADE_OPTS);
    setTimeout(() => canvas.remove(), FADE_OPTS.duration + 80);
  }

  function draw(view, now) {
    view.dirty = false;
    view.rect = view.host.getBoundingClientRect();
    const { context: ctx, width, height, seed } = view;
    const cols = Math.ceil(width / PITCH), rows = Math.ceil(height / PITCH);
    // Reduced motion: one still frame at each cell's own brightness.
    const still = prefersReducedMotion();
    const t = (now - view.start) / 1000;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(view.host).color;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c + seed;
        const base = 0.35 + 0.35 * cellRandom(i, 0);
        const period = 1.6 + 1.6 * cellRandom(i, 1);
        const wave = still ? 1 : 0.6 + 0.4 * Math.sin(2 * Math.PI * (t / period + cellRandom(i, 2)));
        ctx.globalAlpha = base * wave;
        ctx.fillRect(c * PITCH, r * PITCH, SIZE, SIZE);
      }
    }
    ctx.globalAlpha = 1;
  }

  function schedule() {
    if (frame || document.hidden) return;
    const animate = !prefersReducedMotion();
    for (const view of views.values()) {
      if (view.shown && view.visible && view.width && (animate || view.dirty)) {
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
      if (view.shown && view.visible && view.width && (due || view.dirty)) draw(view, now);
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
