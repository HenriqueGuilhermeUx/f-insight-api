const axios = require('axios');
const {
  dataSupabase: supabase,
  isDataSupabaseEnabled: isSupabaseEnabled,
  dataSupabaseMode,
} = require('./dataSupabaseClient');

const WOOVI_BASE_URL = (process.env.WOOVI_BASE_URL || 'https://api.woovi.com').replace(/\/$/, '');
const WOOVI_API_KEY = process.env.WOOVI_API_KEY || process.env.WOOVI_APP_ID || process.env.OPENPIX_APP_ID;
const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'https://f-insight.org';
const INDIVIDUAL_ACCESS_DAYS = Number(process.env.BILLING_INDIVIDUAL_ACCESS_DAYS || 30);

const PLANS = {
  individual: {
    id: 'individual',
    name: 'F-Insight Premium Individual',
    priceCents: Number(process.env.BILLING_INDIVIDUAL_CENTS || 1990),
    description: 'Meu Futuro IA, Radar IA, watchlist, alertas e ferramentas premium.',
    audience: 'individual',
  },
  basic: {
    id: 'basic',
    name: 'F-Insight Basic',
    priceCents: Number(process.env.BILLING_BASIC_CENTS || 49700),
    description: 'Portal white-label, relatórios e cliente final.',
    audience: 'office',
  },
  pro: {
    id: 'pro',
    name: 'F-Insight Pro',
    priceCents: Number(process.env.BILLING_PRO_CENTS || 99700),
    description: 'Basic + conteúdo semanal e calendário editorial.',
    audience: 'office',
  },
  premium: {
    id: 'premium',
    name: 'F-Insight Premium',
    priceCents: Number(process.env.BILLING_PREMIUM_CENTS || 199700),
    description: 'Pro + ferramentas Graham, radar premium, PDF e automações.',
    audience: 'office',
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
    const error = new Error(`Plano inválido. Use um destes planos: ${Object.keys(PLANS).join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
  return plan;
}

function requireAccountId(accountId) {
  const normalized = String(accountId || '').trim();
  if (!normalized) {
    const error = new Error('Conta obrigatória.');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function isWooviConfigured() {
  return Boolean(WOOVI_API_KEY);
}

function billingPersistenceMode() {
  return isSupabaseEnabled() ? dataSupabaseMode() : 'disabled';
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
  if (!isSupabaseEnabled()) return { ok: false, error: 'Billing persistence disabled' };

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
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('billing_invoices')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return { ok: true, id: data?.id };
  } catch (error) {
    console.warn('Billing invoice persistence failed:', error.message);
    return { ok: false, error: error.message };
  }
}

async function createDemoCharge(input) {
  const plan = requirePlan(input.planId || 'pro');
  const correlationId = makeCorrelationId(plan.id, input.tenantId);
  const demoPath = plan.audience === 'individual' ? '/premium' : '/admin/cobranca';
  const paymentLinkUrl = `${APP_URL}${demoPath}?demoPaid=${encodeURIComponent(correlationId)}`;

  const invoice = {
    tenantId: input.tenantId,
    planId: plan.id,
    planName: plan.name,
    customerName: input.customerName || (plan.audience === 'individual' ? 'Cliente F-Insight' : 'Escritório Demo'),
    customerEmail: input.customerEmail || 'financeiro@demo.com',
    customerTaxId: input.customerTaxId || null,
    amountCents: plan.priceCents,
    status: 'pending',
    correlationId,
    providerChargeId: `demo_${correlationId}`,
    paymentLinkUrl,
    brCode: `000201DEMO-FINSIGHT-${correlationId}`,
    qrCodeImage: null,
    metadata: { demo: true, planDescription: plan.description, audience: plan.audience },
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
      name: input.customerName || (plan.audience === 'individual' ? 'Cliente F-Insight' : 'Escritório'),
      email: input.customerEmail || undefined,
      taxID: input.customerTaxId || undefined,
    },
    additionalInfo: [
      { key: 'Produto', value: plan.audience === 'individual' ? 'F-Insight Premium Individual' : 'F-Insight White Label' },
      { key: 'Plano', value: plan.name },
      { key: 'Conta', value: String(input.tenantId || 'individual') },
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
    metadata: { rawProviderStatus: charge.status || null, planDescription: plan.description, audience: plan.audience },
  };

  const persisted = await persistInvoice(invoice);
  return { ...invoice, persisted };
}

async function getInvoiceByCorrelationId(correlationId) {
  if (!isSupabaseEnabled()) return null;

  try {
    const { data, error } = await supabase
      .from('billing_invoices')
      .select('*')
      .eq('correlation_id', correlationId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.warn('Billing invoice lookup failed:', error.message);
    return null;
  }
}

async function getIndividualEntitlement(accountId) {
  const tenantId = requireAccountId(accountId);

  if (!isSupabaseEnabled()) {
    return { active: false, plan: 'free', paidAt: null, expiresAt: null, correlationId: null };
  }

  try {
    const { data, error } = await supabase
      .from('billing_invoices')
      .select('correlation_id,status,paid_at,created_at')
      .eq('tenant_id', tenantId)
      .eq('plan_id', 'individual')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { active: false, plan: 'free', paidAt: null, expiresAt: null, correlationId: null };
    }

    const paidAt = data.paid_at || data.created_at;
    const paidAtMs = Date.parse(paidAt || '');
    if (!Number.isFinite(paidAtMs)) {
      return { active: false, plan: 'free', paidAt: null, expiresAt: null, correlationId: data.correlation_id };
    }

    const expiresAtMs = paidAtMs + INDIVIDUAL_ACCESS_DAYS * 24 * 60 * 60 * 1000;
    const active = Date.now() < expiresAtMs;

    return {
      active,
      plan: active ? 'premium' : 'free',
      paidAt: new Date(paidAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      correlationId: data.correlation_id,
    };
  } catch (error) {
    console.warn('Billing entitlement lookup failed:', error.message);
    throw error;
  }
}

async function updateInvoiceFromWebhook(payload) {
  if (!isSupabaseEnabled()) return { ok: false, error: 'Billing persistence disabled' };

  const charge = extractCharge(payload);
  const correlationId = charge.correlationID || charge.correlationId || payload?.correlationID;
  const status = String(charge.status || payload?.event || payload?.type || '').toLowerCase();
  const isPaid = status.includes('completed') || status.includes('paid') || status.includes('confirmed');

  if (!correlationId) return { ok: false, error: 'Webhook sem correlationID' };

  const update = {
    status: isPaid ? 'paid' : (status || 'updated'),
    paid_at: isPaid ? new Date().toISOString() : null,
    provider_charge_id: charge.identifier || charge.id || null,
    metadata: { webhookEvent: payload?.event || payload?.type || null },
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from('billing_invoices')
      .update(update)
      .eq('correlation_id', correlationId);

    if (error) throw error;
    return { ok: true, correlationId, status: update.status };
  } catch (error) {
    return { ok: false, error: error.message, correlationId };
  }
}

module.exports = {
  PLANS,
  isWooviConfigured,
  billingPersistenceMode,
  createWooviCharge,
  getInvoiceByCorrelationId,
  getIndividualEntitlement,
  updateInvoiceFromWebhook,
};
