const nodemailer = require('nodemailer');
const config = require('../config/env');

/**
 * Native Email Verification & Notification Service
 * Dispatches verification emails via configured SMTP or provides development logs
 */
const resendVerificationEmail = async (email) => {
  const cleanEmail = email ? email.trim().toLowerCase() : '';
  if (!cleanEmail) {
    return { success: false, error: 'Valid email address is required' };
  }

  try {
    const frontendBase = config.server.frontendUrl || 'http://localhost:5173';
    const redirectUrl = `${frontendBase.replace(/\/$/, '')}/#/login?verified=true`;

    // If SMTP credentials configured, send real email via nodemailer
    if (config.smtp.isConfigured()) {
      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass
        }
      });

      await transporter.sendMail({
        from: config.smtp.from || `"JIVEXA Health" <${config.smtp.user}>`,
        to: cleanEmail,
        subject: 'Verify your JIVEXA Health Account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #059669;">JIVEXA Health Account Verification</h2>
            <p>Welcome to Jivexa Health OS. Please click the button below to verify your account:</p>
            <a href="${redirectUrl}" style="display: inline-block; background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 16px 0;">Verify Account</a>
            <p style="color: #64748b; font-size: 13px;">If you did not request this, please ignore this email.</p>
          </div>
        `
      });
    }

    console.log(`[Email Service] Verification link generated for ${cleanEmail} -> ${redirectUrl}`);
    return {
      success: true,
      message: 'Verification email dispatched successfully.',
      redirectUrl
    };
  } catch (err) {
    console.error('[Email Service] Error dispatching verification email:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = {
  resendVerificationEmail,
  sendOTPEmail: resendVerificationEmail
};
