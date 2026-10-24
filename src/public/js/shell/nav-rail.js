// js/shell/nav-rail.js — on wide screens the sidebar tucks into its icon rail while the API docs are open.
import { animateSafe, motionDelay, prefersReducedMotion, springOptions } from '../core/motion.js';
import { syncNavInd } from './nav-indicator.js';
// The docs already bring their own table of contents, so the app sidebar
// steps back to icons. Collapsing fades the labels, glides every item to its place in the rail
// while the sidebar narrows, then fades the group dividers in; expanding plays that backwards.
// Every step waits on a timer, not on an animation event, so a dropped animation cannot leave
// the sidebar half-way; a newer call cancels whatever an older one still had running.
const WIDE = matchMedia('(min-width: 1024px)');
const FADE_MS = 120;
let _railRun = 0;
let _railAnims = [];

function railFade(els, from, to) {
  return els.map(el => animateSafe(el, [{ opacity: from }, { opacity: to }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' })).filter(Boolean);
}

async function setNavRail(on) {
  const root = document.documentElement;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || root.classList.contains('nav-rail') === on) return;
  const run = ++_railRun;
  _railAnims.forEach(a => a.cancel());
  _railAnims = [];
  sidebar.classList.remove('is-widening');
  if (!WIDE.matches || prefersReducedMotion()) { root.classList.toggle('nav-rail', on); syncNavInd(false); return; }

  const labels = [...sidebar.querySelectorAll('.brand-name, .nav-group-title, .tooltip-wrap:has(> .nav-icon[data-view]) > .tooltip')];
  const seps = () => [...sidebar.querySelectorAll('.nav-sep')].filter(el => el.offsetParent);
  const stale = () => run !== _railRun;

  // Leaving: the part that appears last on the way in goes first on the way out.
  _railAnims = on ? railFade(labels, 1, 0) : railFade(seps(), 1, 0);
  await motionDelay(FADE_MS);
  if (stale()) return;

  const items = [...sidebar.querySelectorAll('.brand, .tooltip-wrap')].filter(el => el.offsetParent);
  const first = new Map(items.map(el => [el, el.getBoundingClientRect().top]));
  const fromWidth = sidebar.getBoundingClientRect().width;
  _railAnims.forEach(a => a.cancel());
  root.classList.toggle('nav-rail', on);
  // Widening, the full sidebar is laid out at its final width and uncovered: growing with the
  // bar, its row of action buttons would rewrap several times on the way.
  sidebar.classList.toggle('is-widening', !on);
  // What fades in at the end must not flash in at the new layout first.
  _railAnims = on ? railFade(seps(), 0, 0) : railFade(labels, 0, 0);
  const spring = springOptions('smooth');
  const toWidth = sidebar.getBoundingClientRect().width;
  const moves = [animateSafe(sidebar, [{ width: fromWidth + 'px' }, { width: toWidth + 'px' }], spring)];
  for (const el of items) {
    const dy = first.get(el) - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 0.5) moves.push(animateSafe(el, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], spring));
  }
  _railAnims.push(...moves.filter(Boolean));
  await motionDelay(spring.duration);
  if (stale()) return;
  sidebar.classList.remove('is-widening');
  syncNavInd(false);

  _railAnims.forEach(a => a.cancel());
  _railAnims = on ? railFade(seps(), 0, 1) : railFade(labels, 0, 1);
  await motionDelay(FADE_MS);
  if (stale()) return;
  _railAnims.forEach(a => a.cancel());
  _railAnims = [];
}
export { setNavRail };
