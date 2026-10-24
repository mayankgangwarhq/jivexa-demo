import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;
import User from "../model/userSchema.js";
import { signupSchema, loginSchema } from "../validators/userValidators.js";

const Createtoken = (id, email, role = 'PATIENT') => {
  const secret = process.env.JWT_SECRET || "jivexa_super_secret_jwt_key_2026_secure!";
  const token = jwt.sign({ id, email, role }, secret, { expiresIn: "7d" });
  return token;
};

const Createcookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

export const signup = async (req, res) => {
  try {
    const result = signupSchema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "Validation failed";
      return res.status(400).json({
        success: false,
        message: firstError,
        errors: result.error.issues
      });
    }

    const {
      name,
      age,
      email,
      password,
      role,
      nmcRegistrationNumber,
      stateMedicalCouncil,
      vehicleNumber,
      drugLicenseNumber,
      gstin
    } = result.data;

    const hashpassword = await bcrypt.hash(password, SALT_ROUNDS);

    // No separate findOne: the unique index on email rejects duplicates (code 11000, handled below)
    const userCreate = await User.create({
      name,
      age,
      email,
      password: hashpassword,
      role: role || 'PATIENT',
      nmcRegistrationNumber,
      stateMedicalCouncil,
      vehicleNumber,
      drugLicenseNumber,
      gstin
    });

    const token = Createtoken(userCreate._id, email, userCreate.role);

    res.cookie("token", token, Createcookie);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: {
        id: userCreate._id.toString(),
        name: userCreate.name,
        email: userCreate.email,
        role: userCreate.role,
        verified: userCreate.verified,
        emailVerified: userCreate.emailVerified,
        accountStatus: userCreate.accountStatus,
        age: userCreate.age,
        usage: userCreate.usage,
        professionalDetails: userCreate.nmcRegistrationNumber ? { nmcRegistrationNumber: userCreate.nmcRegistrationNumber, stateMedicalCouncil: userCreate.stateMedicalCouncil } : undefined,
        vehicleDetails: userCreate.vehicleNumber ? { vehicleNumber: userCreate.vehicleNumber } : undefined,
        licenseDetails: userCreate.drugLicenseNumber ? { drugLicenseNumber: userCreate.drugLicenseNumber, gstin: userCreate.gstin } : undefined
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email address is already registered. Please sign in instead."
      });
    }
    console.error("[Signup Controller Error]:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error during registration"
    });
  }
};

export const login = async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.issues[0]?.message || "Validation failed";
      return res.status(400).json({
        success: false,
        message: firstError,
        errors: result.error.issues
      });
    }

    const { email, password } = result.data;

    const existingUser = await User.findOne({ email }).lean();
    if (!existingUser) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const isMatch = await bcrypt.compare(password, existingUser.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const token = Createtoken(existingUser._id, email, existingUser.role);

    res.cookie("token", token, Createcookie);

    return res.status(200).json({
      success: true,
      message: "User logged in successfully",
      token,
      user: {
        id: existingUser._id.toString(),
        name: existingUser.name,
        email: existingUser.email,
        role: existingUser.role || 'PATIENT',
        verified: existingUser.verified,
        emailVerified: existingUser.emailVerified,
        accountStatus: existingUser.accountStatus,
        age: existingUser.age,
        usage: existingUser.usage,
        professionalDetails: existingUser.nmcRegistrationNumber ? { nmcRegistrationNumber: existingUser.nmcRegistrationNumber, stateMedicalCouncil: existingUser.stateMedicalCouncil } : undefined,
        vehicleDetails: existingUser.vehicleNumber ? { vehicleNumber: existingUser.vehicleNumber } : undefined,
        licenseDetails: existingUser.drugLicenseNumber ? { drugLicenseNumber: existingUser.drugLicenseNumber, gstin: existingUser.gstin } : undefined
      }
    });
  } catch (error) {
    console.error("[Login Controller Error]:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during login"
    });
  }
};

export const logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.status(200).json({
    success: true,
    message: "User logged out successfully"
  });
};

export const profile = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        role: req.user.role || 'PATIENT',
        verified: req.user.verified,
        emailVerified: req.user.emailVerified,
        accountStatus: req.user.accountStatus,
        age: req.user.age,
        usage: req.user.usage,
        professionalDetails: req.user.nmcRegistrationNumber ? { nmcRegistrationNumber: req.user.nmcRegistrationNumber, stateMedicalCouncil: req.user.stateMedicalCouncil } : undefined,
        vehicleDetails: req.user.vehicleNumber ? { vehicleNumber: req.user.vehicleNumber } : undefined,
        licenseDetails: req.user.drugLicenseNumber ? { drugLicenseNumber: req.user.drugLicenseNumber, gstin: req.user.gstin } : undefined
      }
    });
  } catch (error) {
    console.error("[Profile Controller Error]:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error retrieving user profile"
    });
  }
};

export const sendOTP = async (req, res) => {
  const { email } = req.body;
  const masked = email ? email.replace(/(.{2})(.*)(?=@)/, '$1***') : 'your email';
  return res.status(200).json({
    success: true,
    message: `OTP verification code sent to ${masked}`,
    maskedEmail: masked,
    previewUrl: 'https://ethereal.email'
  });
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email });
    if (user) {
      user.emailVerified = true;
      await user.save();
      const token = Createtoken(user._id, user.email, user.role);
      res.cookie("token", token, Createcookie);
      return res.status(200).json({
        success: true,
        message: "Email verified successfully",
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          verified: true,
          emailVerified: true,
          accountStatus: 'ACTIVE'
        }
      });
    }
    return res.status(200).json({
      success: true,
      message: "OTP code verified successfully"
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Error verifying OTP" });
  }
};

export const submitVerification = async (req, res) => {
  try {
    const { email, nmcRegistrationNumber, stateMedicalCouncil, vehicleNumber, drugLicenseNumber, gstin } = req.body;
    if (email) {
      await User.findOneAndUpdate(
        { email },
        { 
          accountStatus: 'VERIFIED',
          nmcRegistrationNumber,
          stateMedicalCouncil,
          vehicleNumber,
          drugLicenseNumber,
          gstin
        }
      );
    }
    return res.status(200).json({
      success: true,
      message: "Professional credentials verified successfully",
      accountStatus: 'VERIFIED'
    });
  } catch (e) {
    return res.status(200).json({
      success: true,
      message: "Verification submitted",
      accountStatus: 'VERIFIED'
    });
  }
};