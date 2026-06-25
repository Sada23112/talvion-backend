const mongoose = require('mongoose');

const creationSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A creation must belong to a user creator']
    },
    title: {
      type: String,
      trim: true,
      default: ''
    },
    caption: {
      type: String,
      trim: true,
      default: ''
    },
    category: {
      type: String,
      required: [true, 'A creation must belong to a category (Art, Photo, Story, Poem, Essay, Quote)'],
      enum: {
        values: ['Art', 'Photo', 'Story', 'Poem', 'Essay', 'Quote'],
        message: 'Category must be either: Art, Photo, Story, Poem, Essay, or Quote'
      }
    },
    content: {
      type: String,
      default: ''
    },
    pages: {
      type: [String],
      default: []
    },
    gradientColors: {
      type: [String],
      default: ['#A67C6B', '#7A4A38']
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    bookmarks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    hashtags: {
      type: [String],
      default: []
    },
    isJoint: {
      type: Boolean,
      default: false
    },
    is18Plus: {
      type: Boolean,
      default: false
    },
    readTime: {
      type: String,
      default: '3 min read'
    },
    commentsCount: {
      type: Number,
      default: 0
    },
    tags: {
      type: [String],
      default: []
    },
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    media: [
      {
        url: { type: String, required: true },
        filename: { type: String },
        mimetype: { type: String },
        size: { type: Number }
      }
    ],
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'published'
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public'
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

creationSchema.index({ creator: 1 });
creationSchema.index({ category: 1 });
creationSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model('Creation', creationSchema);
