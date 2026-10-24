// js/shell/nav-indicator.js — sidebar current-item block and view transitions.
import { animateSafe, prefersReducedMotion, springOptions } from '../core/motion.js';
// ─── Sidebar current-item block ───
let _navIndKey = '';
function syncNavInd(animate) {
  const sidebar = document.querySelector('.sidebar');
  const ind = document.getElementById('nav-ind');
  if (!sidebar || !ind) return;
  const active = sidebar.querySelector('.nav-icon[data-view].active');
  if (!active || !active.offsetParent || getComputedStyle(ind).display === 'none') {
    ind.classList.remove('ready');
    _navIndKey = '';
    return;
  }
  const s = sidebar.getBoundingClientRect();
  const a = active.getBoundingClientRect();
  const x = Math.round(a.left - s.left - sidebar.clientLeft + sidebar.scrollLeft);
  const y = Math.round(a.top - s.top - sidebar.clientTop + sidebar.scrollTop);
  const to = { transform: `translate(${x}px, ${y}px)`, width: `${Math.round(a.width)}px`, height: `${Math.round(a.height)}px` };
  const key = to.transform + to.width + to.height;
  if (key === _navIndKey) return;
  const placed = !!_navIndKey;
  _navIndKey = key;
  const cs = getComputedStyle(ind);
  const from = { transform: cs.transform, width: cs.width, height: cs.height };
  ind.getAnimations().forEach(x => x.cancel());
  Object.assign(ind.style, to);
  ind.classList.add('ready');
  // The end position is already set, so nothing waits on the animation.
  if (animate && placed && !prefersReducedMotion()) animateSafe(ind, [from, to], springOptions('smooth'));
}
function initNavInd() {
  const sidebar = document.querySelector('.sidebar');
  const ind = document.getElementById('nav-ind');
  if (!sidebar || !ind) return;
  let queued = false;
  // Any code path that moves `.active` or shows a hidden item moves the block.
  new MutationObserver(records => {
    if (queued || records.every(r => r.target === ind)) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; syncNavInd(true); });
  }).observe(sidebar, { attributes: true, attributeFilter: ['class', 'style', 'hidden'], subtree: true });
  new ResizeObserver(() => syncNavInd(false)).observe(sidebar);
  syncNavInd(false);
}

/**
 * View switch: fade, moving 8px along the nav order; instant without support.
 * Resolves once the switch is over (or after a timeout, should the transition never report back),
 * so motion that follows it does not play underneath it.
 */
function switchViewWithTransition(from, to, apply) {
  if (!document.startViewTransition || prefersReducedMotion() || !from || from === to) { apply(); return Promise.resolve(); }
  const order = [...document.querySelectorAll('.nav-icon[data-view]')];
  const root = document.documentElement;
  root.dataset.vtDir = order.indexOf(to) < order.indexOf(from) ? 'up' : 'down';
  try {
    const done = document.startViewTransition(apply).finished.catch(() => {}).finally(() => { delete root.dataset.vtDir; });
    return Promise.race([done, new Promise(resolve => setTimeout(resolve, 600))]);
  } catch {
    delete root.dataset.vtDir;
    apply();
    return Promise.resolve();
  }
}
export { initNavInd, switchViewWithTransition, syncNavInd };
