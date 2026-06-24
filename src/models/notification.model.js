const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification must have a recipient user.']
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification must have an actor user.']
    },
    type: {
      type: String,
      required: [true, 'Notification must have a type.'],
      enum: {
        values: ['like', 'comment', 'message', 'collab_request', 'collab_accept', 'follow', 'tip', 'mention'],
        message: 'Notification type must be one of: like, comment, message, collab_request, collab_accept, follow, tip, mention.'
      }
    },
    creation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Creation'
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
