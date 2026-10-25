const config = require('./config/env');
config.validateEnv();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const { connectDB, isMongoConfigured, checkDatabaseHealth, isDatabaseConnected } = require('./config/db');

const app = express();

// Trust proxy for secure cookies behind reverse proxies (Render, Cloudflare, Vercel, etc.)
app.set('trust proxy', 1);

// Configure CORS for Cookie & Authorization header transmission across any deployed origin
const corsOptions = {
  origin: (origin, callback) => {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Cookie',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Accept-Language',
    'Range'
  ],
  exposedHeaders: ['Set-Cookie']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Database connection fail-fast guard middleware for auth endpoints
const requireDbConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      error: 'Database is not connected',
      message: 'Database service is currently unavailable. Please ensure MongoDB is connected.'
    });
  }
  next();
};

// Auth, Clinical, Pharmacy, Ambulance & AI API Routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', requireDbConnection, authRoutes);
app.use('/user', requireDbConnection, authRoutes);
app.use('/api/health-id', require('./routes/healthIdRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/prescriptions', require('./routes/prescriptionRoutes'));
app.use('/api/pharmacy', require('./routes/pharmacyRoutes'));
app.use('/api/ambulance', require('./routes/ambulanceRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

// System Health Check Endpoint
app.get('/api/health', async (req, res) => {
  const isMongo = isMongoConfigured();
  let dbStatus = { configured: isMongo, connected: false };
  try {
    dbStatus = await checkDatabaseHealth();
  } catch (e) {
    dbStatus = { configured: isMongo, connected: false, error: e.message };
  }

  res.json({
    status: dbStatus.connected ? 'OK' : 'DEGRADED',
    service: 'JIVEXA Health OS Backend Service',
    database: 'MongoDB Atlas',
    activeDatabase: dbStatus.connected
      ? 'MongoDB Atlas'
      : (isMongo ? 'MongoDB Atlas (Unreachable)' : 'DISCONNECTED'),
    authProvider: 'Native JWT / MongoDB Auth',
    otp: {
      enabled: config.auth.otpEnabled,
      status: config.auth.otpEnabled ? 'ACTIVE' : 'TEMPORARILY_DISABLED_FOR_LAUNCH'
    },
    mvpMode: {
      patientMvpOnly: config.auth.patientMvpOnly,
      mode: config.auth.patientMvpOnly ? 'PATIENT_FIRST_MVP' : 'FULL_ECOSYSTEM',
      activeModules: [
        'PATIENT_SIGNUP',
        'PATIENT_LOGIN',
        'EMAIL_VERIFICATION',
        'PATIENT_DASHBOARD',
        'PATIENT_PROFILE',
        'AI_HEALTH_REPORT_ANALYZER',
        'AI_HEALTH_CHATBOT',
        'HEALTH_RECORDS',
        'HEALTH_ID'
      ],
      upcomingModules: [
        { name: 'Doctor Consultations & Appointments', version: 'V2', status: 'COMING_SOON' },
        { name: 'Pharmacy & Medicine Delivery', version: 'V3', status: 'COMING_SOON' },
        { name: 'Ambulance Partner Emergency Fleet', version: 'V4', status: 'COMING_SOON' },
        { name: 'Hospital & Healthcare Ecosystem Admin', version: 'V5', status: 'COMING_SOON' }
      ]
    },
    mongodb: dbStatus,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'JIVEXA Health OS Backend Service',
    database: 'MongoDB Atlas',
    timestamp: new Date().toISOString()
  });
});

// Process safety guards to prevent unhandled EventEmitter or rejection crashes
process.on('unhandledRejection', (reason) => {
  console.warn('[Process] Handled unhandled rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Fatal uncaught exception:', err?.stack || err);
  process.exit(1);
});

const PORT = config.server.port;
const HOST = config.server.host;

const startServer = async () => {
  try {
    // 0. Ensure JWT_SECRET is configured
    if (!config.auth.jwtSecret) {
      console.error('[JIVEXA Backend] Fatal Error: JWT_SECRET environment variable is missing. A secure secret is required to sign and verify authentication tokens. Please configure JWT_SECRET in .env.');
      process.exit(1);
    }

    // 1. Connect to MongoDB with startup retry (up to 3 attempts)
    if (isMongoConfigured()) {
      console.log(`[MongoDB] URI detected (${config.db.getMaskedUri()}). Connecting to MongoDB...`);
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 1500;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await connectDB();
          if (isDatabaseConnected()) break;
        } catch (err) {
          console.warn(`[MongoDB] Startup connection attempt ${attempt}/${MAX_RETRIES} error:`, err.message);
        }
        if (!isDatabaseConnected() && attempt < MAX_RETRIES) {
          console.log(`[MongoDB] Retrying database connection in ${RETRY_DELAY_MS}ms (attempt ${attempt}/${MAX_RETRIES})...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
      if (!isDatabaseConnected()) {
        console.warn('[MongoDB] Failed to connect to MongoDB after 3 attempts. Server will run in degraded mode.');
      }
    } else {
      console.warn('[MongoDB] Database URI (MONGO_URI / MONGO_URL) is not set in backend/.env. Server will run in degraded mode until configured.');
    }

    // 2. Start Express server and attach error listeners explicitly on 0.0.0.0
    const server = app.listen(PORT, HOST, () => {
      console.log(
        `[JIVEXA Backend] Production-Grade Auth Server running in ${
          config.server.nodeEnv
        } mode on http://localhost:${PORT} (bound to ${HOST}:${PORT})`
      );
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `[JIVEXA Backend] Port ${PORT} is already in use by another process. Please terminate the existing process listening on port ${PORT}.`
        );
      } else {
        console.error('[JIVEXA Backend] Server error:', err.message);
      }
    });
  } catch (error) {
    console.error('[JIVEXA Backend] Unexpected startup error:', error);
    process.exit(1);
  }
};

startServer();
