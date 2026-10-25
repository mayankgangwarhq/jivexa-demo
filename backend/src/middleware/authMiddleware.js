const config = require('../config/env');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isDatabaseConnected } = require('../config/db');

const JWT_FALLBACK_SECRET = config.auth.jwtSecret;

const protect = async (req, res, next) => {
  let token;

  // 1. Check for token in Cookies (from httpOnly cookie)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 2. Check for token in Authorization Header (Bearer token format)
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Please login first to access this resource',
      error: 'Not authorized, no token provided'
    });
  }

  try {
    const secretKey = config.auth.jwtSecret;
    const decoded = jwt.verify(token, secretKey);

    if (!decoded || (!decoded.id && !decoded.email)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload',
        error: 'Invalid token'
      });
    }

    // Lookup user in MongoDB
    let user = null;
    if (decoded.id) {
      user = await User.findOne({ _id: String(decoded.id) });
    }
    if (!user && decoded.email) {
      user = await User.findOne({ email: String(decoded.email).toLowerCase().trim() });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User associated with this token no longer exists'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware Verification Error]:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Authentication session expired or invalid. Please login again.',
      error: error.message
    });
  }
};

// Optional auth middleware (identifies user if token is present, does not block if not)
const optionalProtect = async (req, res, next) => {
  let token;

  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const secretKey = config.auth.jwtSecret;
    const decoded = jwt.verify(token, secretKey);

    if (!decoded || (!decoded.id && !decoded.email)) {
      req.user = null;
      return next();
    }

    let user = null;
    if (decoded.id) {
      user = await User.findOne({ _id: String(decoded.id) });
    }
    if (!user && decoded.email) {
      user = await User.findOne({ email: String(decoded.email).toLowerCase().trim() });
    }

    req.user = user || null;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

// Role authorization guard
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user ? req.user.role : 'Guest'}' is not authorized to perform this action`
      });
    }
    next();
  };
};

module.exports = {
  protect,
  optionalProtect,
  authorize
};
