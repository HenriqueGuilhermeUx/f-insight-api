const axios = require('axios');
const { supabase, isSupabaseEnabled } = require('./supabaseClient');

const WOOVI_BASE_URL = process.env.WOOVI_BASE_URL || 'https://api.woovi.com';
const WOOVI_API_KEY = process.env.WOOVI_API_KEY || process.env.WOOVI_APP_ID || process.env.OPENPIX_APP_ID;
const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'https://f-insight.netlify.app';

const PLANS = {
  basic: {
    id: 'basic',
    name: 'F-Insight Basic',
    priceCents: Number(process.env.BILLING_BASIC_CENTS || 49700),
    description: 'Portal white-label, relatórios e cliente final.',
  },
  pro: {
    id: 'pro',
    name: 'F-Insight Pro',
    priceCents: Number(process.env.BILLING_PRO_CENTS || 99700),
    description: 'Basic + conteúdo semanal e calendário editorial.',
  },
  premium: {
    id: 'premium',
    name: 'F-Insight Premium',
    priceCents: Number(process.env.BILLING_PREMIUM_CENTS || 199700),
    description: 'Pro + ferramentas Graham, radar premium, PDF e automações.',
  },
};

function makeCorrelationId(planId, tenantId) {
  const suffix = Math.random().toString(36).slice(2, 10);
  const shortTenant = String(tenantId || 'demo').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 18) || 'demo';
  return `finsight_${planId}_${shortTenant}_${Date.now()}_${suffix}`;
}

function requirePlan(planId) {
  const plan = PLANS[planId];
  if (!plan) {
    const error = new Error('Plano inválido. Use basic, pro ou premium.');
    error.statusCode = 400;
    throw error;
  }
  return plan;
}

function isWooviConfigured() {
  return Boolean(WOOVI_API_KEY);
}

function getWooviHeaders() {
  return {
    Authorization: WOOVI_API_KEY,
    'Content-Type': 'application/json',
  };
}

function extractCharge(payload) {
  return payload?.charge || payload?.data?.charge || payload?.data || payload || {};
}

function getPaymentLink(charge) {
  return charge.paymentLinkUrl || charge.paymentLink || charge.checkoutUrl || charge.url || null;
}

function getQrCode(charge) {
  return charge.qrCodeImage || charge.qrCodeImageUrl || charge.qrCode || null;
}

function getBrCode(charge) {
  return charge.brCode || charge.pixCode || charge.copyPaste || null;
}

async function persistInvoice(invoice) {
  if (!isSupabaseEnabled()) return { ok: false, error: 'Supabase disabled' };

  const row = {
    tenant_id: invoice.tenantId || null,
    plan_id: invoice.planId,
    plan_name: invoice.planName,
    customer_name: invoice.customerName,
    customer_email: invoice.customerEmail,
    customer_tax_id: invoice.customerTaxId || null,
    amount_cents: invoice.amountCents,
    currency: 'BRL',
    status: invoice.status,
    provider: 'woovi',
    correlation_id: invoice.correlationId,
    provider_charge_id: invoice.providerChargeId || null,
    payment_link_url: invoice.paymentLinkUrl || null,
    br_code: invoice.brCode || null,
    qr_code_image: invoice.qrCodeImage || null,
    metadata: invoice.metadata || {},
  };

  const { data, error } = await supabase
    .from('billing_invoices')
    .insert(row)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

async function createDemoCharge(input) {
  const plan = requirePlan(input.planId || 'pro');
  const correlationId = makeCorrelationId(plan.id, input.tenantId);
  const paymentLinkUrl = `${APP_URL}/admin/cobranca?demoPaid=${correlationId}`;

  const invoice = {
    tenantId: input.tenantId,
    planId: plan.id,
    planName: plan.name,
    customerName: input.customerName || 'Escritório Demo',
    customerEmail: input.customerEmail || 'financeiro@demo.com',
    customerTaxId: input.customerTaxId || null,
    amountCents: plan.priceCents,
    status: 'pending',
    correlationId,
    providerChargeId: `demo_${correlationId}`,
    paymentLinkUrl,
    brCode: `000201DEMO-FINSIGHT-${correlationId}`,
    qrCodeImage: null,
    metadata: { demo: true, planDescription: plan.description },
  };

  const persisted = await persistInvoice(invoice);
  return { ...invoice, persisted };
}

async function createWooviCharge(input) {
  const plan = requirePlan(input.planId || 'pro');

  if (!isWooviConfigured()) {
    return createDemoCharge(input);
  }

  const correlationId = makeCorrelationId(plan.id, input.tenantId);
  const body = {
    correlationID: correlationId,
    value: plan.priceCents,
    comment: `${plan.name} - assinatura mensal F-Insight`,
    expiresIn: Number(process.env.WOOVI_CHARGE_EXPIRES_IN || 86400),
    customer: {
      name: input.customerName || 'Escritório',
      email: input.customerEmail || undefined,
      taxID: input.customerTaxId || undefined,
    },
    additionalInfo: [
      { key: 'Produto', value: 'F-Insight White Label' },
      { key: 'Plano', value: plan.name },
      { key: 'Tenant', value: String(input.tenantId || 'demo') },
    ],
  };

  const response = await axios.post(`${WOOVI_BASE_URL}/api/v1/charge`, body, {
    headers: getWooviHeaders(),
    timeout: 15000,
  });

  const charge = extractCharge(response.data);
  const invoice = {
    tenantId: input.tenantId,
    planId: plan.id,
    planName: plan.name,
    customerName: body.customer.name,
    customerEmail: body.customer.email || null,
    customerTaxId: body.customer.taxID || null,
    amountCents: plan.priceCents,
    status: String(charge.status || 'pending').toLowerCase(),
    correlationId: charge.correlationID || correlationId,
    providerChargeId: charge.identifier || charge.id || null,
    paymentLinkUrl: getPaymentLink(charge),
    brCode: getBrCode(charge),
    qrCodeImage: getQrCode(charge),
    metadata: { rawProviderStatus: charge.status || null, planDescription: plan.description },
  };

  const persisted = await persistInvoice(invoice);
  return { ...invoice, persisted };
}

async function getInvoiceByCorrelationId(correlationId) {
  if (!isSupabaseEnabled()) return null;

  const { data, error } = await supabase
    .from('billing_invoices')
    .select('*')
    .eq('correlation_id', correlationId)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

async function updateInvoiceFromWebhook(payload) {
  if (!isSupabaseEnabled()) return { ok: false, error: 'Supabase disabled' };

  const charge = extractCharge(payload);
  const correlationId = charge.correlationID || charge.correlationId || payload?.correlationID;
  const status = String(charge.status || payload?.event || payload?.type || '').toLowerCase();
  const isPaid = status.includes('completed') || status.includes('paid') || status.includes('confirmed');

  if (!correlationId) return { ok: false, error: 'Webhook sem correlationID' };

  const update = {
    status: isPaid ? 'paid' : (status || 'updated'),
    paid_at: isPaid ? new Date().toISOString() : null,
    provider_charge_id: charge.identifier || charge.id || null,
    metadata: { webhook: payload },
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('billing_invoices')
    .update(update)
    .eq('correlation_id', correlationId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, correlationId, status: update.status };
}

module.exports = {
  PLANS,
  isWooviConfigured,
  createWooviCharge,
  getInvoiceByCorrelationId,
  updateInvoiceFromWebhook,
};
