// js/core/motion.js — spring timings, reduced-motion check, row stagger, animated counts.
import { _lang } from './i18n.js';
// ─── Motion helpers ───
const _reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// prefersReducedMotion() itself is declared with the inbox detail helpers.
function springOptions(kind) {
  const css = getComputedStyle(document.documentElement);
  return {
    duration: parseFloat(css.getPropertyValue('--dur-spring-' + kind)) || 300,
    easing: css.getPropertyValue('--spring-' + kind).trim() || 'ease-out',
  };
}
/** WAAPI throws on an easing it cannot parse; fall back to ease-out rather than lose the change. */
function animateSafe(el, keyframes, opts) {
  try { return el.animate(keyframes, opts); }
  catch { try { return el.animate(keyframes, { ...opts, easing: 'ease-out' }); } catch { return null; } }
}

/** The first rows of a freshly entered list arrive 60ms apart. Paging and filtering re-render without it. */
function staggerRows(tbody) {
  if (!tbody || prefersReducedMotion()) return;
  const opts = springOptions('gentle');
  [...tbody.rows].slice(0, 8).forEach((row, i) => {
    animateSafe(row, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { ...opts, delay: i * 60, fill: 'backwards' });
  });
}

/**
 * A count eases from its last value to the new one. Unknown is a dash, not 0.
 * The final number is written by a timer too, because rAF stops in a hidden tab.
 */
function setCount(el, value) {
  if (!el) return;
  cancelAnimationFrame(el._countRaf);
  clearTimeout(el._countTimer);
  if (value == null) { el.textContent = '—'; delete el.dataset.count; return; }
  const from = el.dataset.count !== undefined ? Number(el.dataset.count) : 0;
  el.dataset.count = String(value);
  const fmt = v => Math.round(v).toLocaleString(_lang === 'zh' ? 'zh-CN' : 'en-US');
  const { duration } = springOptions('gentle');
  if (prefersReducedMotion() || from === value) { el.textContent = fmt(value); return; }
  const t0 = performance.now();
  // Critically damped: 1 - (1 + kp)e^(-kp) is within 0.5% of the end at k = 7.4.
  const step = now => {
    const p = Math.min(1, (now - t0) / duration);
    const x = p >= 1 ? 1 : 1 - (1 + 7.4 * p) * Math.exp(-7.4 * p);
    el.textContent = fmt(from + (value - from) * x);
    if (p < 1) el._countRaf = requestAnimationFrame(step);
  };
  el._countRaf = requestAnimationFrame(step);
  el._countTimer = setTimeout(() => { cancelAnimationFrame(el._countRaf); el.textContent = fmt(value); }, duration + 100);
}

function prefersReducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

/** Waits out a CSS transition, or not at all when the user asked for less motion. */
function motionDelay(ms) {
  return prefersReducedMotion() ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
}
export { _reducedMotion, animateSafe, motionDelay, prefersReducedMotion, setCount, springOptions, staggerRows };
