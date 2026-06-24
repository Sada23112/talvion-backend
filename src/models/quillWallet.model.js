const mongoose = require('mongoose');

const quillWalletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A quill wallet must belong to a user'],
      unique: true
    },
    quills: {
      type: Number,
      required: true,
      min: [0, 'Quills balance cannot be negative'],
      default: 24
    },
    premiumQuills: {
      type: Number,
      required: true,
      min: [0, 'Premium quills balance cannot be negative'],
      default: 0
    }
  },
  {
    timestamps: true
  }
);



module.exports = mongoose.model('QuillWallet', quillWalletSchema);
