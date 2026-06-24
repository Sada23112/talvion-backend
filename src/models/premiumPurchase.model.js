const mongoose = require('mongoose');

const premiumPurchaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A premium purchase must belong to a user']
    },
    packId: {
      type: String,
      required: [true, 'A premium purchase must reference a packId'],
      enum: ['starter', 'popular', 'value']
    },
    amount: {
      type: Number,
      required: [true, 'A purchase must have an amount']
    },
    currency: {
      type: String,
      default: 'INR'
    },
    premiumQuillsAwarded: {
      type: Number,
      required: true
    },
    gemsAwarded: {
      type: Number,
      default: 0
    },
    paymentProvider: {
      type: String,
      required: true,
      enum: ['razorpay', 'cashfree', 'mock']
    },
    paymentId: {
      type: String,
      default: ''
    },
    orderId: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

premiumPurchaseSchema.index({ user: 1 });
premiumPurchaseSchema.index({ orderId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PremiumPurchase', premiumPurchaseSchema);
