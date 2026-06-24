const mongoose = require('mongoose');

const annotationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Annotation must have a user.']
    },
    creation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Creation',
      required: [true, 'Annotation must be attached to a creation.']
    },
    type: {
      type: String,
      enum: ['highlight', 'bookmark', 'note'],
      required: [true, 'Annotation must have a type.']
    },
    text: {
      type: String,
      required: false // Used when type is 'note'
    },
    startOffset: {
      type: Number,
      required: [true, 'Annotation must have a startOffset.']
    },
    endOffset: {
      type: Number,
      required: [true, 'Annotation must have an endOffset.']
    },
    color: {
      type: String,
      default: '#FFFF00' // Default highlight color
    }
  },
  {
    timestamps: true
  }
);

// Index for quick retrieval of annotations by creation and user
annotationSchema.index({ creation: 1, user: 1 });

module.exports = mongoose.model('Annotation', annotationSchema);
