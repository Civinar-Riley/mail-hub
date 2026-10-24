// js/components/scope-tabs.js — sliding scope tabs.
import { prefersReducedMotion } from '../core/motion.js';
import { viewInbox, viewMailbox } from '../views/inboxes.js';
let _scopeIndAt = null;
/** Forget where the indicator was, so the next panel places it without sliding. */
function resetScopeIndicator() { _scopeIndAt = null; }

/**
 * Switching scope re-renders the whole panel, indicator included, so animating
 * the OLD indicator on click was pointless — the replacement landed 10ms later
 * at its final position and cut the slide off. The new indicator is instead
 * placed where the old one was, then moved on the next frame, so the slide runs
 * in full no matter how fast the fetch came back.
 */
function syncScopeIndicator(tabs) {
  const ind = tabs?.querySelector('.scope-ind');
  const active = tabs?.querySelector('.scope-tab.active');
  if (!ind || !active) return;
  const to = { left: active.offsetLeft, width: active.offsetWidth };
  const from = _scopeIndAt;
  _scopeIndAt = to;
  const place = (p) => { ind.style.left = `${p.left}px`; ind.style.width = `${p.width}px`; };
  if (!from || prefersReducedMotion() || (from.left === to.left && from.width === to.width)) {
    place(to);
    return;
  }
  ind.style.transition = 'none';
  place(from);
  requestAnimationFrame(() => { ind.style.transition = ''; place(to); });
}

function scopeSwitch(btn, target, email, inboxId) {
  return target === 'mailbox' ? viewMailbox(email, inboxId) : viewInbox(inboxId);
}
export { resetScopeIndicator, scopeSwitch, syncScopeIndicator };
