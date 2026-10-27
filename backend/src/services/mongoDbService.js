const User = require('../models/User');
const HealthId = require('../models/HealthId');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const PharmacyOrder = require('../models/PharmacyOrder');
const AmbulanceRequest = require('../models/AmbulanceRequest');
const Conversation = require('../models/Conversation');
const MedicalReport = require('../models/MedicalReport');
const Session = require('../models/Session');
const {
  connectDB,
  disconnectDB,
  isMongoConfigured,
  isDatabaseConnected,
  checkDatabaseHealth
} = require('../config/db');

/**
 * MongoDB Data Access Repository Service
 * Provides idiomatic, unified database access for all Jivexa controllers
 */
const MongoDb = {
  // --- USERS ---
  users: {
    async findOne(filter = {}) {
      const query = {};
      if (filter.email) {
        query.email = filter.email.toLowerCase().trim();
      }
      if (filter.id || filter._id) {
        query._id = String(filter.id || filter._id);
      }
      if (filter.roleId) {
        query.roleId = String(filter.roleId).trim();
      }
      if (filter.healthId) {
        if (typeof filter.healthId === 'string') {
          const cleanHid = filter.healthId.toUpperCase().trim();
          query.$or = [
            { healthId: cleanHid },
            { healthId: cleanHid.replace(/[^A-Z0-9]/g, '') }
          ];
        } else {
          query.healthId = filter.healthId;
        }
      }
      if (filter.$or && Array.isArray(filter.$or)) {
        query.$or = filter.$or.map((cond) => {
          if (cond && typeof cond.healthId === 'string') {
            return { ...cond, healthId: cond.healthId.toUpperCase().trim() };
          }
          return cond;
        });
      }
      return await User.findOne(query);
    },

    async findById(id) {
      if (!id) return null;
      return await User.findOne({ _id: String(id) });
    },

    async create(userData) {
      const payload = { ...userData };
      if (payload.id && !payload._id) {
        payload._id = String(payload.id);
      }
      return await User.create(payload);
    },

    async find(filter = {}) {
      return await User.find(filter);
    }
  },

  // --- HEALTH IDS ---
  healthIds: {
    async findOne(filter = {}) {
      const query = {};
      if (filter.healthId) {
        if (typeof filter.healthId === 'string') {
          const clean = filter.healthId.toUpperCase().trim();
          query.healthId = clean;
        } else {
          query.healthId = filter.healthId;
        }
      } else if (filter.userId) {
        query.userId = String(filter.userId);
      } else if (filter.$or && Array.isArray(filter.$or)) {
        query.$or = filter.$or.map((cond) => {
          if (cond && typeof cond.healthId === 'string') {
            return { ...cond, healthId: cond.healthId.toUpperCase().trim() };
          }
          return cond;
        });
      }
      return await HealthId.findOne(query);
    },

    async findById(id) {
      if (!id) return null;
      return await HealthId.findOne({ _id: String(id) });
    },

    async create(data) {
      const payload = { ...data };
      if (payload.id && !payload._id) {
        payload._id = String(payload.id);
      }
      return await HealthId.create(payload);
    },

    async find(filter = {}) {
      return await HealthId.find(filter);
    }
  },

  // --- APPOINTMENTS ---
  appointments: {
    async create(data) {
      const payload = { ...data };
      if (payload.id && !payload._id) {
        payload._id = String(payload.id);
      }
      return await Appointment.create(payload);
    },

    async find(filter = {}) {
      return await Appointment.find(filter).sort({ date: -1, createdAt: -1 });
    },

    async findById(id) {
      if (!id) return null;
      return await Appointment.findOne({ _id: String(id) });
    },

    async deleteById(id) {
      if (!id) return false;
      const res = await Appointment.deleteOne({ _id: String(id) });
      return res.deletedCount > 0;
    }
  },

  // --- PRESCRIPTIONS ---
  prescriptions: {
    async create(data) {
      const payload = { ...data };
      if (payload.id && !payload._id) {
        payload._id = String(payload.id);
      }
      return await Prescription.create(payload);
    },

    async find(filter = {}) {
      return await Prescription.find(filter).sort({ date: -1, createdAt: -1 });
    },

    async findById(id) {
      if (!id) return null;
      return await Prescription.findOne({ _id: String(id) });
    },

    async deleteById(id) {
      if (!id) return false;
      const res = await Prescription.deleteOne({ _id: String(id) });
      return res.deletedCount > 0;
    }
  },

  // --- PHARMACY ORDERS ---
  pharmacyOrders: {
    async create(data) {
      const payload = { ...data };
      if (payload.id && !payload._id) {
        payload._id = String(payload.id);
      }
      return await PharmacyOrder.create(payload);
    },

    async find(filter = {}) {
      return await PharmacyOrder.find(filter).sort({ createdAt: -1 });
    },

    async findById(id) {
      if (!id) return null;
      return await PharmacyOrder.findOne({ _id: String(id) });
    },

    async deleteById(id) {
      if (!id) return false;
      const res = await PharmacyOrder.deleteOne({ _id: String(id) });
      return res.deletedCount > 0;
    }
  },

  // --- AMBULANCE REQUESTS ---
  ambulanceRequests: {
    async create(data) {
      const payload = { ...data };
      if (payload.id && !payload._id) {
        payload._id = String(payload.id);
      }
      return await AmbulanceRequest.create(payload);
    },

    async find(filter = {}) {
      return await AmbulanceRequest.find(filter).sort({ createdAt: -1 });
    },

    async findById(id) {
      if (!id) return null;
      return await AmbulanceRequest.findOne({ _id: String(id) });
    },

    async deleteById(id) {
      if (!id) return false;
      const res = await AmbulanceRequest.deleteOne({ _id: String(id) });
      return res.deletedCount > 0;
    }
  },

  // --- CONVERSATIONS ---
  conversations: {
    async find(filter = {}) {
      return await Conversation.find(filter).sort({ lastUpdated: -1 });
    },

    async findById(id) {
      if (!id) return null;
      return await Conversation.findOne({ _id: String(id) });
    },

    async findOne(filter = {}) {
      return await Conversation.findOne(filter);
    },

    async upsert(id, userId, data) {
      const payload = { ...data, userId: String(userId), lastUpdated: new Date() };
      return await Conversation.findOneAndUpdate(
        { _id: String(id), userId: String(userId) },
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    },

    async deleteById(id, userId) {
      if (!id) return false;
      const query = { _id: String(id) };
      if (userId) query.userId = String(userId);
      const res = await Conversation.deleteOne(query);
      return res.deletedCount > 0;
    },

    async deleteMany(filter = {}) {
      return await Conversation.deleteMany(filter);
    }
  },

  // --- MEDICAL REPORTS ---
  medicalReports: {
    async create(data) {
      const payload = { ...data };
      if (payload.id && !payload._id) {
        payload._id = String(payload.id);
      }
      return await MedicalReport.create(payload);
    },

    async find(filter = {}) {
      return await MedicalReport.find(filter).sort({ createdAt: -1 });
    },

    async findById(id) {
      if (!id) return null;
      return await MedicalReport.findOne({ _id: String(id) });
    },

    async findOne(filter = {}) {
      return await MedicalReport.findOne(filter);
    },

    async shareWithDoctor(reportId, patientId, doctorData) {
      return await MedicalReport.findOneAndUpdate(
        { _id: String(reportId), patientId: String(patientId) },
        {
          $addToSet: {
            sharedWithDoctors: {
              doctorId: String(doctorData.doctorId),
              doctorName: doctorData.doctorName || 'Doctor',
              sharedAt: new Date(),
              reviewStatus: 'Pending Review'
            }
          }
        },
        { new: true }
      );
    },

    async deleteById(id, patientId) {
      if (!id) return false;
      const query = { _id: String(id) };
      if (patientId) query.patientId = String(patientId);
      const res = await MedicalReport.deleteOne(query);
      return res.deletedCount > 0;
    }
  },

  // --- SESSIONS ---
  sessions: {
    async create(data) {
      const payload = { ...data };
      if (payload.id && !payload._id) {
        payload._id = String(payload.id);
      }
      return await Session.create(payload);
    },

    async findOne(filter = {}) {
      return await Session.findOne(filter);
    },

    async find(filter = {}, sort = { lastActive: -1 }) {
      return await Session.find(filter).sort(sort);
    },

    async updateOne(filter = {}, update = {}) {
      return await Session.updateOne(filter, update);
    },

    async updateMany(filter = {}, update = {}) {
      return await Session.updateMany(filter, update);
    },

    async deleteOne(filter = {}) {
      return await Session.deleteOne(filter);
    }
  }
};

module.exports = {
  MongoDb,
  // Alias for backward compatibility during transition
  db: MongoDb,
  connectDB,
  disconnectDB,
  isMongoConfigured,
  isDatabaseConnected,
  checkDatabaseHealth
};
