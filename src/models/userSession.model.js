const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    oldTokenHashes: {
      type: [String],
      default: []
    },
    deviceName: {
      type: String,
      default: 'Unknown Device'
    },
    deviceType: {
      type: String,
      enum: ['Mobile', 'Desktop', 'Tablet', 'Web', 'Unknown'],
      default: 'Unknown'
    },
    ipAddress: {
      type: String,
      default: ''
    },
    location: {
      type: String,
      default: ''
    },
    lastActive: {
      type: Date,
      default: Date.now
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// TTL index to automatically clean up expired sessions from MongoDB
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('UserSession', userSessionSchema);
