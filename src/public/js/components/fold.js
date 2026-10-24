// js/components/fold.js — foldable panels.
import { animateSafe, prefersReducedMotion, springOptions } from '../core/motion.js';
/**
 * Fold or unfold a .collapsible panel. Unfolding plays
 * the height/opacity keyframes forward and folding plays the same keyframes in
 * reverse, so both directions share one curve. The body stays displayed until
 * the fold has run; a timer settles the final state even if `finish` never
 * fires (frozen clocks, animations switched off), and reduced motion sets the
 * state at once. Folding again mid-way reverses the running animation.
 */
function setFold(panel, collapsed, animate = true) {
  foldControl(panel)?.setAttribute('aria-expanded', String(!collapsed));
  panel.dataset.fold = collapsed ? 'closed' : 'open';
  const running = panel._fold;
  if (running) {
    if (running.target !== collapsed) { running.target = collapsed; running.anim.reverse(); running.arm(); }
    return;
  }
  if (panel.classList.contains('collapsed') === collapsed) return;
  if (!animate || prefersReducedMotion()) { panel.classList.toggle('collapsed', collapsed); return; }
  const body = foldBody(panel);
  panel.classList.remove('collapsed');
  const height = body.scrollHeight;
  const opts = springOptions('snappy');
  body.style.overflow = 'hidden';
  const anim = animateSafe(body, [{ height: '0px', opacity: 0 }, { height: height + 'px', opacity: 1 }], { ...opts, direction: collapsed ? 'reverse' : 'normal' });
  const state = { target: collapsed, anim, timer: 0 };
  const settle = () => {
    if (panel._fold !== state) return;
    panel._fold = null;
    clearTimeout(state.timer);
    state.anim?.cancel();
    body.style.overflow = '';
    panel.classList.toggle('collapsed', state.target);
  };
  state.arm = () => { clearTimeout(state.timer); state.timer = setTimeout(settle, opts.duration + 150); };
  panel._fold = state;
  if (!anim) { settle(); return; }
  anim.onfinish = settle;
  state.arm();
}

/** The element that carries aria-expanded: a dedicated toggle when the header holds other controls. */
function foldControl(panel) {
  const header = panel.querySelector(':scope > .panel-header');
  return header?.querySelector('.fold-toggle') || header;
}

/** Everything under the header moves into one .fold-body, so its height animates as a unit. */
function foldBody(panel) {
  let body = panel.querySelector(':scope > .fold-body');
  if (body) return body;
  body = document.createElement('div');
  body.className = 'fold-body';
  for (const child of [...panel.children]) if (!child.classList.contains('panel-header')) body.appendChild(child);
  panel.appendChild(body);
  return body;
}

/**
 * Fold any panel and remember it.
 *
 * The memory is per panel id rather than one shared flag: someone who folds
 * the iCloud form away has said nothing about the Outlook one, and reopening a
 * panel they deliberately closed is the kind of small betrayal that makes a UI
 * feel like it is not listening. Clicks on controls inside the header act on
 * their own and do not fold.
 */
function toggleFoldPanel(id, ev) {
  if (ev && ev.target instanceof Element && ev.target.closest('button,a,input,select,textarea,label')) return false;
  const panel = document.getElementById(id);
  if (!panel) return false;
  const collapsed = !(panel._fold ? panel._fold.target : panel.classList.contains('collapsed'));
  setFold(panel, collapsed);
  localStorage.setItem('mailhub_fold_' + id, collapsed ? '1' : '0');
  return false;
}

/** Restore a panel's stored fold state, or `defaultCollapsed` if it was never touched. */
function initFoldPanel(id, defaultCollapsed = false) {
  const panel = document.getElementById(id);
  if (!panel || panel._fold) return;
  const saved = localStorage.getItem('mailhub_fold_' + id);
  const collapsed = saved === null ? defaultCollapsed : saved === '1';
  panel.classList.toggle('collapsed', collapsed);
  panel.dataset.fold = collapsed ? 'closed' : 'open';
  foldControl(panel)?.setAttribute('aria-expanded', String(!collapsed));
  const header = panel.querySelector(':scope > .panel-header');
  // A header holding its own controls folds through its .fold-toggle button,
  // so it is not made a button itself (no buttons inside a button).
  if (!header || header.hasAttribute('tabindex') || header.querySelector('.fold-toggle')) return;
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', String(!collapsed));
  header.addEventListener('keydown', e => {
    if (e.target !== header || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    header.click();
  });
}
export { foldBody, initFoldPanel, toggleFoldPanel };
