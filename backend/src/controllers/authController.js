const config = require('../config/env');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoDb } = require('../services/mongoDbService');
const User = require('../models/User');
const HealthId = require('../models/HealthId');
const { signupSchema, loginSchema, updateProfileSchema } = require('../validators/userValidators');
const { resendVerificationEmail } = require('../services/emailService');
const { 
  createOTPEntry, 
  verifyOTPEntry, 
  maskEmail, 
  generateRoleId, 
  OTP_RESEND_COOLDOWN_SECONDS 
} = require('../services/otpService');

const JWT_SECRET = config.auth.jwtSecret;
const MAX_FAILED_LOGINS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15-minute lockout

// Canonical Health ID generator for JIVEXA Health OS patients
const generateCanonicalHealthId = () => {
  const numPart = Math.floor(100000 + Math.random() * 900000);
  return `JIV-${new Date().getFullYear()}-${numPart}`;
};

// TEMPORARILY DISABLED FOR LAUNCH
// Re-enable OTP after launch by setting OTP_ENABLED=true in backend/.env.
const isOtpEnabled = () => {
  return config.auth.otpEnabled;
};

// Helper to generate signed JWT token
const generateToken = (id, email, role, name, roleId) => {
  const secretKey = config.auth.jwtSecret;
  if (!secretKey) {
    throw new Error('JWT secret key is not configured in backend environment');
  }
  return jwt.sign(
    { id, email, role, name, roleId },
    secretKey,
    { expiresIn: '7d' }
  );
};

// Cookie configuration options
const getCookieOptions = () => ({
  httpOnly: true,
  secure: config.server.isProduction,
  sameSite: config.server.isProduction ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});

// @desc    Register a new user (Signup & Dispatch Email OTP)
// @route   POST /api/auth/signup
// @access  Public
const registerUser = async (req, res) => {
  try {
    const validationResult = signupSchema.safeParse(req.body);
    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstError = issues[0]?.message || 'Invalid input data';
      return res.status(400).json({
        success: false,
        error: firstError,
        message: firstError,
        details: issues
      });
    }

    const { name, age, email, password, role } = validationResult.data;
    const userRole = (role || 'PATIENT').toUpperCase();
    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists in MongoDB
    const existingUser = await MongoDb.users.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
        message: 'An account with this email already exists.'
      });
    }

    // Generate Prefix-Based Unique Distinguishable Role ID
    const roleId = generateRoleId(userRole);

    // Hash password with bcrypt (12 rounds)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    const generatedHealthId = userRole === 'PATIENT' ? generateCanonicalHealthId() : undefined;

    const userProfilePayload = {
      roleId,
      name,
      email: cleanEmail,
      password: hashedPassword,
      role: userRole,
      age: age !== undefined ? age : null,
      phone: req.body.phone || '',
      healthId: generatedHealthId,
      emailVerified: true,
      verified: true,
      accountStatus: userRole === 'PATIENT' ? 'ACTIVE' : 'PENDING_DOCUMENT_REVIEW',
      usage: { tokenUsed: 0, tokenLimit: 10000, totalTokenUsed: 0 }
    };

    if (userRole === 'DOCTOR') {
      userProfilePayload.professionalDetails = req.body.professionalDetails || {
        specialization: req.body.specialization || 'General Practitioner',
        experienceYears: req.body.experienceYears || 0,
        nmcRegistrationNumber: req.body.nmcRegistrationNumber,
        stateMedicalCouncil: req.body.stateMedicalCouncil || 'State Medical Council',
        consultationFee: req.body.consultationFee || 500,
        qualification: req.body.qualification || 'MBBS'
      };
    } else if (userRole === 'AMBULANCE_PARTNER') {
      userProfilePayload.vehicleDetails = req.body.vehicleDetails || {
        vehicleNumber: req.body.vehicleNumber,
        vehicleType: req.body.vehicleType || 'Basic Life Support (BLS)',
        driverName: req.body.driverName || name,
        driverPhone: req.body.driverPhone || req.body.phone || ''
      };
    } else if (userRole === 'PHARMACY') {
      userProfilePayload.licenseDetails = req.body.licenseDetails || {
        pharmacyName: req.body.pharmacyName || name,
        drugLicenseNumber: req.body.drugLicenseNumber,
        gstin: req.body.gstin || '29AAACJ1234F1Z5'
      };
    }

    const userRecord = await MongoDb.users.create(userProfilePayload);

    // Auto-create linked health_ids record in MongoDB for registered patients
    if (userRole === 'PATIENT' && generatedHealthId) {
      await MongoDb.healthIds.create({
        healthId: generatedHealthId,
        userId: userRecord._id || userRecord.id,
        fullName: userRecord.name,
        email: userRecord.email,
        phoneNumber: userRecord.phone || '',
        dateOfBirth: req.body.dateOfBirth || req.body.dob || '2000-01-01',
        gender: req.body.gender || 'Unspecified',
        bloodGroup: req.body.bloodGroup || 'O+',
        emergencyContact: req.body.emergencyContact || {},
        healthProfile: req.body.healthProfile || {}
      }).catch((err) => {
        console.warn('[Auth Controller] MongoDB healthIds create notice:', err.message);
      });
    }

    // 4. Generate JWT auth token & set HTTP-only cookie
    const token = generateToken(
      userRecord._id || userRecord.id,
      userRecord.email,
      userRecord.role,
      userRecord.name,
      userRecord.roleId
    );

    res.cookie('token', token, getCookieOptions());

    return res.status(201).json({
      success: true,
      requireEmailConfirmation: false,
      requireOtp: false,
      token,
      email,
      message: 'Account created successfully!',
      user: userRecord.toAuthJSON ? userRecord.toAuthJSON() : userRecord
    });
  } catch (error) {
    if (error.code === 11000 || (error.name === 'MongoServerError' && error.code === 11000)) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
        message: 'An account with this email already exists.'
      });
    }
    console.error('[Backend Auth Signup Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server authentication error'
    });
  }
};

