const mongoose = require('mongoose');

const gemWalletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A gem wallet must belong to a user'],
      unique: true
    },
    gems: {
      type: Number,
      required: true,
      min: [0, 'Gems balance cannot be negative'],
      default: 0
    },
    dailyGemsEarned: {
      type: Number,
      required: true,
      min: [0, 'Daily gems earned cannot be negative'],
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: null
    },
    purchasedBadges: {
      type: [String],
      default: []
    },
    purchasedThemes: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);



module.exports = mongoose.model('GemWallet', gemWalletSchema);
