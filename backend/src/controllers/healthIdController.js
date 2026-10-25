const { MongoDb } = require('../services/mongoDbService');
const { isDatabaseConnected } = require('../config/db');

// Helper to generate a canonical Health ID: JIV-2026-XXXXXX
const generateRandomId = () => {
  const numPart = Math.floor(100000 + Math.random() * 900000);
  return `JIV-${new Date().getFullYear()}-${numPart}`;
};

// Verified demo sample Health IDs from emergency lookup badge
const DEMO_HEALTH_IDS = [
  {
    healthId: 'JXV-STVAZREW',
    fullName: 'Aarav Sharma',
    dateOfBirth: '1992-08-14',
    gender: 'Male',
    phoneNumber: '+91 98111 22334',
    email: 'aarav.sharma@example.com',
    bloodGroup: 'B+',
    emergencyContact: {
      name: 'Sunita Sharma',
      relationship: 'Spouse',
      phone: '+91 98111 22335',
      hospital: 'Apollo Hospital, Bangalore'
    },
    address: 'Koramangala, Bangalore',
    healthProfile: {
      chronicConditions: ['Hypertension (Managed)'],
      allergies: ['Penicillin'],
      currentMedications: ['Amlodipine 5mg']
    },
    createdAt: new Date().toISOString()
  },
  {
    healthId: 'PAT-202608-F4A1B',
    fullName: 'Meera Nair',
    dateOfBirth: '1998-11-22',
    gender: 'Female',
    phoneNumber: '+91 97444 55667',
    email: 'meera.nair@example.com',
    bloodGroup: 'O+',
    emergencyContact: {
      name: 'Ramesh Nair',
      relationship: 'Father',
      phone: '+91 97444 55668',
      hospital: 'Fortis Healthcare, Bannerghatta'
    },
    address: 'Indiranagar, Bangalore',
    healthProfile: {
      chronicConditions: ['None Logged'],
      allergies: ['Sulfa drugs (mild rash)'],
      currentMedications: []
    },
    createdAt: new Date().toISOString()
  }
];

// Server-side unique Health ID generator with MongoDB collision prevention
const generateUniqueHealthId = async () => {
  let isUnique = false;
  let newHealthId = '';
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    newHealthId = generateRandomId();
    attempts++;

    const existing = await MongoDb.healthIds.findOne({ healthId: newHealthId });
    if (!existing) {
      isUnique = true;
    }
  }

  return newHealthId;
};

// Helper to format patient emergency profile response
const formatEmergencyPatientResponse = (record, isDemo = false) => ({
  success: true,
  isDemoRecord: isDemo || Boolean(record.isDemo),
  healthId: record.healthId,
  verificationStatus: isDemo ? 'Sample Demo Record' : 'Verified Active Record',
  patient: {
    name: record.fullName || record.name || null,
    dateOfBirth: record.dateOfBirth || null,
    gender: record.gender || null,
    bloodGroup: record.bloodGroup || null,
    emergencyContact: record.emergencyContact || null,
    healthProfile: record.healthProfile || null,
    createdAt: record.createdAt || null
  }
});

// @desc    Register / Create Digital Health ID for authenticated patient
// @route   POST /api/health-id
// @access  Private (Authenticated Patient)
const createHealthId = async (req, res) => {
  if (!isDatabaseConnected()) {
    return res.status(503).json({ success: false, message: 'Database is currently disconnected. Please configure MONGO_URI.' });
  }
  try {
    const userId = req.user._id || req.user.id;
    const { dateOfBirth, gender, phoneNumber, bloodGroup, emergencyContact, address, healthProfile } = req.body;

    let userRecord = await MongoDb.users.findById(userId);
    const fullName = req.body.fullName || (userRecord ? userRecord.name : req.user.name) || 'Patient User';
    const email = (req.body.email || (userRecord ? userRecord.email : req.user.email) || '').toLowerCase().trim();

    const existingRecord = await MongoDb.healthIds.findOne({ userId });
    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Health ID already exists',
        healthId: existingRecord.healthId,
        patient: {
          name: existingRecord.fullName,
          dateOfBirth: existingRecord.dateOfBirth,
          gender: existingRecord.gender,
          bloodGroup: existingRecord.bloodGroup,
          email: existingRecord.email,
          phoneNumber: existingRecord.phoneNumber,
          emergencyContact: existingRecord.emergencyContact,
          address: existingRecord.address,
          healthProfile: existingRecord.healthProfile
        }
      });
    }

    const newHealthIdStr = await generateUniqueHealthId();
    const healthIdRecord = await MongoDb.healthIds.create({
      healthId: newHealthIdStr,
      userId,
      fullName,
      dateOfBirth: dateOfBirth || '2000-01-01',
      gender: gender || 'Unspecified',
      phoneNumber: phoneNumber || '',
      email,
      bloodGroup: bloodGroup || 'O+',
      emergencyContact: emergencyContact || {},
      address: address || '',
      healthProfile: healthProfile || {}
    });

    return res.status(201).json({
      success: true,
      message: 'Digital Health ID created successfully',
      healthId: healthIdRecord.healthId,
      patient: {
        name: healthIdRecord.fullName,
        dateOfBirth: healthIdRecord.dateOfBirth,
        gender: healthIdRecord.gender,
        bloodGroup: healthIdRecord.bloodGroup,
        email: healthIdRecord.email,
        phoneNumber: healthIdRecord.phoneNumber,
        emergencyContact: healthIdRecord.emergencyContact,
        address: healthIdRecord.address,
        healthProfile: healthIdRecord.healthProfile
      }
    });
  } catch (error) {
    console.error('[Health ID API] Create Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to process request'
    });
  }
};

