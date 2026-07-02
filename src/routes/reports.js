const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();

function normalizeHex(input, fallback) {
  const raw = String(input || fallback || '').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`;
  return fallback;
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

router.get('/valuation/:ticker.pdf', (req, res) => {
  const ticker = String(req.params.ticker || 'PETR4').toUpperCase();
  const brandName = String(req.query.brandName || 'Escritório Demo Investimentos');
  const primaryColor = normalizeHex(req.query.primaryColor, '#22d3ee');
  const secondaryColor = normalizeHex(req.query.secondaryColor, '#10b981');
  const disclosure = String(
    req.query.disclosure ||
      'Material informativo. Não constitui recomendação individual de investimento.'
  );

  const currentPrice = Number(req.query.price || 38.52);
  const intrinsicValue = Number(req.query.intrinsicValue || 45.5);
  const upside = ((intrinsicValue / currentPrice - 1) * 100).toFixed(1);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${ticker}-valuation-white-label.pdf"`);

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.pipe(res);

  doc.rect(0, 0, 595.28, 110).fill('#0f172a');
  doc.fillColor(primaryColor).fontSize(12).text('RELATÓRIO WHITE LABEL', 48, 32, { continued: false });
  doc.fillColor('#ffffff').fontSize(24).text(`${ticker} | Valuation Inteligente`, 48, 52);
  doc.fillColor('#cbd5e1').fontSize(10).text(brandName, 48, 84);

  doc.moveDown(3);
  doc.fillColor('#0f172a').fontSize(16).text('Resumo Executivo', 48, 140);
  doc.moveDown(0.7);
  doc.fillColor('#334155').fontSize(11).text(
    `Este relatório apresenta uma leitura automatizada de valuation para ${ticker}, combinando preço atual, valor intrínseco estimado, margem de segurança e contexto macroeconômico.`,
    { width: 500, lineGap: 4 }
  );

  const y = 230;
  const cardW = 150;
  const cardH = 82;
  const cards = [
    { title: 'Preço Atual', value: money(currentPrice), color: '#0f172a' },
    { title: 'Valor Intrínseco', value: money(intrinsicValue), color: secondaryColor },
    { title: 'Upside Estimado', value: `${upside}%`, color: primaryColor }
  ];

  cards.forEach((card, index) => {
    const x = 48 + index * (cardW + 18);
    doc.roundedRect(x, y, cardW, cardH, 10).fill('#f8fafc').stroke('#e2e8f0');
    doc.fillColor('#64748b').fontSize(9).text(card.title, x + 14, y + 16);
    doc.fillColor(card.color).fontSize(18).text(card.value, x + 14, y + 38);
  });

  doc.fillColor('#0f172a').fontSize(16).text('Sinal de Alocação', 48, 350);
  doc.moveDown(0.5);
  doc.fillColor('#334155').fontSize(11).text(
    'Sinal atual: priorizar ativos com margem de segurança, boa geração de caixa e resiliência em ambiente de juros relevantes. O relatório deve ser usado como apoio para a conversa entre assessor e cliente.',
    { width: 500, lineGap: 4 }
  );

  doc.moveDown(1.2);
  doc.fillColor('#0f172a').fontSize(16).text('Checklist do Assessor');
  doc.moveDown(0.5);
  [
    'Validar aderência ao perfil do cliente.',
    'Comparar múltiplos com pares do setor.',
    'Revisar risco macro, câmbio, juros e inflação.',
    'Usar margem de segurança antes de aumentar exposição.'
  ].forEach((item) => {
    doc.fillColor(secondaryColor).text('• ', { continued: true });
    doc.fillColor('#334155').fontSize(11).text(item, { lineGap: 3 });
  });

  doc.rect(48, 720, 500, 1).fill('#e2e8f0');
  doc.fillColor('#64748b').fontSize(8).text(disclosure, 48, 735, { width: 500, align: 'center' });
  doc.fillColor(primaryColor).fontSize(8).text('Powered by F-Insight White Label', 48, 755, { width: 500, align: 'center' });

  doc.end();
});

module.exports = router;
