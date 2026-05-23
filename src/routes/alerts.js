const express = require('express');
const router = express.Router();

// Simulação em memória
let alerts = new Map();

// Obter alertas de usuário
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userAlerts = alerts.get(userId) || [];

    res.json(userAlerts);
  } catch (error) {
    console.error('Error fetching alerts:', error.message);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Criar alerta
router.post('/', async (req, res) => {
  try {
    const { userId, ticker, type, value, enabled } = req.body;

    if (!userId || !ticker || !type || value === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const userAlerts = alerts.get(userId) || [];

    const alert = {
      id: Date.now().toString(),
      ticker,
      type,
      value,
      enabled: enabled !== false,
      createdAt: new Date().toISOString(),
      triggeredAt: null
    };

    userAlerts.push(alert);
    alerts.set(userId, userAlerts);

    res.json({ success: true, alert });
  } catch (error) {
    console.error('Error creating alert:', error.message);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// Atualizar alerta
router.patch('/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { enabled, value } = req.body;

    for (const [userId, userAlerts] of alerts) {
      const alertIndex = userAlerts.findIndex(a => a.id === alertId);
      if (alertIndex !== -1) {
        if (enabled !== undefined) userAlerts[alertIndex].enabled = enabled;
        if (value !== undefined) userAlerts[alertIndex].value = value;
        alerts.set(userId, userAlerts);
        return res.json({ success: true, alert: userAlerts[alertIndex] });
      }
    }

    res.status(404).json({ error: 'Alert not found' });
  } catch (error) {
    console.error('Error updating alert:', error.message);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// Deletar alerta
router.delete('/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;

    for (const [userId, userAlerts] of alerts) {
      const filteredAlerts = userAlerts.filter(a => a.id !== alertId);
      if (filteredAlerts.length !== userAlerts.length) {
        alerts.set(userId, filteredAlerts);
        return res.json({ success: true });
      }
    }

    res.status(404).json({ error: 'Alert not found' });
  } catch (error) {
    console.error('Error deleting alert:', error.message);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

module.exports = router;