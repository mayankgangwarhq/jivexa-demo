/**
 * JIVEXA Health OS - Centralized Environment & API Configuration
 * 
 * Safely resolves and loads environment variables across local development
 * (backend/.env, .env) and production environments (Render, Cloud).
 * Validates configuration at startup without exposing secret values.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// 1. Resolve .env file paths (check backend/.env, then root .env)
const envPaths = [
  path.resolve(__dirname, '../../.env'),       // backend/.env
  path.resolve(process.cwd(), 'backend/.env'), // from project root
  path.resolve(process.cwd(), '.env'),         // project root .env
  path.resolve(__dirname, '../../../.env')     // parent directory
];

let loadedEnvFile = null;
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    loadedEnvFile = p;
    break;
  }
}

// Fallback to standard dotenv.config() if no file was explicitly matched
if (!loadedEnvFile) {
  dotenv.config();
}

/**
 * Clean string value by trimming whitespace and removing accidental surrounding quotes
 */
const cleanString = (val) => {
  if (!val || typeof val !== 'string') return '';
  return val.trim().replace(/^['"]|['"]$/g, '');
};

// 2. Centralized Configuration Object
const config = {
  // Server & Network
  server: {
    port: parseInt(process.env.PORT, 10) || 4000,
    host: cleanString(process.env.HOST) || '0.0.0.0',
    nodeEnv: cleanString(process.env.NODE_ENV) || 'development',
    isProduction: cleanString(process.env.NODE_ENV) === 'production',
    frontendUrl: cleanString(process.env.FRONTEND_URL) || 'http://localhost:5173'
  },

  // Primary Database: MongoDB Atlas (Mongoose)
  db: {
    // Support standard MONGO_URI, plus common cloud aliases
    mongoUri: cleanString(
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      process.env.MONGO_URL ||
      process.env.DATABASE_URL
    ),
    isConfigured() {
      const uri = this.mongoUri;
      if (!uri) return false;
      if (uri.includes('<username>') || uri.includes('<password>') || uri.includes('<cluster>')) return false;
      return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
    },
    getMaskedUri() {
      const uri = this.mongoUri;
      if (!uri) return 'NOT_CONFIGURED';
      return uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    }
  },

  // Authentication & Security
  auth: {
    jwtSecret: cleanString(process.env.JWT_SECRET) || 'jivexa_health_jwt_secret_key_2026_super_secure_auth_token_string',
    isDefaultJwtSecret: !process.env.JWT_SECRET,
    otpEnabled: cleanString(process.env.OTP_ENABLED) === 'true',
    patientMvpOnly: cleanString(process.env.PATIENT_MVP_ONLY) === 'true'
  },

  // AI Engine 1: Existing General Health Chatbot (Chatbot A)
  chatbotAi: {
    apiKey: cleanString(process.env.GEMINI_CHATBOT_API_KEY || process.env.GEMINI_API_KEY),
    model: cleanString(process.env.GEMINI_CHATBOT_MODEL || process.env.GEMINI_MODEL) || 'gemini-3.5-flash-lite',
    isConfigured() {
      return Boolean(this.apiKey && !this.apiKey.includes('<') && this.apiKey.length > 5);
    }
  },

  // AI Engine 2: Medical Report Analyzer & Report Assistant Chatbot (Chatbot B)
  reportAi: {
    apiKey: cleanString(process.env.GEMINI_REPORT_API_KEY || process.env.GEMINI_API_KEY),
    model: cleanString(process.env.GEMINI_REPORT_MODEL || process.env.GEMINI_MODEL) || 'gemini-3.5-flash-lite',
    isConfigured() {
      return Boolean(this.apiKey && !this.apiKey.includes('<') && this.apiKey.length > 5);
    }
  },

  // Backward-compatible reference for modules referencing config.ai
  ai: {
    get geminiApiKey() {
      return config.chatbotAi.apiKey;
    },
    set geminiApiKey(val) {
      config.chatbotAi.apiKey = val;
    },
    get geminiModel() {
      return config.chatbotAi.model;
    },
    set geminiModel(val) {
      config.chatbotAi.model = val;
    },
    isConfigured() {
      return config.chatbotAi.isConfigured();
    }
  },

  // Email / SMTP Dispatch Service (Nodemailer)
  smtp: {
    host: cleanString(process.env.SMTP_HOST) || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: cleanString(process.env.SMTP_SECURE) === 'true',
    user: cleanString(process.env.SMTP_USER),
    pass: cleanString(process.env.SMTP_PASS),
    from: cleanString(process.env.SMTP_FROM) || '"JIVEXA Health" <support@jivexa.com>',
    isConfigured() {
      return Boolean(this.user && this.pass && !this.user.includes('<') && !this.pass.includes('<'));
    }
  },

  // Metadata
  loadedEnvFile,

  /**
   * Diagnostic startup validation (never leaks secrets or passwords)
   */
  validateEnv() {
    console.log('----------------------------------------------------------------');
    console.log('[JIVEXA CONFIG] Centralized Environment Initialized');
    console.log(`[JIVEXA CONFIG] Environment Mode : ${this.server.nodeEnv}`);
    console.log(`[JIVEXA CONFIG] Server Binding   : ${this.server.host}:${this.server.port}`);
    console.log(`[JIVEXA CONFIG] Frontend Target  : ${this.server.frontendUrl}`);
    console.log(`[JIVEXA CONFIG] Loaded From      : ${this.loadedEnvFile || 'Process Environment (Cloud/Render)'}`);
    console.log(`[JIVEXA CONFIG] MongoDB Atlas    : ${this.db.isConfigured() ? `CONFIGURED (${this.db.getMaskedUri()})` : 'DEGRADED (MONGO_URI not set)'}`);
    console.log(`[JIVEXA CONFIG] Gemini AI Engine : ${this.ai.isConfigured() ? `ACTIVE (Model: ${this.ai.geminiModel})` : 'UNCONFIGURED (Add GEMINI_API_KEY to backend/.env)'}`);
    console.log(`[JIVEXA CONFIG] Auth JWT Secret  : ${this.auth.isDefaultJwtSecret ? 'WARNING: Default Fallback Key in use' : 'CONFIGURED (Custom Secret)'}`);
    console.log(`[JIVEXA CONFIG] Email / SMTP     : ${this.smtp.isConfigured() ? `ACTIVE (${this.smtp.host}:${this.smtp.port})` : 'CONSOLE_LOGS_ONLY'}`);
    console.log(`[JIVEXA CONFIG] Feature Flags    : OTP=${this.auth.otpEnabled} | PatientMVP=${this.auth.patientMvpOnly}`);
    console.log('----------------------------------------------------------------');
  }
};

module.exports = config;
