require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const stockRoutes = require('./routes/stocks');
const cryptoRoutes = require('./routes/crypto');
const newsRoutes = require('./routes/news');
const indicatorsRoutes = require('./routes/indicators');
const watchlistRoutes = require('./routes/watchlist');
const alertsRoutes = require('./routes/alerts');
const macroRoutes = require('./routes/macro');
const allocationSignalRoutes = require('./routes/allocationSignals');
const brandingRoutes = require('./routes/branding');
const reportRoutes = require('./routes/reports');
const liveRoutes = require('./routes/live');
const { startCronJobs } = require('./services/cronService');
const { isSupabaseEnabled } = require('./services/supabaseClient');

const app = express();

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*'
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '8mb' }));

// Routes
app.use('/api/stocks', stockRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/indicators', indicatorsRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/macro', macroRoutes);
app.use('/api/signals', allocationSignalRoutes);
app.use('/api/tenants', brandingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/live', liveRoutes);

// Health checks
app.get('/', (req, res) => {
  res.json({
    name: 'F-Insight API',
    status: 'ok',
    version: '1.2.0',
    supabase: isSupabaseEnabled(),
    modules: ['market-data', 'macro', 'signals', 'white-label', 'reports', 'live-cron', 'supabase-cache']
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.2.0',
    supabase: isSupabaseEnabled()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.2.0',
    supabase: isSupabaseEnabled()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startCronJobs();
});
