// js/components/config-card.js — tabbed config card.
import { foldBody, initFoldPanel, toggleFoldPanel } from './fold.js';
import { animateSafe, prefersReducedMotion, springOptions } from '../core/motion.js';
// ─── Tabbed config card ───
function isFolded(panel) {
  return panel._fold ? panel._fold.target : panel.classList.contains('collapsed');
}

/**
 * Picking a tab on the folded card opens it on that tab; picking the open
 * tab again folds it; picking another tab switches in place.
 */
function selectConfigTab(id, tab) {
  const panel = document.getElementById(id);
  if (!panel) return false;
  if (!isFolded(panel) && tab === panel.dataset.tab) return toggleFoldPanel(id);
  localStorage.setItem('mailhub_tab_' + id, tab);
  if (isFolded(panel)) {
    showConfigPane(panel, tab, false);
    return toggleFoldPanel(id);
  }
  showConfigPane(panel, tab, true);
  return false;
}

/**
 * Show one pane. On an open card the body resizes in place from the old
 * pane's height to the new one's and the new pane fades up 4px; the end
 * state is set first, so a timer only has to release the overflow clip.
 */
function showConfigPane(panel, tab, animate) {
  const body = foldBody(panel);
  const from = body.offsetHeight;
  body.getAnimations().forEach(a => a.cancel());
  panel.dataset.tab = tab;
  panel.querySelectorAll('.card-tab').forEach(btn => {
    const on = btn.dataset.tab === tab;
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
  });
  let pane = null;
  for (const p of body.querySelectorAll(':scope > .config-pane')) {
    p.hidden = p.dataset.pane !== tab;
    if (!p.hidden) pane = p;
  }
  syncCardTabs(panel, animate);
  if (!animate || !pane || panel._fold || isFolded(panel) || prefersReducedMotion()) return;
  const to = body.offsetHeight;
  const opts = springOptions('snappy');
  if (from !== to) {
    clearTimeout(body._swapTimer);
    body.style.overflow = 'hidden';
    const release = () => { clearTimeout(body._swapTimer); body.style.overflow = ''; };
    const anim = animateSafe(body, [{ height: from + 'px' }, { height: to + 'px' }], opts);
    body._swapTimer = setTimeout(release, opts.duration + 150);
    if (anim) anim.onfinish = release; else release();
  }
  animateSafe(pane, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], opts);
}

/**
 * Wire a tabbed config card: arrow keys between tabs, the underline following
 * the labels' widths, the tab last picked (else the first), and the fold,
 * which starts closed. Safe to call again after tabs are added.
 */
function initConfigCard(id) {
  const card = document.getElementById(id);
  const tabs = card?.querySelector('.card-tabs');
  if (!tabs) return;
  if (!card._tabsReady) {
    card._tabsReady = true;
    // Arrow keys move between tabs (WAI-ARIA tabs pattern).
    tabs.addEventListener('keydown', e => {
      const list = [...tabs.querySelectorAll('.card-tab')];
      const i = list.indexOf(document.activeElement);
      if (i < 0) return;
      const next = e.key === 'ArrowRight' ? list[(i + 1) % list.length]
        : e.key === 'ArrowLeft' ? list[(i - 1 + list.length) % list.length]
        : e.key === 'Home' ? list[0] : e.key === 'End' ? list[list.length - 1] : null;
      if (!next) return;
      e.preventDefault();
      next.focus();
      next.click();
    });
    // Labels change width with the language; the underline follows.
    new ResizeObserver(() => syncCardTabs(card, false)).observe(tabs);
  }
  if (!card._fold) {
    const list = [...tabs.querySelectorAll('.card-tab')];
    const saved = localStorage.getItem('mailhub_tab_' + id);
    const tab = list.some(b => b.dataset.tab === saved) ? saved : list[0]?.dataset.tab;
    if (tab) showConfigPane(card, tab, false);
  }
  initFoldPanel(id, true);
}

/**
 * Open a card on one tab and put the cursor in one of its fields: the way an
 * empty list's call to action, or a row action that needs the form, reaches it.
 */
function openConfigTab(id, tab, focusId) {
  const card = document.getElementById(id);
  if (card && (isFolded(card) || card.dataset.tab !== tab)) selectConfigTab(id, tab);
  document.getElementById(focusId)?.focus();
  return false;
}

/** The 2px underline slides to the current tab; its end position is set before it animates. */
function syncCardTabs(panel, animate) {
  const ind = panel.querySelector('.card-tab-ind');
  const btn = panel.querySelector('.card-tab[aria-selected="true"]');
  if (!ind || !btn) return;
  // The label's offsetParent is .card-tabs (the button is not positioned).
  const label = btn.querySelector('.card-tab-label') || btn;
  const to = { transform: `translateX(${label.offsetLeft}px)`, width: `${label.offsetWidth}px` };
  if (ind.style.transform === to.transform && ind.style.width === to.width) return;
  const placed = ind.style.width !== '';
  const cs = getComputedStyle(ind);
  const from = { transform: cs.transform, width: cs.width };
  ind.getAnimations().forEach(a => a.cancel());
  Object.assign(ind.style, to);
  if (animate && placed && !prefersReducedMotion()) animateSafe(ind, [from, to], springOptions('smooth'));
}
export { initConfigCard, openConfigTab, selectConfigTab };
