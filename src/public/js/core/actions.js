// js/core/actions.js — event delegation: markup names a registered handler; one listener per event type runs it.
import { escAttr } from './util.js';
/**
 * Markup carries `data-on-<event>="name"` and, when the handler takes
 * arguments, `data-args="[…]"` (JSON) — both written by on(). Placeholders
 * stand for what only the event knows: EL (the element carrying the attribute),
 * EVENT, CHECKED, VALUE, and NUMBER (its value as a number).
 *
 * Only the nearest element with a handler for the event runs it, so a button
 * inside a clickable header acts on its own. A handler returning false cancels
 * the default action, as `return false` did inline; a key filter
 * ('keydown:Enter') cancels it whenever the key matches. A click on a .btn shows
 * the loading state until a returned promise settles, unless the button opts
 * out with data-no-loading.
 */
const ACTIONS = Object.create(null);
const EL = { $: 'el' };
const EVENT = { $: 'event' };
const CHECKED = { $: 'checked' };
const VALUE = { $: 'value' };
const NUMBER = { $: 'number' };

/** Register handlers by name; boot.js registers every one the markup names. */
function actions(handlers) {
  Object.assign(ACTIONS, handlers);
}

/** The attributes that make an element run ACTIONS[name](...args) on `event` ('click', 'keydown:Enter', …). */
function on(event, name, ...args) {
  const [type, key] = event.split(':');
  return ` data-on-${type}="${name}"` + (key ? ` data-key="${key}"` : '') + (args.length ? ` data-args="${escAttr(JSON.stringify(args))}"` : '');
}

function actionArgs(el, event) {
  const raw = el.getAttribute('data-args');
  if (!raw) return [];
  return JSON.parse(raw).map(a => {
    if (!a || typeof a !== 'object' || !('$' in a)) return a;
    return { el, event, checked: el.checked, value: el.value, number: +el.value }[a.$];
  });
}

function runAction(el, event, type) {
  const name = el.getAttribute('data-on-' + type);
  const fn = ACTIONS[name];
  if (!fn) { console.error('No handler registered for', name); return undefined; }
  const key = el.getAttribute('data-key');
  if (key) {
    if (event.key !== key) return undefined;
    event.preventDefault();
  }
  const result = fn.apply(el, actionArgs(el, event));
  if (result === false) event.preventDefault();
  return result;
}

/** A click on a .btn: loading state on, the action, loading state off once it settles. */
function runButtonAction(btn, event) {
  // Nothing past the button sees the click, as with the loading interceptor in boot.js.
  event.stopImmediatePropagation();
  btn.setAttribute('data-loading', '');
  btn.disabled = true;
  const done = () => { btn.removeAttribute('data-loading'); btn.disabled = btn.dataset.batchBusy === '1'; };
  let result;
  try { result = runAction(btn, event, 'click'); } catch (err) { done(); console.error('Button action failed', err); return; }
  if (result && typeof result.then === 'function') result.catch(err => console.warn('Button action failed', err)).finally(done);
  else done();
}

function initActions() {
  // Capture, as the loading interceptor did: the nearest handler runs first.
  document.addEventListener('click', event => {
    const el = event.target instanceof Element ? event.target.closest('[data-on-click]') : null;
    if (!el) return;
    if (el.matches('.btn') && !el.hasAttribute('data-no-loading')) {
      if (!el.hasAttribute('data-loading') && !el.disabled) runButtonAction(el, event);
      return;
    }
    runAction(el, event, 'click');
  }, true);
  for (const type of ['change', 'input', 'keydown', 'submit']) {
    document.addEventListener(type, event => {
      const el = event.target instanceof Element ? event.target.closest(`[data-on-${type}]`) : null;
      if (el) runAction(el, event, type);
    });
  }
  // load does not bubble, but capture still sees it.
  document.addEventListener('load', event => {
    if (event.target instanceof Element && event.target.hasAttribute('data-on-load')) runAction(event.target, event, 'load');
  }, true);
}
export { ACTIONS, CHECKED, EL, NUMBER, VALUE, actions, initActions, on };
