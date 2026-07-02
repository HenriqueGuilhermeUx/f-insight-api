const express = require('express');
const router = express.Router();

const defaultBranding = {
  tenantId: 'demo',
  tenantName: 'Escritorio Demo',
  brandName: 'Escritorio Demo Investimentos',
  logoDataUrl: '',
  primaryColor: '#22d3ee',
  secondaryColor: '#10b981',
  reportFooter: 'Relatorio gerado pela plataforma F-Insight White Label.',
  disclosure: 'Material informativo. Nao constitui recomendacao individual de investimento.',
  updatedAt: new Date().toISOString()
};

const brandingStore = new Map([[defaultBranding.tenantId, defaultBranding]]);

function buildBranding(payload) {
  const data = payload || {};
  const tenantId = String(data.tenantId || defaultBranding.tenantId).trim() || defaultBranding.tenantId;
  return {
    tenantId,
    tenantName: String(data.tenantName || data.brandName || defaultBranding.tenantName).trim(),
    brandName: String(data.brandName || data.tenantName || defaultBranding.brandName).trim(),
    logoDataUrl: String(data.logoDataUrl || ''),
    primaryColor: String(data.primaryColor || defaultBranding.primaryColor),
    secondaryColor: String(data.secondaryColor || defaultBranding.secondaryColor),
    reportFooter: String(data.reportFooter || defaultBranding.reportFooter),
    disclosure: String(data.disclosure || defaultBranding.disclosure),
    updatedAt: new Date().toISOString()
  };
}

router.get('/current', (req, res) => {
  const tenantId = String(req.query.tenantId || defaultBranding.tenantId);
  res.json(brandingStore.get(tenantId) || defaultBranding);
});

router.post('/current', (req, res) => {
  const branding = buildBranding(req.body);
  brandingStore.set(branding.tenantId, branding);
  res.json({ success: true, tenant: branding });
});

router.get('/:tenantId', (req, res) => {
  const branding = brandingStore.get(req.params.tenantId);
  if (!branding) return res.status(404).json({ error: 'Branding not found' });
  res.json(branding);
});

router.post('/:tenantId', (req, res) => {
  const branding = buildBranding({ ...req.body, tenantId: req.params.tenantId });
  brandingStore.set(branding.tenantId, branding);
  res.json({ success: true, tenant: branding });
});

module.exports = router;
