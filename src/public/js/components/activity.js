// js/components/activity.js — activity log.
import { api } from '../core/api.js';
import { t } from '../core/i18n.js';
import { esc, fmtTime } from '../core/util.js';
// ─── Activity log ───
let _activityLog = [];
function addActivity(type, text, html = false) {
  _activityLog.unshift({ type, text, time: new Date().toISOString(), html });
  if (_activityLog.length > 20) _activityLog.pop();
  renderActivity();
}
function renderActivity() {
  const el = document.getElementById('dash-activity');
  if (!_activityLog.length) { el.innerHTML = '<div class="activity-note">'+ t("dash.no_activity") + '</div>'; return; }
  el.innerHTML = _activityLog.map(a => {
    const safeType = ['green','rose','blue','amber','emerald'].includes(a.type) ? a.type : 'blue';
    return `<div class="activity-item">
      <span class="activity-dot ad-${safeType}"></span>
      <span>${a.html ? a.text : esc(a.text)}</span>
      <span class="activity-time">${fmtTime(a.time, 'date')}</span>
    </div>`;
  }).join('');
}
async function loadActivity() {
  try {
    const data = await api('/activity');
    _activityLog = (data.activities || []).map(a => ({ type: a.type, text: a.text, time: a.time }));
    renderActivity();
  } catch (e) { console.error(e); }
}
export { addActivity, loadActivity };
