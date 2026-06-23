const mongoose = require('mongoose');

const REPORT_REASONS = [
  'Inappropriate / vulgar content',
  'Harassment or bullying',
  'Spam or misleading',
  'Hate speech',
  'Violence or dangerous acts',
  'Other',
];

const reportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Report must be associated with a user']
    },
    // Structured content report fields (optional for backward-compat with general /support/report)
    targetType: {
      type: String,
      enum: ['creation', 'user', 'comment', 'general'],
      default: 'general'
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    reason: {
      type: String,
      enum: [...REPORT_REASONS, null],
      default: null
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: ''
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open'
    }
  },
  {
    timestamps: true
  }
);

reportSchema.index({ user: 1 });
reportSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('Report', reportSchema);
module.exports.REPORT_REASONS = REPORT_REASONS;