// @desc    Dispatch or Resend Email Verification / OTP
// @route   POST /api/auth/send-otp, POST /api/auth/resend-verification, POST /api/auth/resend-otp
// @access  Public / Private
const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required to send verification email' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!isOtpEnabled() && !req.path.includes('verification')) {
      const resendResult = await resendVerificationEmail(cleanEmail);
      return res.status(resendResult.success ? 200 : 400).json(resendResult);
    }

    const targetUser = await MongoDb.users.findOne({ email: cleanEmail });
    if (targetUser && isOtpEnabled()) {
      const otpEntry = await createOTPEntry('signup_verification');
      targetUser.otpDetails = {
        codeHash: otpEntry.otpHash,
        expiresAt: otpEntry.expiresAt,
        resendAvailableAt: otpEntry.resendAvailableAt,
        purpose: 'signup_verification',
        attempts: 0
      };
      await targetUser.save();
    }

    const resendResult = await resendVerificationEmail(cleanEmail);
    if (!resendResult.success) {
      return res.status(400).json({
        success: false,
        error: resendResult.error || 'Failed to dispatch verification email',
        message: resendResult.error || 'Failed to dispatch verification email'
      });
    }

    return res.status(200).json({
      success: true,
      message: `Verification email dispatched to ${maskEmail(cleanEmail)}. Please check your inbox.`,
      maskedEmail: maskEmail(cleanEmail)
    });
  } catch (error) {
    console.error('[Send OTP Error]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error sending verification email' });
  }
};

// @desc    Verify Email / OTP (Native Backend Auth)
// @route   POST /api/auth/verify-otp, POST /api/auth/check-verification
// @access  Public / Private
const verifyOTP = async (req, res) => {
  try {
    const { email, code, token: inputToken } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let targetUser = await MongoDb.users.findOne({ email: cleanEmail });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    const otpCode = (code || inputToken || '').trim();

    // If OTP verification enabled and user has OTP details, verify against bcrypt hash
    if (isOtpEnabled() && targetUser.otpDetails && otpCode) {
      const otpResult = await verifyOTPEntry(targetUser.otpDetails, otpCode, 'signup_verification');
      if (!otpResult.valid) {
        if (targetUser.otpDetails) {
          targetUser.otpDetails.attempts = (targetUser.otpDetails.attempts || 0) + 1;
          await targetUser.save();
        }
        return res.status(400).json({ success: false, error: otpResult.message });
      }
    }

    targetUser.emailVerified = true;
    targetUser.verified = true;
    targetUser.otpDetails = null;

    if (!targetUser.roleId) {
      targetUser.roleId = generateRoleId(targetUser.role);
    }

    if (targetUser.role === 'PATIENT') {
      targetUser.accountStatus = 'ACTIVE';
    } else if (targetUser.role === 'DOCTOR') {
      targetUser.accountStatus = targetUser.professionalDetails?.nmcRegistrationNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
    } else if (targetUser.role === 'AMBULANCE_PARTNER') {
      targetUser.accountStatus = targetUser.vehicleDetails?.vehicleNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
    } else if (targetUser.role === 'PHARMACY') {
      targetUser.accountStatus = targetUser.licenseDetails?.drugLicenseNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
    } else {
      targetUser.accountStatus = 'ACTIVE';
    }

    await targetUser.save();

    const token = generateToken(
      targetUser._id || targetUser.id,
      targetUser.email,
      targetUser.role,
      targetUser.name,
      targetUser.roleId
    );

    res.cookie('token', token, getCookieOptions());

    const userAuthData = targetUser.toAuthJSON ? targetUser.toAuthJSON() : targetUser;

    return res.status(200).json({
      success: true,
      message: `🎉 Email verified successfully! Unique Role ID: ${targetUser.roleId}`,
      token,
      user: userAuthData
    });
  } catch (error) {
    console.error('[Verify OTP Error]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Server error verifying OTP' });
  }
};

