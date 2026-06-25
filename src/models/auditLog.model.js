const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    actionType: {
      type: String,
      required: true,
      index: true
    },
    targetModel: {
      type: String,
      required: true,
      index: true
    },
    targetId: {
      type: String,
      required: true,
      index: true
    },
    description: {
      type: String,
      default: ''
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    ipAddress: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false } // Only require createdAt for log records
  }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
