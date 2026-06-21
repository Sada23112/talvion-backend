const mongoose = require('mongoose');

const readingProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reading progress must belong to a user']
    },
    creation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Creation',
      required: [true, 'Reading progress must belong to a creation']
    },
    progress: {
      type: Number,
      min: [0, 'Progress cannot be less than 0'],
      max: [100, 'Progress cannot be more than 100'],
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Compound index to guarantee uniqueness of user + creation progress entries
readingProgressSchema.index({ user: 1, creation: 1 }, { unique: true });

module.exports = mongoose.model('ReadingProgress', readingProgressSchema);
