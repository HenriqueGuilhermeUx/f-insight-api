const express = require('express');
const router = express.Router();
const store = require('../services/userMarketPreferencesStore');
const { requireAuthenticatedUser } = require('../services/authMiddleware');

router.use(requireAuthenticatedUser);

router.get('/me', async (req, res) => {
  try {
    const alerts = await store.getAlerts(req.authUser.id);
    return res.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error.message);
    return res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

router.post('/', async (req, res) => {
  try {
    const alert = await store.createAlert({ ...req.body, userId: req.authUser.id });
    return res.json({ success: true, alert });
  } catch (error) {
    console.error('Error creating alert:', error.message);
    if (['TICKER_REQUIRED', 'ALERT_FIELDS_REQUIRED'].includes(error.code)) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to create alert' });
  }
});

router.patch('/:alertId', async (req, res) => {
  try {
    const alert = await store.updateAlert(req.authUser.id, req.params.alertId, req.body || {});
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    return res.json({ success: true, alert });
  } catch (error) {
    console.error('Error updating alert:', error.message);
    if (error.code === 'INVALID_ALERT_VALUE') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update alert' });
  }
});

router.delete('/:alertId', async (req, res) => {
  try {
    const deleted = await store.deleteAlert(req.authUser.id, req.params.alertId);
    if (!deleted) return res.status(404).json({ error: 'Alert not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error.message);
    return res.status(500).json({ error: 'Failed to delete alert' });
  }
});

module.exports = router;
