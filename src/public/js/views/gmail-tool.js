// js/views/gmail-tool.js — Gmail alias tool view.
import { on } from '../core/actions.js';
import { t } from '../core/i18n.js';
import { toast } from '../core/util.js';
// ─── Gmail Alias Tool ───
const GMAIL_RULES = [
  { id: 'dot', nameKey: 'gmail.dot_name', descKey: 'gmail.dot_desc' },
  { id: 'plus', nameKey: 'gmail.plus_name', descKey: 'gmail.plus_desc' },
  { id: 'case', nameKey: 'gmail.case_name', descKey: 'gmail.case_desc' },
  { id: 'domain', nameKey: 'gmail.domain_name', descKey: 'gmail.domain_desc' },
];
const _gmailRuleState = { dot: true, plus: true, case: false, domain: true };
let _gmailToolInited = false;

function initGmailTool() {
  if (_gmailToolInited) return;
  _gmailToolInited = true;
  renderGmailRules();
  renderGmailAliases();
}

function renderGmailRules() {
  const grid = document.getElementById('gmail-rules');
  if (!grid) return;
  grid.innerHTML = GMAIL_RULES.map(r => {
    const active = _gmailRuleState[r.id];
    return `<div class="gmail-rule${active ? ' is-on' : ''}"${on('click', 'toggleGmailRule', r.id)}>
      <div class="gmail-rule-name">${t(r.nameKey)}</div>
      <div class="fs-sm text-3">${t(r.descKey)}</div>
    </div>`;
  }).join('');
}

function toggleGmailRule(id) {
  _gmailRuleState[id] = !_gmailRuleState[id];
  renderGmailRules();
  renderGmailAliases();
}

function renderGmailAliases() {
  const username = (document.getElementById('gmail-username').value || '').trim().toLowerCase().replace(/@.*$/, '').replace(/[^a-z0-9.]/g, '');
  const count = parseInt(document.getElementById('gmail-count').value, 10) || 20;
  const out = document.getElementById('gmail-results');
  if (!username) { out.value = ''; return; }
  out.value = generateGmailAliases(username, count, _gmailRuleState).join('\n');
}

function generateGmailAliases(username, count, rules) {
  const base = username.replace(/\.+/g, '');
  const result = new Set();
  result.add(`${username}@gmail.com`);
  if (rules.domain) result.add(`${username}@googlemail.com`);

  const chars = base.split('');
  const maxAttempts = Math.max(count * 20, 2000);

  for (let attempt = 0; attempt < maxAttempts && result.size < count; attempt++) {
    let local = base;

    if (rules.dot && chars.length >= 2) {
      const positions = [];
      for (let i = 1; i < chars.length; i++) positions.push(i);
      const numDots = Math.max(1, Math.floor(Math.random() * Math.min(positions.length, 4)) + 1);
      const picked = new Set();
      while (picked.size < numDots && picked.size < positions.length) {
        picked.add(positions[Math.floor(Math.random() * positions.length)]);
      }
      const sorted = Array.from(picked).sort((a, b) => b - a);
      const arr = chars.slice();
      for (const p of sorted) arr.splice(p, 0, '.');
      local = arr.join('');
    }

    if (rules.case) {
      local = local.split('').map(c => /[a-z]/.test(c) && Math.random() > 0.5 ? c.toUpperCase() : c).join('');
    }

    if (rules.plus) {
      const len = Math.floor(Math.random() * 5) + 2;
      const pool = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let suffix = '';
      for (let j = 0; j < len; j++) suffix += pool[Math.floor(Math.random() * pool.length)];
      local += '+' + suffix;
    }

    const domain = rules.domain && Math.random() > 0.5 ? 'googlemail.com' : 'gmail.com';
    result.add(`${local}@${domain}`);
  }

  return Array.from(result).slice(0, count);
}

function copyGmailAliases() {
  const text = document.getElementById('gmail-results').value;
  if (!text) return toast(t('validate.no_content'), 'error');
  navigator.clipboard.writeText(text).then(
    () => toast(t('op.copied_n', {n: text.split('\n').length})),
    () => toast(t('validate.copy_failed'), 'error')
  );
}
export { copyGmailAliases, initGmailTool, renderGmailAliases, toggleGmailRule };
