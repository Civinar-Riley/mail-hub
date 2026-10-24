// js/components/sortable.js — drag-to-reorder lists.
import { prefersReducedMotion } from '../core/motion.js';
// Pointer-based drag-to-reorder for a .dispatch-list. Mouse and touch alike:
// pressing a grip lifts its row, the row follows the pointer, neighbours
// slide out of the way, and release slides it into the slot. The list is
// only mutated (via onReorder) after the settle transition — or after a
// timeout, since transitionend is not guaranteed (reduced motion, a tab
// frozen by a screenshot tool, a transition cancelled by a re-render).
// Move/up listeners live on window, not on the lifted row: a re-render
// mid-drag detaches the row and would otherwise swallow the pointerup,
// leaving the list stuck in its sorting state for good.
function attachSortable(container, onReorder) {
  if (!container || container.dataset.sortable) return;
  container.dataset.sortable = '1';
  const SETTLE_MS = 180;

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.target.closest('.dispatch-grip')) return;
    const row = e.target.closest('.dispatch-row');
    if (!row || row.parentElement !== container || container.classList.contains('sorting')) return;
    e.preventDefault();

    const rows = [...container.querySelectorAll(':scope > .dispatch-row')];
    const rects = rows.map(r => r.getBoundingClientRect());
    const from = rows.indexOf(row);
    const step = rows.length > 1
      ? (rects[rects.length - 1].bottom - rects[0].top) / rows.length
      : rects[from].height;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    let to = from;
    let done = false;

    container.classList.add('sorting');
    row.classList.add('lifted');
    try { row.setPointerCapture(pointerId); } catch {}

    const place = (clientY) => {
      const dy = clientY - startY;
      row.style.transform = `translateY(${dy}px)`;
      const center = rects[from].top + rects[from].height / 2 + dy;
      const target = rects.reduce((n, r, i) => (i !== from && r.top + r.height / 2 < center ? n + 1 : n), 0);
      if (target === to) return;
      to = target;
      rows.forEach((r, i) => {
        if (i === from) return;
        const shift = i > from && i <= to ? -step : i < from && i >= to ? step : 0;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };

    const unlisten = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
    const cleanup = () => {
      unlisten();
      container.classList.remove('sorting');
      rows.forEach(r => { r.style.transform = ''; r.classList.remove('lifted', 'settling', 'settled'); });
    };
    const finish = (reorder) => {
      if (done) return;
      done = true;
      cleanup();
      if (reorder) onReorder(from, to);
    };
    const commit = () => finish(true);
    // The list changed under the pointer; whatever was dragged no longer
    // maps onto it, so drop the gesture instead of guessing.
    const cancel = () => finish(false);

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (!row.isConnected) { cancel(); return; }
      place(ev.clientY);
    };
    const release = (ev) => {
      if (ev.pointerId !== pointerId) return;
      unlisten();
      if (!row.isConnected) { cancel(); return; }
      row.classList.remove('lifted');
      if (prefersReducedMotion()) { commit(); return; }
      // Settle = the lift played backwards: slide to the slot, shadow fades out.
      row.classList.add('settling');
      requestAnimationFrame(() => {
        row.classList.add('settled');
        row.style.transform = `translateY(${(to - from) * step}px)`;
      });
      row.addEventListener('transitionend', commit, { once: true });
      setTimeout(commit, SETTLE_MS + 80);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  });
}
export { attachSortable };
