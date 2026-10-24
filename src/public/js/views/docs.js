// js/views/docs.js — API docs view.
import { EL, on } from '../core/actions.js';
import { showDialog } from '../core/dialog.js';
import { applyLang, t } from '../core/i18n.js';
import { esc, escAttr, toast } from '../core/util.js';
// ─── Docs ───
/**
 * The docs view's markup (≈1500 lines of static reference) lives in
 * views/docs.html. It is fetched at startup rather than on first open, so
 * it is in place before the rest of startup runs. Resolves either way, so
 * startup carries on.
 */
async function loadDocsMarkup() {
  const view = document.getElementById('v-docs');
  try {
    const res = await fetch(view.dataset.src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    view.innerHTML = await res.text();
    applyLang();
  } catch (e) {
    console.error('loadDocsMarkup', e);
    // The view keeps its one h1 even when its markup could not be fetched.
    view.innerHTML = `<div class="page-header"><div class="page-title-area"><h1 class="page-title" data-i18n="docs.api_title">${esc(t('docs.api_title'))}</h1></div></div>
    <div class="empty is-error">
      <p>${esc(t('common.load_failed') || 'Load failed')}: ${esc(e.message)}</p>
      <button class="btn btn-sm"${on('click', 'loadDocsMarkup')}>${t('common.retry') || '重试'}</button>
    </div>`;
  }
  return false;
}

// `link` is passed by the delegated handler; a direct call passes only the event.
function scrollDoc(e, link = e.currentTarget) {
  e.preventDefault();
  const id = link.getAttribute('href').slice(1);
  const el = document.getElementById(id);
  if (!el) return;
  const container = document.getElementById('docs-content');
  const header = el.closest('.docs-endpoint-header') || el.closest('.docs-endpoint') || el;
  if (el.closest('.docs-endpoint') && !el.closest('.docs-endpoint').classList.contains('open')) {
    el.closest('.docs-endpoint').classList.add('open');
  }
  header.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.docs-nav a').forEach(a => a.classList.remove('active'));
  link.classList.add('active');
}

/** An endpoint header opens and closes its endpoint. */
function toggleParentOpen(el) { el.parentElement.classList.toggle('open'); }

function copyLlmsUrl() {
  const url = `${location.origin}/v1/llms.txt`;
  navigator.clipboard.writeText(url).then(() => {
    toast(t('toast.copied'));
  }).catch(() => {
    showDialog(t('docs.copy_url'), `<input value="${escAttr(url)}" readonly class="copy-field"${on('click', 'selectText', EL)}>`, `<button class="btn" data-no-loading${on('click', 'hideDialog')}>${t('common.close')}</button>`);
  });
}
export { copyLlmsUrl, loadDocsMarkup, scrollDoc, toggleParentOpen };
