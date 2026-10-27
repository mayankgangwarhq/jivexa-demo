/**
 * JIVEXA Health OS - Device & Client Detector Utility
 * 
 * Accurately detects client browser, OS, and form factor from User-Agent headers.
 * Extracts client IP and truthful approximate location without fabricating fake locations.
 */

/**
 * Parse standard HTTP User-Agent header into readable device & browser details.
 * Truthful: labels unknown values as 'Unknown' rather than inventing hardware models.
 */
function parseUserAgent(userAgent = '') {
  const ua = String(userAgent || '').trim();
  if (!ua) {
    return {
      browser: 'Unknown Browser',
      os: 'Unknown OS',
      deviceType: 'Unknown Device',
      formatted: 'Unknown Device'
    };
  }

  // 1. Detect Operating System
  let os = 'Unknown OS';
  if (/Windows NT 10\.0/i.test(ua)) {
    os = 'Windows';
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows';
  } else if (/iPhone/i.test(ua)) {
    os = 'iOS (iPhone)';
  } else if (/iPad/i.test(ua)) {
    os = 'iPadOS';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
  } else if (/Mac OS X|Macintosh/i.test(ua)) {
    os = 'macOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  }

  // 2. Detect Browser
  let browser = 'Unknown Browser';
  if (/Edg\//i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\//i.test(ua) && !/Chromium\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = 'Safari';
  } else if (/curl\//i.test(ua)) {
    browser = 'cURL';
  } else if (/PostmanRuntime/i.test(ua)) {
    browser = 'Postman';
  }

  // 3. Detect Form Factor (Desktop / Mobile / Tablet)
  let deviceType = 'Desktop';
  if (/Mobi|Android.*Mobile|iPhone/i.test(ua)) {
    deviceType = 'Mobile';
  } else if (/Tablet|iPad|Android(?!.*Mobile)/i.test(ua)) {
    deviceType = 'Tablet';
  } else if (/curl|Postman|Bot|Spider/i.test(ua)) {
    deviceType = 'API Client';
  }

  // 4. Formatted Display Label
  let formatted = '';
  if (browser !== 'Unknown Browser' && os !== 'Unknown OS') {
    formatted = `${browser} on ${os} (${deviceType})`;
  } else if (browser !== 'Unknown Browser') {
    formatted = `${browser} (${deviceType})`;
  } else if (os !== 'Unknown OS') {
    formatted = `${os} (${deviceType})`;
  } else {
    formatted = 'Unknown Device';
  }

  return {
    browser,
    os,
    deviceType,
    formatted
  };
}

/**
 * Extract sanitized client IP address from request.
 * Handles reverse proxy X-Forwarded-For chains, remoteAddress, and localhost normalization.
 */
function getClientIp(req) {
  if (!req) return 'Unknown IP';

  let rawIp = '';
  const xForwardedFor = req.headers ? req.headers['x-forwarded-for'] : null;
  if (xForwardedFor) {
    // If comma-separated proxy chain, client IP is the first entry
    rawIp = String(xForwardedFor).split(',')[0].trim();
  } else if (req.socket && req.socket.remoteAddress) {
    rawIp = req.socket.remoteAddress;
  } else if (req.ip) {
    rawIp = req.ip;
  }

  // Normalize IPv6 localhost
  if (rawIp === '::1' || rawIp === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }

  // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:192.168.1.1)
  if (typeof rawIp === 'string' && rawIp.startsWith('::ffff:')) {
    rawIp = rawIp.slice(7);
  }

  return rawIp.trim() || 'Unknown IP';
}

/**
 * Derive approximate geographic location without fabricating unverified physical locations.
 * Private and loopback IPs are accurately labeled as Local/Private Network.
 */
function getApproximateLocation(ip) {
  if (!ip || ip === 'Unknown IP') {
    return 'Location Unavailable';
  }

  // Check Localhost & Private RFC 1918 IPv4 ranges
  if (
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
    ip.startsWith('169.254.')
  ) {
    return 'Local / Private Network';
  }

  // Public IP: We do not present unverified physical addresses as factual
  return 'Approximate Location Unavailable';
}

/**
 * Human-readable format for session last active time
 */
function formatLastActive(date) {
  if (!date) return 'Unknown';
  const target = new Date(date).getTime();
  const now = Date.now();
  const diffMs = now - target;

  if (diffMs < 0 || diffMs < 60 * 1000) {
    return 'Active Now';
  }
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

module.exports = {
  parseUserAgent,
  getClientIp,
  getApproximateLocation,
  formatLastActive
};
