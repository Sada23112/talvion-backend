const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'A conversation must have participants.']
      }
    ],
    isCollab: {
      type: Boolean,
      default: false
    },
    collabRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CollabRequest'
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    lastActivity: {
      type: Date,
      default: Date.now
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: new Map()
    },
    status: {
      type: String,
      enum: ['active', 'finished'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

// Indexes for query performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastActivity: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
