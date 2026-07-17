const express = require('express');
const router = express.Router();
const { supabase, isSupabaseEnabled } = require('../services/supabaseClient');

function now() {
  return new Date().toISOString();
}

async function logAutomationEvent({ source = 'n8n', eventType, status = 'received', tenantId = null, payload = {} }) {
  const event = {
    source,
    event_type: eventType || 'automation_event',
    status,
    tenant_id: tenantId || null,
    payload,
    created_at: now(),
  };

  if (!isSupabaseEnabled()) {
    return { ok: false, event, error: 'Supabase backend not configured' };
  }

  const { data, error } = await supabase
    .from('automation_runs')
    .insert(event)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, event, error: error.message };
  return { ok: true, id: data?.id, event };
}

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'f-insight-automation-bridge',
    supabase: isSupabaseEnabled(),
    timestamp: now(),
    recommendedFlows: [
      'woovi-paid-activation',
      'client-question-alert',
      'new-report-client-notice',
      'weekly-office-digest',
      'health-check',
    ],
  });
});

router.post('/log', async (req, res) => {
  try {
    const result = await logAutomationEvent({
      source: req.body?.source || 'n8n',
      eventType: req.body?.eventType || req.body?.event_type || 'automation_event',
      status: req.body?.status || 'received',
      tenantId: req.body?.tenantId || req.body?.tenant_id || null,
      payload: req.body?.payload || req.body || {},
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to log automation event', message: error.message });
  }
});

router.post('/office-activated', async (req, res) => {
  try {
    const result = await logAutomationEvent({
      source: 'n8n',
      eventType: 'office_activated',
      status: 'done',
      tenantId: req.body?.tenantId || req.body?.tenant_id || null,
      payload: req.body || {},
    });

    res.json({
      ok: result.ok,
      result,
      nextSteps: [
        'Enviar boas-vindas ao escritório',
        'Solicitar logo e identidade visual',
        'Convidar assessores',
        'Convidar primeiros clientes',
        'Validar demo em /demo',
      ],
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to activate office automation', message: error.message });
  }
});

router.post('/client-alert', async (req, res) => {
  try {
    const result = await logAutomationEvent({
      source: 'n8n',
      eventType: 'client_alert',
      status: req.body?.status || 'queued',
      tenantId: req.body?.tenantId || req.body?.tenant_id || null,
      payload: req.body || {},
    });

    res.json({
      ok: result.ok,
      result,
      message: 'Client alert event registered. Use n8n to send email, WhatsApp or internal notification.',
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to register client alert', message: error.message });
  }
});

module.exports = router;
