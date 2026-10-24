// js/shell/navigation.js — view switching, nav accessibility, mobile nav.
import { t } from '../core/i18n.js';
import { esc, iconSvg } from '../core/util.js';
import { loadBlockRules, loadBlocks } from '../views/blocks.js';
import { loadDashboard } from '../views/dashboard.js';
import { initGmailTool } from '../views/gmail-tool.js';
import { loadIcloud } from '../views/icloud.js';
import { loadImap } from '../views/imap.js';
import { loadInboxes } from '../views/inboxes.js';
import { loadKeys } from '../views/keys.js';
import { loadOutlook } from '../views/outlook.js';
import { loadProviders } from '../views/providers.js';
import { loadServices } from '../views/services.js';
import { loadSettings } from '../views/settings.js';
import { loadTemplates } from '../views/templates.js';
import { loadYyds } from '../views/yyds.js';
// ─── Navigation ───
function loadView(v) {
  if (v === 'dashboard') loadDashboard();
  else if (v === 'inboxes') loadInboxes();
  else if (v === 'blocks') { loadBlocks(); loadBlockRules(); }
  else if (v === 'services') loadServices();
  else if (v === 'providers') loadProviders();
  else if (v === 'outlook') loadOutlook();
  else if (v === 'yyds') loadYyds();
  else if (v === 'imap') loadImap();
  else if (v === 'icloud') loadIcloud();
  else if (v === 'templates') loadTemplates();
  else if (v === 'gmail-tool') initGmailTool();
  else if (v === 'keys') loadKeys();
  else if (v === 'settings') loadSettings();
}
function refreshCurrentView() {
  const active = document.querySelector('.nav-icon[data-view].active');
  if (active) loadView(active.dataset.view);
  const btn = document.getElementById('nav-refresh');
  btn.classList.remove('spinning');
  void btn.offsetWidth;
  btn.classList.add('spinning');
  btn.addEventListener('animationend', () => btn.classList.remove('spinning'), { once: true });
}

function labelForNavIcon(icon) {
  return icon.closest('.tooltip-wrap')?.querySelector('.tooltip')?.textContent?.trim() || icon.dataset.view || icon.getAttribute('aria-label') || '';
}
function enhanceNavA11y() {
  document.querySelectorAll('.nav-icon').forEach(icon => {
    icon.setAttribute('role', 'button');
    icon.setAttribute('tabindex', '0');
    const label = labelForNavIcon(icon);
    if (label) icon.setAttribute('aria-label', label);
    icon.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        icon.click();
      }
    });
  });
}
function refreshNavLabels() {
  document.querySelectorAll('.nav-icon').forEach(icon => {
    const label = labelForNavIcon(icon);
    if (label) icon.setAttribute('aria-label', label);
  });
}

const MOBILE_PRIMARY_VIEWS = new Set(['dashboard', 'inboxes', 'providers', 'gmail-tool', 'docs']);
let _mobileMoreReady = false;
function setupMobileNav() {
  if (_mobileMoreReady) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  document.querySelectorAll('.tooltip-wrap').forEach(wrap => {
    const icon = wrap.querySelector('.nav-icon');
    if (!icon) return;
    const view = icon.dataset.view;
    if (!view || !MOBILE_PRIMARY_VIEWS.has(view)) wrap.classList.add('mobile-secondary');
  });
  const moreWrap = document.createElement('div');
  moreWrap.className = 'tooltip-wrap mobile-more-wrap';
  moreWrap.innerHTML = `<div class="nav-icon" id="nav-mobile-more" role="button" tabindex="0" aria-label="${t('nav.more')}">${iconSvg('more')}</div><span class="tooltip">${t('nav.more')}</span>`;
  sidebar.appendChild(moreWrap);
  const panel = document.createElement('div');
  panel.id = 'mobile-more-panel';
  panel.className = 'mobile-more-panel';
  document.body.appendChild(panel);
  const trigger = document.getElementById('nav-mobile-more');
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    toggleMobileMore();
  });
  trigger.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMobileMore();
    }
  });
  document.addEventListener('click', e => {
    if (!document.body.classList.contains('mobile-more-open')) return;
    if (panel.contains(e.target) || trigger.contains(e.target)) return;
    closeMobileMore();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 600) closeMobileMore();
  });
  _mobileMoreReady = true;
}
function refreshMobileMoreChrome() {
  const label = t('nav.more');
  const trigger = document.getElementById('nav-mobile-more');
  const tooltip = trigger?.closest('.tooltip-wrap')?.querySelector('.tooltip');
  if (trigger) trigger.setAttribute('aria-label', label);
  if (tooltip) tooltip.textContent = label;
  if (document.body.classList.contains('mobile-more-open')) renderMobileMore();
}
function mobileMoreItems() {
  return [...document.querySelectorAll('.tooltip-wrap.mobile-secondary')]
    .filter(wrap => !wrap.hidden)
    .map(wrap => {
      const icon = wrap.querySelector('.nav-icon');
      if (!icon) return null;
      const label = labelForNavIcon(icon);
      return { icon, label, view: icon.dataset.view || '' };
    })
    .filter(item => item && item.label);
}
function renderMobileMore() {
  const panel = document.getElementById('mobile-more-panel');
  if (!panel) return;
  const items = mobileMoreItems();
  panel.innerHTML = `<div class="mobile-more-grid">${items.map((item, i) => `
    <button class="mobile-more-item" data-mobile-more-index="${i}">
      ${item.view ? iconSvg('info') : iconSvg('more')}
      <span>${esc(item.label)}</span>
    </button>
  `).join('')}</div>`;
  panel.querySelectorAll('[data-mobile-more-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = items[Number(btn.dataset.mobileMoreIndex)];
      closeMobileMore();
      item?.icon.click();
    });
  });
}
function toggleMobileMore() {
  if (document.body.classList.contains('mobile-more-open')) closeMobileMore();
  else openMobileMore();
}
function openMobileMore() {
  renderMobileMore();
  document.body.classList.add('mobile-more-open');
  document.getElementById('mobile-more-panel')?.classList.add('show');
  document.getElementById('nav-mobile-more')?.classList.add('active');
}
function closeMobileMore() {
  document.body.classList.remove('mobile-more-open');
  document.getElementById('mobile-more-panel')?.classList.remove('show');
  document.getElementById('nav-mobile-more')?.classList.remove('active');
}
export { closeMobileMore, enhanceNavA11y, loadView, refreshCurrentView, refreshMobileMoreChrome, refreshNavLabels, setupMobileNav };
