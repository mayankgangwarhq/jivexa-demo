const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    sessionId: {
      type: String,
      required: [true, 'Session ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true
    },
    device: {
      type: String,
      trim: true,
      default: 'Unknown Device'
    },
    browser: {
      type: String,
      trim: true,
      default: 'Unknown'
    },
    os: {
      type: String,
      trim: true,
      default: 'Unknown'
    },
    deviceType: {
      type: String,
      trim: true,
      default: 'Desktop'
    },
    ip: {
      type: String,
      trim: true,
      default: 'Unknown IP'
    },
    location: {
      type: String,
      trim: true,
      default: 'Location Unavailable'
    },
    userAgent: {
      type: String,
      default: ''
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true
    },
    revokedAt: {
      type: Date,
      default: null
    },
    lastActive: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day default
      index: { expires: 0 } // Automatic MongoDB TTL deletion when expired
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

sessionSchema.virtual('id').get(function () {
  return this.sessionId || this._id;
});

// Composite index for fast querying of a user's active sessions
sessionSchema.index({ userId: 1, isRevoked: 1, lastActive: -1 });

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
