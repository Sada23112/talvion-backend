const mongoose = require('mongoose');

const taskCompletionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Task completion must belong to a user']
    },
    taskId: {
      type: String,
      required: [true, 'Task completion must have a taskId']
    },
    completedAt: {
      type: Date,
      default: Date.now
    },
    dateString: {
      type: String,
      required: [true, 'Task completion must record a date string (YYYY-MM-DD)']
    }
  },
  {
    timestamps: true
  }
);

// Compound index to ensure a user can only complete a task once per day
taskCompletionSchema.index({ user: 1, taskId: 1, dateString: 1 }, { unique: true });

module.exports = mongoose.model('TaskCompletion', taskCompletionSchema);
