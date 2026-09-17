const express = require('express');
const router = express.Router();
const store = require('../services/userMarketPreferencesStore');

router.get('/:userId', async (req, res) => {
  try {
    const alerts = await store.getAlerts(req.params.userId);
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error.message);
    const status = error.code === 'USER_ID_REQUIRED' ? 400 : 500;
    res.status(status).json({ error: status === 400 ? error.message : 'Failed to fetch alerts' });
  }
});

router.post('/', async (req, res) => {
  try {
    const alert = await store.createAlert(req.body || {});
    res.json({ success: true, alert });
  } catch (error) {
    console.error('Error creating alert:', error.message);
    if (['USER_ID_REQUIRED', 'TICKER_REQUIRED', 'ALERT_FIELDS_REQUIRED'].includes(error.code)) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

router.patch('/:alertId', async (req, res) => {
  try {
    const alert = await store.updateAlert(req.params.alertId, req.body || {});
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json({ success: true, alert });
  } catch (error) {
    console.error('Error updating alert:', error.message);
    if (error.code === 'INVALID_ALERT_VALUE') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

router.delete('/:alertId', async (req, res) => {
  try {
    const deleted = await store.deleteAlert(req.params.alertId);
    if (!deleted) return res.status(404).json({ error: 'Alert not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error.message);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

module.exports = router;
