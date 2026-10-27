const { MongoDb } = require('../services/mongoDbService');
const { isDatabaseConnected } = require('../config/db');

// Helper to generate a canonical Health ID: JIV-2026-XXXXXX
const generateRandomId = () => {
  const numPart = Math.floor(100000 + Math.random() * 900000);
  return `JIV-${new Date().getFullYear()}-${numPart}`;
};

// Verified demo sample Health IDs from emergency lookup badge and card prototypes
const DEMO_HEALTH_IDS = [
  {
    healthId: 'JXV-STVAZREWPAT-202608-F4A1B',
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
      currentMedications: ['Amlodipine 5mg'],
      emergencyNotes: 'Carries emergency beta-blocker prescription in wallet.',
      bloodPressure: '128/84 mmHg'
    },
    isDemo: true,
    createdAt: '2026-01-15T10:30:00.000Z'
  },
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
      currentMedications: ['Amlodipine 5mg'],
      emergencyNotes: 'Carries emergency beta-blocker prescription in wallet.',
      bloodPressure: '128/84 mmHg'
    },
    isDemo: true,
    createdAt: '2026-01-15T10:30:00.000Z'
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
      currentMedications: [],
      emergencyNotes: 'Asthma inhaler as needed.',
      bloodPressure: '118/76 mmHg'
    },
    isDemo: true,
    createdAt: '2026-02-20T14:15:00.000Z'
  },
  {
    healthId: 'JIV-2026-685853',
    fullName: 'Rajesh Varma',
    dateOfBirth: '1985-04-10',
    gender: 'Male',
    phoneNumber: '+91 98222 33445',
    email: 'rajesh.varma@example.com',
    bloodGroup: 'A+',
    emergencyContact: {
      name: 'Pooja Varma',
      relationship: 'Spouse',
      phone: '+91 98222 33446',
      hospital: 'Manipal Hospital, Old Airport Road'
    },
    address: 'Whitefield, Bangalore',
    healthProfile: {
      chronicConditions: ['Type 2 Diabetes (Diet controlled)'],
      allergies: ['None known'],
      currentMedications: ['Metformin 500mg'],
      emergencyNotes: 'Monitors fasting blood sugar weekly.',
      bloodPressure: '122/80 mmHg'
    },
    isDemo: true,
    createdAt: '2026-03-01T09:00:00.000Z'
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

// Idempotent Seeding of Demo Health IDs into MongoDB when connected
let demoSeeded = false;
const seedDemoHealthIds = async () => {
  if (demoSeeded || !isDatabaseConnected()) return;
  try {
    for (const demo of DEMO_HEALTH_IDS) {
      const existing = await MongoDb.healthIds.findOne({ healthId: demo.healthId });
      if (!existing) {
        await MongoDb.healthIds.create({
          healthId: demo.healthId,
          userId: `demo-user-${demo.healthId.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          fullName: demo.fullName,
          dateOfBirth: demo.dateOfBirth,
          gender: demo.gender,
          bloodGroup: demo.bloodGroup,
          email: demo.email || '',
          phoneNumber: demo.phoneNumber || '',
          emergencyContact: demo.emergencyContact || {},
          address: demo.address || '',
          healthProfile: demo.healthProfile || {},
          isDemo: true
        }).catch(() => {});
      }
    }
    demoSeeded = true;
  } catch (err) {
    // Non-fatal if seeding cannot write to DB
  }
};

// Helper to format patient emergency profile response (Strictly sanitizes private credentials)
const formatEmergencyPatientResponse = (record, isDemo = false) => {
  const isDemoRecord = isDemo || Boolean(record.isDemo) || Boolean(record.isDemoRecord);

  // Strictly sanitize emergency contact (only name, relationship, phone, hospital)
  let sanitizedEmergencyContact = null;
  if (record.emergencyContact) {
    if (typeof record.emergencyContact === 'object') {
      sanitizedEmergencyContact = {
        name: record.emergencyContact.name || '',
        relationship: record.emergencyContact.relationship || record.emergencyContact.relation || '',
        phone: record.emergencyContact.phone || '',
        hospital: record.emergencyContact.hospital || ''
      };
    } else if (typeof record.emergencyContact === 'string') {
      sanitizedEmergencyContact = record.emergencyContact;
    }
  }

  // Strictly sanitize health profile (only medical emergencies, never passwords/tokens/auth)
  let sanitizedHealthProfile = null;
  if (record.healthProfile && typeof record.healthProfile === 'object') {
    sanitizedHealthProfile = {
      allergies: Array.isArray(record.healthProfile.allergies)
        ? record.healthProfile.allergies
        : (record.healthProfile.allergies ? [String(record.healthProfile.allergies)] : []),
      chronicConditions: Array.isArray(record.healthProfile.chronicConditions)
        ? record.healthProfile.chronicConditions
        : (record.healthProfile.chronicConditions ? [String(record.healthProfile.chronicConditions)] : []),
      currentMedications: Array.isArray(record.healthProfile.currentMedications)
        ? record.healthProfile.currentMedications
        : (record.healthProfile.currentMedications ? [String(record.healthProfile.currentMedications)] : []),
      emergencyNotes: record.healthProfile.emergencyNotes || record.healthProfile.notes || '',
      bloodPressure: record.healthProfile.bloodPressure || ''
    };
  }

  return {
    success: true,
    isDemoRecord,
    healthId: record.healthId,
    verificationStatus: isDemoRecord ? 'Sample Demo Record' : 'Verified Active Record',
    patient: {
      name: record.fullName || record.name || null,
      dateOfBirth: record.dateOfBirth || record.dob || null,
      gender: record.gender || null,
      bloodGroup: record.bloodGroup || null,
      emergencyContact: sanitizedEmergencyContact,
      healthProfile: sanitizedHealthProfile,
      createdAt: record.createdAt || null
    }
  };
};

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
    const rawHealthId = req.query.healthId || req.query.id || req.query.q || req.params.healthId || '';
    const sanitizedHealthId = String(rawHealthId).trim().replace(/^['"]|['"]$/g, '').toUpperCase();
    const alphanumericId = sanitizedHealthId.replace(/[^A-Z0-9]/g, '');

    if (!sanitizedHealthId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Health ID to search'
      });
    }

    // 1. Check verified demo sample Health IDs first (immediate response without DB dependency)
    // Priority: Exact match first, alphanumeric exact match second, and substring match last
    let demoMatch = DEMO_HEALTH_IDS.find((d) => {
      const demoUpper = d.healthId.toUpperCase();
      const demoAlpha = demoUpper.replace(/[^A-Z0-9]/g, '');
      return demoUpper === sanitizedHealthId || demoAlpha === alphanumericId;
    });

    if (!demoMatch && alphanumericId.length >= 8) {
      demoMatch = DEMO_HEALTH_IDS.find((d) => {
        const demoAlpha = d.healthId.toUpperCase().replace(/[^A-Z0-9]/g, '');
        return demoAlpha.includes(alphanumericId) || alphanumericId.includes(demoAlpha);
      });
    }

    if (demoMatch) {
      // If the query was the full combined demo ID or alias, preserve the queried ID for display fidelity
      const returnRecord = {
        ...demoMatch,
        healthId: demoMatch.healthId === 'JXV-STVAZREWPAT-202608-F4A1B' || sanitizedHealthId === 'JXV-STVAZREWPAT-202608-F4A1B'
          ? sanitizedHealthId
          : demoMatch.healthId
      };
      return res.status(200).json(formatEmergencyPatientResponse(returnRecord, true));
    }

    let record = null;
    if (isDatabaseConnected()) {
      await seedDemoHealthIds();

      // Safe alphanumeric regex for flexible hyphenation (e.g. JIV-2026-123456 vs JIV2026123456)
      const flexRegex = alphanumericId.length >= 4
        ? new RegExp('^' + alphanumericId.split('').join('[- ]?') + '$', 'i')
        : null;

      const idConditions = [
        { healthId: sanitizedHealthId },
        { healthId: alphanumericId }
      ];
      if (flexRegex) {
        idConditions.push({ healthId: { $regex: flexRegex } });
      }

      record = await MongoDb.healthIds.findOne({ $or: idConditions });

      // If not in healthIds collection, check if a registered patient user exists with this healthId
      if (!record) {
        const userMatch = await MongoDb.users.findOne({ $or: idConditions });
        if (userMatch) {
          // Auto-sync into health_ids collection
          const matchedHid = userMatch.healthId || sanitizedHealthId;
          record = await MongoDb.healthIds.create({
            healthId: matchedHid,
            userId: userMatch._id || userMatch.id,
            fullName: userMatch.name,
            email: userMatch.email || '',
            phoneNumber: userMatch.phone || '',
            dateOfBirth: userMatch.dateOfBirth || userMatch.dob || (userMatch.age ? `${new Date().getFullYear() - userMatch.age}-01-01` : '2000-01-01'),
            gender: userMatch.gender || 'Unspecified',
            bloodGroup: userMatch.bloodGroup || 'O+',
            emergencyContact: userMatch.emergencyContact || {},
            healthProfile: userMatch.healthProfile || {}
          }).catch(() => null);

          if (!record) {
            record = {
              healthId: matchedHid,
              fullName: userMatch.name,
              dateOfBirth: userMatch.dateOfBirth || userMatch.dob || (userMatch.age ? `${new Date().getFullYear() - userMatch.age}-01-01` : '2000-01-01'),
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
