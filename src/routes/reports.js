const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();

function normalizeHex(input, fallback) {
  const raw = String(input || fallback || '').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`;
  return fallback;
}

function money(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

router.get('/valuation/:ticker.pdf', (req, res) => {
  const ticker = String(req.params.ticker || '').trim().toUpperCase();
  if (!ticker) return res.status(400).json({ error: 'ticker is required' });

  const currentPrice = positiveNumber(req.query.price);
  const intrinsicValue = positiveNumber(req.query.intrinsicValue);
  if (currentPrice === null || intrinsicValue === null) {
    return res.status(400).json({
      error: 'verified valuation inputs required',
      message: 'Informe price e intrinsicValue válidos. O F-Insight não usa valores fictícios como fallback de relatório.'
    });
  }

  const brandName = String(req.query.brandName || 'F-Insight');
  const primaryColor = normalizeHex(req.query.primaryColor, '#22d3ee');
  const secondaryColor = normalizeHex(req.query.secondaryColor, '#10b981');
  const disclosure = String(
    req.query.disclosure ||
      'Material informativo e educacional. Não constitui recomendação individual de investimento.'
  );
  const valuationMethod = String(req.query.valuationMethod || 'premissas informadas').slice(0, 120);
  const dataSource = String(req.query.dataSource || 'fonte informada pelo solicitante').slice(0, 160);
  const calculatedAt = String(req.query.calculatedAt || '').trim();
  const referenceDate = calculatedAt && !Number.isNaN(new Date(calculatedAt).getTime())
    ? new Date(calculatedAt).toLocaleString('pt-BR')
    : 'não informada';
  const difference = ((intrinsicValue / currentPrice - 1) * 100).toFixed(1);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${ticker}-valuation-white-label.pdf"`);

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.pipe(res);

  doc.rect(0, 0, 595.28, 110).fill('#0f172a');
  doc.fillColor(primaryColor).fontSize(12).text('RELATÓRIO WHITE LABEL', 48, 32);
  doc.fillColor('#ffffff').fontSize(24).text(`${ticker} | Estudo de Valuation`, 48, 52);
  doc.fillColor('#cbd5e1').fontSize(10).text(brandName, 48, 84);

  doc.moveDown(3);
  doc.fillColor('#0f172a').fontSize(16).text('Resumo do Estudo', 48, 140);
  doc.moveDown(0.7);
  doc.fillColor('#334155').fontSize(11).text(
    `Este material organiza uma comparação entre preço de referência e valor estimado para ${ticker}. O valor estimado depende das premissas e do método utilizados e não representa preço-alvo nem indicação de compra ou venda.`,
    { width: 500, lineGap: 4 }
  );

  const y = 230;
  const cardW = 150;
  const cardH = 82;
  const cards = [
    { title: 'Preço de Referência', value: money(currentPrice), color: '#0f172a' },
    { title: 'Valor Estimado', value: money(intrinsicValue), color: secondaryColor },
    { title: 'Diferença', value: `${difference}%`, color: primaryColor }
  ];

  cards.forEach((card, index) => {
    const x = 48 + index * (cardW + 18);
    doc.roundedRect(x, y, cardW, cardH, 10).fill('#f8fafc').stroke('#e2e8f0');
    doc.fillColor('#64748b').fontSize(9).text(card.title, x + 14, y + 16);
    doc.fillColor(card.color).fontSize(18).text(card.value, x + 14, y + 38);
  });

  doc.fillColor('#0f172a').fontSize(16).text('Premissas e Referência', 48, 350);
  doc.moveDown(0.5);
  doc.fillColor('#334155').fontSize(11).text(`Método: ${valuationMethod}`, { width: 500, lineGap: 4 });
  doc.text(`Fonte dos dados: ${dataSource}`, { width: 500, lineGap: 4 });
  doc.text(`Data/hora de referência: ${referenceDate}`, { width: 500, lineGap: 4 });

  doc.moveDown(1.2);
  doc.fillColor('#0f172a').fontSize(16).text('Perguntas para aprofundar o estudo');
  doc.moveDown(0.5);
  [
    'Quais premissas mais influenciam o valor estimado?',
    'Como os múltiplos se comparam aos pares do setor?',
    'Quais riscos macro, cambiais, operacionais e financeiros alteram o cenário?',
    'Como o resultado muda em cenários mais conservadores ou mais otimistas?'
  ].forEach((item) => {
    doc.fillColor(secondaryColor).text('• ', { continued: true });
    doc.fillColor('#334155').fontSize(11).text(item, { lineGap: 3 });
  });

  doc.rect(48, 720, 500, 1).fill('#e2e8f0');
  doc.fillColor('#64748b').fontSize(8).text(disclosure, 48, 735, { width: 500, align: 'center' });
  doc.fillColor(primaryColor).fontSize(8).text('Powered by F-Insight', 48, 755, { width: 500, align: 'center' });

  return doc.end();
});

module.exports = router;