// @desc    Submit Stage 2 Professional/Business Verification Credentials
// @route   POST /api/auth/submit-verification
// @access  Private / Public
const submitRoleVerification = async (req, res) => {
  try {
    const { email, nmcRegistrationNumber, stateMedicalCouncil, vehicleNumber, category, drugLicenseNumber, gstin } = req.body;

    const targetEmail = (email || req.user?.email || '').toLowerCase().trim();
    let targetUser = await MongoDb.users.findOne({ email: targetEmail });
    if (!targetUser && req.user) {
      targetUser = await MongoDb.users.findById(req.user._id || req.user.id);
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    if (targetUser.role === 'DOCTOR' && nmcRegistrationNumber) {
      targetUser.professionalDetails = {
        nmcRegistrationNumber,
        stateMedicalCouncil: stateMedicalCouncil || 'State Medical Council',
        verifiedAt: new Date()
      };
      targetUser.accountStatus = 'VERIFIED';
    } else if (targetUser.role === 'AMBULANCE_PARTNER' && vehicleNumber) {
      targetUser.vehicleDetails = {
        vehicleNumber,
        category: category || 'ICU Ambulance',
        verifiedAt: new Date()
      };
      targetUser.accountStatus = 'VERIFIED';
    } else if (targetUser.role === 'PHARMACY' && drugLicenseNumber) {
      targetUser.licenseDetails = {
        pharmacyName: targetUser.name,
        drugLicenseNumber,
        gstin: gstin || '29AAACJ1234F1Z5',
        verifiedAt: new Date()
      };
      targetUser.accountStatus = 'VERIFIED';
    }

    await targetUser.save();

    return res.json({
      success: true,
      message: '🎉 Credentials submitted and account verified!',
      roleId: targetUser.roleId,
      accountStatus: targetUser.accountStatus
    });
  } catch (error) {
    console.error('[Submit Verification Error]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error submitting verification credentials' });
  }
};

