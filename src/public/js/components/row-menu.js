// js/components/row-menu.js — row overflow menu.
import { ACTIONS, EL, on } from '../core/actions.js';
import { t } from '../core/i18n.js';
import { animateSafe, prefersReducedMotion, springOptions } from '../core/motion.js';
import { esc, escAttr, iconSvg } from '../core/util.js';
// ─── Row menu (actions past the third) ───
const POP_FRAMES = [{ opacity: 0, transform: 'translateY(-4px) scale(.96)' }, { opacity: 1, transform: 'none' }];
let _rowMenu = null;
/** items: [{ icon, label, danger, action: [name, ...args] }] — the action runs after the menu closes. */
function menuBtn(items) {
  const label = escAttr(t('common.more'));
  return `<span class="menu-wrap"><button class="btn btn-sm btn-icon" aria-haspopup="menu" aria-expanded="false" title="${label}" aria-label="${label}"${on('click', 'toggleRowMenu', EL)}>${iconSvg('more')}</button><div class="menu" role="menu" hidden>${items.map(it => `<button class="menu-item${it.danger ? ' is-danger' : ''}" role="menuitem"${on('click', 'runMenuItem', ...it.action)}>${iconSvg(it.icon)}<span>${esc(it.label)}</span></button>`).join('')}</div></span>`;
}
function runMenuItem(name, ...args) {
  closeRowMenu(true);
  return ACTIONS[name].apply(this, args);
}
/** The menu is position:fixed so the table's scroll box cannot clip it. */
function toggleRowMenu(btn) {
  const menu = btn.nextElementSibling;
  if (_rowMenu && _rowMenu.menu === menu && !_rowMenu.closing) { closeRowMenu(); return false; }
  closeRowMenu(true);
  menu.hidden = false;
  const r = btn.getBoundingClientRect();
  const below = r.bottom + 4 + menu.offsetHeight <= window.innerHeight - 8;
  menu.style.left = `${Math.max(8, Math.round(r.right - menu.offsetWidth))}px`;
  menu.style.top = `${Math.round(below ? r.bottom + 4 : r.top - 4 - menu.offsetHeight)}px`;
  menu.style.transformOrigin = below ? 'top right' : 'bottom right';
  btn.setAttribute('aria-expanded', 'true');
  _rowMenu = { menu, btn, closing: false, timer: 0 };
  if (!prefersReducedMotion()) animateSafe(menu, POP_FRAMES, springOptions('snappy'));
  menu.querySelector('.menu-item')?.focus({ preventScroll: true });
  return false;
}
/**
 * Closing plays the opening keyframes in reverse; `hidden` lands only after
 * that, with a timer in case `finish` never fires. `immediate` skips the
 * animation for a menu that is being replaced or whose item was just chosen.
 */
function closeRowMenu(immediate = false) {
  const state = _rowMenu;
  if (!state) return;
  const done = () => {
    if (_rowMenu === state) _rowMenu = null;
    clearTimeout(state.timer);
    state.menu.getAnimations().forEach(a => a.cancel());
    state.menu.hidden = true;
    state.btn.setAttribute('aria-expanded', 'false');
  };
  if (immediate || prefersReducedMotion() || !state.menu.isConnected) { done(); return; }
  if (state.closing) return;
  state.closing = true;
  state.menu.getAnimations().forEach(a => a.cancel());
  const opts = springOptions('snappy');
  const anim = animateSafe(state.menu, POP_FRAMES, { ...opts, direction: 'reverse', fill: 'forwards' });
  if (anim) anim.onfinish = done;
  state.timer = setTimeout(done, opts.duration + 150);
}
export { _rowMenu, closeRowMenu, runMenuItem, toggleRowMenu };
