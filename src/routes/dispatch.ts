import { Hono } from 'hono';
import { requireAdmin, type AdminEnv } from './admin.js';
import {
  DispatchRuleError,
  computeDefaultOrder,
  deleteRule,
  evaluateDispatch,
  listRules,
  normalizeService,
  saveRule,
} from '../dispatch-rules.js';

export const dispatchRoutes = new Hono<AdminEnv>();

const PREVIEW_NOTE = 'Blocked-domain filtering happens at create time and is not previewed.';

// Dry run: the order dispatch would walk for this service and why each entry
// is or is not eligible right now. Local computation only — nothing upstream
// is called and nothing changes. Open to every authenticated caller, like the
// provider listing whose rate status it repeats.
dispatchRoutes.get('/dispatch/preview', (c) => {
  const service = c.req.query('for')?.trim() || undefined;
  const needPolling = c.req.query('needPolling') !== 'false';
  const { source, others, candidates } = evaluateDispatch({ service, needPolling });
  return c.json({
    service: service ?? null,
    rule: { source, others },
    candidates,
    note: PREVIEW_NOTE,
  });
});

dispatchRoutes.use('/dispatch/rules', requireAdmin);
dispatchRoutes.use('/dispatch/rules/*', requireAdmin);

dispatchRoutes.get('/dispatch/rules', (c) => {
  return c.json({ defaultOrder: computeDefaultOrder(), rules: listRules() });
});

dispatchRoutes.put('/dispatch/rules/:service', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const rule = saveRule(decodeURIComponent(c.req.param('service')), body);
    return c.json(rule);
  } catch (error) {
    if (error instanceof DispatchRuleError) return c.json({ error: error.message }, 400);
    throw error;
  }
});

dispatchRoutes.delete('/dispatch/rules/:service', (c) => {
  try {
    const service = normalizeService(decodeURIComponent(c.req.param('service')));
    deleteRule(service);
    return c.json({ ok: true });
  } catch (error) {
    if (error instanceof DispatchRuleError) return c.json({ error: error.message }, 400);
    throw error;
  }
});