// @desc    Authenticate user & get JWT token (Login with Brute-Force Protection & 2FA)
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstError = issues[0]?.message || 'Invalid input data';
      return res.status(400).json({
        success: false,
        error: firstError,
        message: firstError,
        details: issues
      });
    }

    const { email, password } = validationResult.data;
    const cleanEmail = email.trim().toLowerCase();

    let user = await MongoDb.users.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password credentials',
        message: 'Invalid email or password credentials'
      });
    }

    // Check brute-force lockout
    if (user.isLocked()) {
      const remainingMins = Math.ceil((new Date(user.lockUntil).getTime() - Date.now()) / (60 * 1000));
      return res.status(423).json({
        success: false,
        error: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingMins} minutes.`
      });
    }

    // Verify password using bcrypt
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
        await user.save();
        return res.status(423).json({
          success: false,
          error: 'Account locked due to 5 consecutive failed login attempts. Please try again in 15 minutes.'
        });
      }
      await user.save();
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password credentials',
        message: 'Invalid email or password credentials'
      });
    }

    // Password matches! Reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.emailVerified = true;
    user.verified = true;

    if (user.accountStatus === 'PENDING_EMAIL_VERIFICATION') {
      if (user.role === 'PATIENT') {
        user.accountStatus = 'ACTIVE';
      } else if (user.role === 'DOCTOR') {
        user.accountStatus = user.professionalDetails?.nmcRegistrationNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
      } else if (user.role === 'AMBULANCE_PARTNER') {
        user.accountStatus = user.vehicleDetails?.vehicleNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
      } else if (user.role === 'PHARMACY') {
        user.accountStatus = user.licenseDetails?.drugLicenseNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
      } else {
        user.accountStatus = 'ACTIVE';
      }
    }

    if (!user.roleId) {
      user.roleId = generateRoleId(user.role);
    }

    await user.save();

    const token = generateToken(
      user._id || user.id,
      user.email,
      user.role,
      user.name,
      user.roleId
    );

    res.cookie('token', token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      token,
      user: user.toAuthJSON ? user.toAuthJSON() : user
    });
  } catch (error) {
    console.error('[Backend Auth Login Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server authentication error'
    });
  }
};

// @desc    Logout user & clear cookie
// @route   POST /api/auth/logout
// @access  Public / Private
const logoutUser = async (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: config.server.isProduction,
    sameSite: config.server.isProduction ? 'none' : 'lax'
  });
  return res.status(200).json({
    success: true,
    message: 'User logged out successfully'
  });
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const userData = req.user.toAuthJSON ? req.user.toAuthJSON() : {
      id: req.user.id || req.user._id,
      roleId: req.user.roleId,
      name: req.user.name,
      age: req.user.age,
      email: req.user.email,
      role: req.user.role,
      emailVerified: req.user.emailVerified,
      verified: req.user.verified,
      accountStatus: req.user.accountStatus,
      avatarUrl: req.user.avatarUrl || req.user.professionalDetails?.avatarUrl || req.user.usage?.avatarUrl || '',
      createdAt: req.user.createdAt || req.user.created_at,
      updatedAt: req.user.updatedAt || req.user.updated_at
    };

    return res.json({
      success: true,
      user: userData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Error fetching user profile'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const validationResult = updateProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstError = issues[0]?.message || 'Invalid profile update data';
      return res.status(400).json({
        success: false,
        error: firstError,
        message: firstError,
        details: issues
      });
    }

    const { name, age, email } = validationResult.data;

    const user = await MongoDb.users.findById(req.user._id || req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (name) user.name = name;
    if (age !== undefined) user.age = age;
    if (email) user.email = email.toLowerCase().trim();

    await user.save();

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toAuthJSON()
    });
  } catch (error) {
    console.error('[Update Profile Error]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Server error updating profile' });
  }
};

// @desc    Upload / Update profile photo (Stored as Data URL in MongoDB)
// @route   POST /api/auth/profile-photo
// @access  Private
const uploadProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: 'Image data is required' });
    }

    let base64Data = image;
    let detectedMime = mimeType || 'image/jpeg';
    if (typeof image === 'string' && image.startsWith('data:')) {
      const match = image.match(/^data:([a-zA-Z0-9\/+-]+);base64,(.+)$/);
      if (match) {
        detectedMime = match[1];
        base64Data = match[2];
      }
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!detectedMime || !allowedMimeTypes.includes(detectedMime.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image format. Allowed formats: JPG, JPEG, PNG, WEBP.'
      });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (buffer.length > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'Image size exceeds maximum limit of 5MB.'
      });
    }

    const fullDataUrl = `data:${detectedMime};base64,${base64Data}`;

    // Persist in MongoDB User
    const user = await MongoDb.users.findById(userId);
    if (user) {
      user.avatarUrl = fullDataUrl;
      if (user.professionalDetails) user.professionalDetails.avatarUrl = fullDataUrl;
      if (user.usage) user.usage.avatarUrl = fullDataUrl;
      await user.save();
    }

    // Sync in linked HealthId
    const healthIdRecord = await MongoDb.healthIds.findOne({ userId });
    if (healthIdRecord) {
      healthIdRecord.healthProfile = {
        ...(healthIdRecord.healthProfile || {}),
        avatarUrl: fullDataUrl
      };
      await healthIdRecord.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Profile photo uploaded successfully',
      avatarUrl: fullDataUrl
    });
  } catch (error) {
    console.error('[Upload Profile Photo Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Server error processing profile photo'
    });
  }
};

// @desc    Remove profile photo
// @route   DELETE /api/auth/profile-photo
// @access  Private
const removeProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = await MongoDb.users.findById(userId);
    if (user) {
      user.avatarUrl = '';
      if (user.professionalDetails) user.professionalDetails.avatarUrl = '';
      if (user.usage) user.usage.avatarUrl = '';
      await user.save();
    }

    const healthIdRecord = await MongoDb.healthIds.findOne({ userId });
    if (healthIdRecord && healthIdRecord.healthProfile) {
      healthIdRecord.healthProfile.avatarUrl = '';
      await healthIdRecord.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Profile photo removed successfully'
    });
  } catch (error) {
    console.error('[Remove Profile Photo Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Server error removing profile photo'
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  updateProfile,
  sendOTP,
  verifyOTP,
  submitRoleVerification,
  uploadProfilePhoto,
  removeProfilePhoto
};
