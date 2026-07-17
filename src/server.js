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
const billingRoutes = require('./routes/billing');
const automationRoutes = require('./routes/automation');
const { startCronJobs } = require('./services/cronService');
const { isSupabaseEnabled } = require('./services/supabaseClient');

const app = express();

function buildAllowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  return [
    ...configured,
    'https://f-insight.netlify.app',
    'https://finsight.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ];
}

const allowedOrigins = buildAllowedOrigins();

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+--f-insight\.netlify\.app$/i.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(origin)) return true;
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
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
app.use('/api/billing', billingRoutes);
app.use('/api/automation', automationRoutes);

// Health checks
app.get('/', (req, res) => {
  res.json({
    name: 'F-Insight API',
    status: 'ok',
    version: '1.4.0',
    supabase: isSupabaseEnabled(),
    cors: {
      netlifyAllowed: true,
      configuredOrigins: allowedOrigins,
    },
    modules: ['market-data', 'macro', 'signals', 'white-label', 'reports', 'live-cron', 'supabase-cache', 'billing', 'automation-bridge']
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.4.0',
    supabase: isSupabaseEnabled(),
    cors: 'netlify-enabled'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.4.0',
    supabase: isSupabaseEnabled(),
    cors: 'netlify-enabled'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack || err.message);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startCronJobs();
});