// @desc    Get authenticated patient's own Health ID from MongoDB
// @route   GET /api/health-id/me
// @access  Private (Authenticated Patient)
const getMyHealthId = async (req, res) => {
  if (!isDatabaseConnected()) {
    return res.status(503).json({ success: false, message: 'Database is currently disconnected. Please configure MONGO_URI.' });
  }
  try {
    const userId = req.user._id || req.user.id;
    let record = await MongoDb.healthIds.findOne({ userId });

    // Auto-generate Health ID if patient signed up but hasn't initialized one yet
    if (!record) {
      const userRecord = await MongoDb.users.findById(userId);
      const existingHid = userRecord?.healthId;
      const newHealthIdStr = (existingHid && existingHid.startsWith('JIV-'))
        ? existingHid
        : await generateUniqueHealthId();

      record = await MongoDb.healthIds.create({
        healthId: newHealthIdStr,
        userId,
        fullName: userRecord ? userRecord.name : (req.user ? req.user.name : 'Patient User'),
        email: userRecord ? userRecord.email : (req.user ? req.user.email : ''),
        dateOfBirth: userRecord?.dateOfBirth || userRecord?.dob || '2000-01-01',
        gender: userRecord?.gender || 'Unspecified',
        bloodGroup: userRecord?.bloodGroup || 'O+'
      });

      if (userRecord && (!userRecord.healthId || userRecord.healthId !== newHealthIdStr)) {
        userRecord.healthId = newHealthIdStr;
        await userRecord.save().catch(() => {});
      }
    }

    return res.status(200).json({
      success: true,
      healthId: record.healthId,
      patient: {
        name: record.fullName,
        dateOfBirth: record.dateOfBirth,
        gender: record.gender,
        bloodGroup: record.bloodGroup,
        email: record.email,
        phoneNumber: record.phoneNumber,
        emergencyContact: record.emergencyContact,
        address: record.address,
        healthProfile: record.healthProfile,
        createdAt: record.createdAt
      }
    });
  } catch (error) {
    console.error('[Health ID API] Get Me Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to process request'
    });
  }
};

// @desc    Search patient Health ID in MongoDB
// @route   GET /api/health-id/search?healthId=JIV-2026-XXXXXX
// @access  Public / Private (Healthcare Professionals & Verified Users)
const searchHealthId = async (req, res) => {
  try {
    const rawHealthId = req.query.healthId || req.query.id || req.params.healthId || '';
    const sanitizedHealthId = String(rawHealthId).trim().toUpperCase();

    if (!sanitizedHealthId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Health ID to search'
      });
    }

    // 1. Check verified demo sample Health IDs first (immediate response without DB dependency)
    const demoMatch = DEMO_HEALTH_IDS.find(
      (d) => d.healthId.toUpperCase() === sanitizedHealthId || d.healthId.toUpperCase().replace(/[^A-Z0-9]/g, '') === sanitizedHealthId.replace(/[^A-Z0-9]/g, '')
    );
    if (demoMatch) {
      return res.status(200).json(formatEmergencyPatientResponse(demoMatch, true));
    }

    let record = null;
    if (isDatabaseConnected()) {
      record = await MongoDb.healthIds.findOne({
        $or: [
          { healthId: sanitizedHealthId },
          { healthId: sanitizedHealthId.replace(/[^A-Z0-9]/g, '') }
        ]
      });

    // 1. Check if patient user has this health_id in users collection
    if (!record) {
      const userMatch = await MongoDb.users.findOne({ healthId: sanitizedHealthId });
      if (userMatch) {
        // Auto-sync into health_ids collection
        record = await MongoDb.healthIds.create({
          healthId: sanitizedHealthId,
          userId: userMatch._id || userMatch.id,
          fullName: userMatch.name,
          email: userMatch.email,
          phoneNumber: userMatch.phone || '',
          dateOfBirth: userMatch.dateOfBirth || userMatch.dob || '2000-01-01',
          gender: userMatch.gender || 'Unspecified',
          bloodGroup: userMatch.bloodGroup || 'O+',
          emergencyContact: userMatch.emergencyContact || {},
          healthProfile: userMatch.healthProfile || {}
        }).catch(() => null);

        if (!record) {
          record = {
            healthId: sanitizedHealthId,
            fullName: userMatch.name,
            dateOfBirth: userMatch.dateOfBirth || userMatch.dob || '2000-01-01',
            gender: userMatch.gender || 'Unspecified',
            bloodGroup: userMatch.bloodGroup || 'O+',
            emergencyContact: userMatch.emergencyContact || {},
            healthProfile: userMatch.healthProfile || {},
            createdAt: userMatch.createdAt
          };
        }
      }
    }

    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `Health ID "${sanitizedHealthId}" not found. No patient record registered with this ID.`
      });
    }

    return res.status(200).json(formatEmergencyPatientResponse(record));
  } catch (error) {
    console.error('[Health ID API] Search Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to process request'
    });
  }
};

module.exports = {
  createHealthId,
  getMyHealthId,
  searchHealthId
};
