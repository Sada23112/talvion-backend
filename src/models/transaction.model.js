const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A transaction must belong to a user']
    },
    amount: {
      type: Number,
      required: [true, 'A transaction must have an amount']
    },
    currency: {
      type: String,
      required: [true, 'A transaction must specify a currency'],
      enum: {
        values: ['quill', 'premium_quill', 'gem'],
        message: 'Currency must be quill, premium_quill, or gem'
      }
    },
    type: {
      type: String,
      required: [true, 'A transaction must have a type'],
      enum: {
        values: [
          'quill_sent',
          'premium_quill_sent',
          'gems_earned',
          'gems_spent',
          'ad_reward',
          'daily_task_reward',
          'purchase_completed',
          'refund'
        ],
        message: 'Invalid transaction type'
      }
    },
    source: {
      type: String,
      required: [true, 'A transaction must have a source']
    },
    referenceId: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

transactionSchema.index({ user: 1 });
transactionSchema.index({ user: 1, timestamp: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
