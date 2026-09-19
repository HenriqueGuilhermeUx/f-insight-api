const express = require('express');
const router = express.Router();
const {
  PLANS,
  isWooviConfigured,
  billingPersistenceMode,
  createWooviCharge,
  getInvoiceByCorrelationId,
  getIndividualEntitlement,
  getOfficeEntitlement,
  updateInvoiceFromWebhook,
} = require('../services/wooviBillingService');
const { verifyWooviWebhook } = require('../services/wooviWebhookVerifier');
const { requireAuthenticatedUser } = require('../services/authMiddleware');

function publicInvoice(invoice) {
  if (!invoice) return null;
  return {
    id: invoice.id,
    tenantId: invoice.tenant_id || invoice.tenantId,
    planId: invoice.plan_id || invoice.planId,
    planName: invoice.plan_name || invoice.planName,
    customerName: invoice.customer_name || invoice.customerName,
    customerEmail: invoice.customer_email || invoice.customerEmail,
    amountCents: invoice.amount_cents || invoice.amountCents,
    currency: invoice.currency || 'BRL',
    status: invoice.status,
    correlationId: invoice.correlation_id || invoice.correlationId,
    paymentLinkUrl: invoice.payment_link_url || invoice.paymentLinkUrl,
    brCode: invoice.br_code || invoice.brCode,
    qrCodeImage: invoice.qr_code_image || invoice.qrCodeImage,
    paidAt: invoice.paid_at || invoice.paidAt,
    createdAt: invoice.created_at || invoice.createdAt,
  };
}

function invoiceTenantId(invoice) {
  return String(invoice?.tenant_id || invoice?.tenantId || '');
}

function invoicePlanId(invoice) {
  return String(invoice?.plan_id || invoice?.planId || '');
}

router.get('/plans', (_req, res) => {
  res.json({
    provider: 'woovi',
    wooviConfigured: isWooviConfigured(),
    persistence: billingPersistenceMode(),
    plans: Object.values(PLANS),
  });
});

router.post('/checkout', requireAuthenticatedUser, async (req, res) => {
  try {
    const planId = req.body?.planId || 'individual';
    const isIndividual = planId === 'individual';

    if (!isIndividual && req.authUser.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN_BILLING_PLAN' });
    }

    if (!isIndividual && !req.authUser.tenantId) {
      return res.status(403).json({ ok: false, error: 'TENANT_MEMBERSHIP_REQUIRED' });
    }

    const invoice = await createWooviCharge({
      tenantId: isIndividual ? req.authUser.id : req.authUser.tenantId,
      planId,
      customerName: req.body?.customerName,
      customerEmail: isIndividual ? req.authUser.email : req.body?.customerEmail,
      customerTaxId: req.body?.customerTaxId,
    });

    return res.json({
      ok: true,
      provider: 'woovi',
      demoMode: !isWooviConfigured(),
      invoice: publicInvoice(invoice),
      persisted: invoice.persisted,
    });
  } catch (error) {
    console.error('Billing checkout failed:', error.response?.data || error.message);
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Falha ao gerar cobrança',
      message: error.response?.data?.message || error.message,
    });
  }
});

router.post('/entitlement', requireAuthenticatedUser, async (req, res) => {
  try {
    const individual = await getIndividualEntitlement(req.authUser.id);
    const office = req.authUser.tenantId
      ? await getOfficeEntitlement(req.authUser.tenantId)
      : null;

    return res.json({
      ok: true,
      entitlement: {
        ...individual,
        office,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Falha ao consultar acesso',
      message: error.message,
    });
  }
});

router.get('/invoice/:correlationId', requireAuthenticatedUser, async (req, res) => {
  try {
    const invoice = await getInvoiceByCorrelationId(req.params.correlationId);
    if (!invoice) return res.status(404).json({ ok: false, error: 'Cobrança não encontrada' });

    const ownerId = invoicePlanId(invoice) === 'individual'
      ? req.authUser.id
      : req.authUser.tenantId;
    const ownsInvoice = Boolean(ownerId) && invoiceTenantId(invoice) === String(ownerId);

    if (!ownsInvoice) {
      return res.status(404).json({ ok: false, error: 'Cobrança não encontrada' });
    }

    return res.json({ ok: true, invoice: publicInvoice(invoice) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Falha ao consultar cobrança', message: error.message });
  }
});

router.post('/webhooks/woovi', async (req, res) => {
  try {
    const signature = req.get('x-webhook-signature');
    const valid = await verifyWooviWebhook({ rawBody: req.rawBody, signature });
    if (!valid) {
      return res.status(401).json({ ok: false, error: 'Invalid webhook signature' });
    }

    const result = await updateInvoiceFromWebhook(req.body);
    if (!result.ok) {
      return res.status(500).json({ ok: false, error: 'Webhook persistence failed' });
    }
    return res.json({ ok: true, result });
  } catch (error) {
    console.error('Woovi webhook failed:', error.message);
    return res.status(503).json({ ok: false, error: 'Webhook verification unavailable' });
  }
});

module.exports = router;
