const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    creation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Creation',
      required: [true, 'A comment must belong to a creation']
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A comment must belong to a user']
    },
    username: {
      type: String,
      required: [true, 'A comment must store the username']
    },
    userAvatar: {
      type: String,
      default: ''
    },
    text: {
      type: String,
      required: [true, 'Comment text cannot be empty'],
      trim: true,
      maxlength: [500, 'Comment text cannot exceed 500 characters']
    }
  },
  {
    timestamps: true
  }
);

commentSchema.index({ creation: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
