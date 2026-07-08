const express = require('express');
const router = express.Router();
const {
  PLANS,
  isWooviConfigured,
  createWooviCharge,
  getInvoiceByCorrelationId,
  updateInvoiceFromWebhook,
} = require('../services/wooviBillingService');

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

router.get('/plans', (req, res) => {
  res.json({
    provider: 'woovi',
    wooviConfigured: isWooviConfigured(),
    plans: Object.values(PLANS),
  });
});

router.post('/checkout', async (req, res) => {
  try {
    const invoice = await createWooviCharge({
      tenantId: req.body?.tenantId,
      planId: req.body?.planId || 'pro',
      customerName: req.body?.customerName,
      customerEmail: req.body?.customerEmail,
      customerTaxId: req.body?.customerTaxId,
    });

    res.json({
      ok: true,
      provider: 'woovi',
      demoMode: !isWooviConfigured(),
      invoice: publicInvoice(invoice),
      persisted: invoice.persisted,
    });
  } catch (error) {
    console.error('Billing checkout failed:', error.response?.data || error.message);
    res.status(error.statusCode || 500).json({
      ok: false,
      error: 'Falha ao gerar cobrança',
      message: error.response?.data?.message || error.message,
      providerData: error.response?.data,
    });
  }
});

router.get('/invoice/:correlationId', async (req, res) => {
  try {
    const invoice = await getInvoiceByCorrelationId(req.params.correlationId);
    if (!invoice) return res.status(404).json({ ok: false, error: 'Cobrança não encontrada' });
    return res.json({ ok: true, invoice: publicInvoice(invoice) });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Falha ao consultar cobrança', message: error.message });
  }
});

router.post('/webhooks/woovi', async (req, res) => {
  try {
    const result = await updateInvoiceFromWebhook(req.body);
    res.json({ ok: true, result });
  } catch (error) {
    console.error('Woovi webhook failed:', error.message);
    res.status(500).json({ ok: false, error: 'Webhook failed', message: error.message });
  }
});

module.exports = router;
