const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Report must be associated with a user']
    },
    description: {
      type: String,
      required: [true, 'Please provide a description of the issue'],
      trim: true,
      maxlength: [300, 'Description cannot exceed 300 characters']
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

module.exports = mongoose.model('Report', reportSchema);
