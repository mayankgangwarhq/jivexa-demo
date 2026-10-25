const mongoose = require('mongoose');
const config = require('./env');

let isConnecting = false;
let connectionError = null;

const getMongoUri = () => {
  return config.db.mongoUri;
};

/**
 * Validate MongoDB URI format and ensure no empty or placeholder strings
 */
const isMongoConfigured = () => {
  return config.db.isConfigured();
};

/**
 * Connect to MongoDB Atlas via Mongoose
 */
const connectDB = async () => {
  // If already connected, return existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Prevent concurrent connection attempts
  if (isConnecting || mongoose.connection.readyState === 2) {
    console.log('[MongoDB] Connection attempt already in progress...');
    return null;
  }

  const mongoUri = config.db.mongoUri;

  if (!mongoUri || !config.db.isConfigured()) {
    connectionError = 'Database URI is not configured or contains placeholder credentials';
    console.warn(`[MongoDB Warning] ${connectionError}. Please set a valid MONGO_URI in backend/.env`);
    return null;
  }

  isConnecting = true;
  connectionError = null;

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      autoIndex: !config.server.isProduction
    });

    isConnecting = false;
    connectionError = null;
    console.log(`[MongoDB Connected] Host: ${conn.connection.host} | DB: ${conn.connection.name} (${config.db.getMaskedUri()})`);

    return conn.connection;
  } catch (error) {
    isConnecting = false;
    connectionError = error.message;
    console.error(`[MongoDB Connection Error] Failed to connect: ${error.message}`);
    console.error('[MongoDB Hint] Please check your Atlas Network Access IP allowlist (allow your current IP or 0.0.0.0/0) and ensure special characters in the database password are properly URL-encoded (e.g. using encodeURIComponent).');
    return null;
  }
};

/**
 * Check whether database is actively connected
 */
const isDatabaseConnected = () => {
  return mongoose.connection.readyState === 1;
};

/**
 * Comprehensive health probe for health endpoints
 * Never reports success if connection has failed or is disconnected.
 */
const checkDatabaseHealth = async () => {
  const configured = config.db.isConfigured();
  const readyState = mongoose.connection.readyState;

  if (!configured) {
    return {
      configured: false,
      connected: false,
      database: 'MongoDB Atlas',
      state: 'UNCONFIGURED',
      message: connectionError || 'Database URI (MONGO_URI / MONGO_URL) not configured in backend environment'
    };
  }

  if (readyState !== 1) {
    const stateMap = { 0: 'DISCONNECTED', 2: 'CONNECTING', 3: 'DISCONNECTING' };
    return {
      configured: true,
      connected: false,
      database: 'MongoDB Atlas',
      state: stateMap[readyState] || 'DISCONNECTED',
      message: connectionError || 'MongoDB is not currently connected'
    };
  }

  try {
    // Perform genuine ping to verify active database responsiveness
    await mongoose.connection.db.admin().ping();
    return {
      configured: true,
      connected: true,
      database: 'MongoDB Atlas',
      state: 'CONNECTED',
      name: mongoose.connection.name,
      host: mongoose.connection.host,
      message: 'MongoDB Atlas connected and responsive'
    };
  } catch (pingErr) {
    return {
      configured: true,
      connected: false,
      database: 'MongoDB Atlas',
      state: 'UNRESPONSIVE',
      error: pingErr.message,
      message: 'MongoDB connection established but ping failed'
    };
  }
};

/**
 * Graceful shutdown handler
 */
const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.close(false);
      console.log('[MongoDB] Connection closed gracefully.');
    } catch (err) {
      console.error('[MongoDB] Error during disconnection:', err.message);
    }
  }
};

// Handle process termination events for clean connection cleanup
process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDB();
  process.exit(0);
});

module.exports = {
  connectDB,
  disconnectDB,
  isMongoConfigured,
  isDatabaseConnected,
  checkDatabaseHealth
};
