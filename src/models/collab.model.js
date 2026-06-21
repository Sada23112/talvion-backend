const mongoose = require('mongoose');

const collabRequestSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A collab request must have a sender']
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A collab request must have a receiver']
    },
    message: {
      type: String,
      required: [true, 'Please provide a message or plan for the collaboration']
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A message must belong to a sender']
  },
  type: {
    type: String,
    enum: ['text', 'image'],
    default: 'text'
  },
  text: {
    type: String,
    default: ''
  },
  imageBytes: {
    type: String, // Base64 representation of image
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const collabChatSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'A collab chat must have participants']
      }
    ],
    status: {
      type: String,
      enum: ['active', 'finished'],
      default: 'active'
    },
    messages: [messageSchema]
  },
  {
    timestamps: true
  }
);

collabRequestSchema.index({ sender: 1 });
collabRequestSchema.index({ receiver: 1 });
collabRequestSchema.index({ sender: 1, receiver: 1 });

collabChatSchema.index({ participants: 1 });

const CollabRequest = mongoose.model('CollabRequest', collabRequestSchema);
const CollabChat = mongoose.model('CollabChat', collabChatSchema);

module.exports = {
  CollabRequest,
  CollabChat
};
