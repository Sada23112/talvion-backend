const Comment = require('../models/comment.model');
const Creation = require('../models/creation.model');
const Notification = require('../models/notification.model');
const connectDB = require('../config/db');
const logger = require('../config/logger');
const { mockCommentRepo, mockCreationRepo, mockNotificationRepo } = require('../models/mock.db');

const getAbsoluteUrl = (req, relativePath) => {
  if (!relativePath) return '';
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${req.protocol}://${req.get('host')}${cleanPath}`;
};

const formatCommentResponse = (req, commentDoc) => {
  const c = typeof commentDoc.toObject === 'function' ? commentDoc.toObject() : { ...commentDoc };
  if (c.userAvatar && c.userAvatar.startsWith('/uploads/')) {
    c.userAvatar = getAbsoluteUrl(req, c.userAvatar);
  }
  return c;
};

/**
 * @desc    Add a comment to a creation
 * @route   POST /api/v1/creations/:creationId/comments
 * @access  Private
 */
const createComment = async (req, res, next) => {
  try {
    const { creationId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;
    const username = req.user.username;
    const userAvatar = req.user.profileImage || req.user.avatarUrl || '';

    // Validate creation existence & fetch details
    let creation;
    if (connectDB.isDbOffline()) {
      creation = await mockCreationRepo.findById(creationId);
    } else {
      creation = await Creation.findById(creationId);
    }

    if (!creation) {
      const error = new Error('Creation not found.');
      error.statusCode = 404;
      return next(error);
    }

    let comment;

    if (connectDB.isDbOffline()) {
      comment = await mockCommentRepo.create({
        creation: creationId,
        user: userId,
        username,
        userAvatar,
        text
      });
      // Increment commentsCount in mock DB
      const currentCount = creation.commentsCount || 0;
      await mockCreationRepo.findByIdAndUpdate(creationId, { commentsCount: currentCount + 1 });

      // Trigger notification
      const creatorId = creation.creator && creation.creator._id ? creation.creator._id.toString() : creation.creator.toString();
      if (creatorId !== userId.toString()) {
        await mockNotificationRepo.create({
          recipient: creatorId,
          actor: userId,
          type: 'comment',
          creation: creationId
        });
      }
    } else {
      comment = await Comment.create({
        creation: creationId,
        user: userId,
        username,
        userAvatar,
        text
      });
      // Increment commentsCount in Mongoose
      await Creation.findByIdAndUpdate(creationId, { $inc: { commentsCount: 1 } });

      // Trigger notification
      const creatorId = creation.creator && creation.creator._id ? creation.creator._id.toString() : creation.creator.toString();
      if (creatorId !== userId.toString()) {
        await Notification.create({
          recipient: creatorId,
          actor: userId,
          type: 'comment',
          creation: creationId
        });
      }
    }

    logger.info(`Comment added successfully by user ${username} to creation ${creationId}`, { commentId: comment._id });

    res.status(201).json({
      status: 'success',
      message: 'Comment posted successfully',
      comment: formatCommentResponse(req, comment)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get comments for a creation with pagination
 * @route   GET /api/v1/creations/:creationId/comments
 * @access  Public
 */
const getComments = async (req, res, next) => {
  try {
    const { creationId } = req.params;
    const { page, limit } = req.query;

    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 20;
    const skip = (parsedPage - 1) * parsedLimit;

    let comments;
    let total = 0;

    if (connectDB.isDbOffline()) {
      const result = await mockCommentRepo.find({ creation: creationId, skip, limit: parsedLimit });
      comments = result.comments;
      total = result.total;
    } else {
      total = await Comment.countDocuments({ creation: creationId });
      comments = await Comment.find({ creation: creationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);
    }

    res.status(200).json({
      status: 'success',
      results: comments.length,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      },
      comments: comments.map(c => formatCommentResponse(req, c))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a comment
 * @route   DELETE /api/v1/comments/:commentId
 * @access  Private
 */
const deleteComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id.toString();

    let comment;

    if (connectDB.isDbOffline()) {
      comment = await mockCommentRepo.findById(commentId);
      if (!comment) {
        const error = new Error('Comment not found.');
        error.statusCode = 404;
        return next(error);
      }

      // Check ownership
      const commentUserIdStr = comment.user ? comment.user.toString() : '';
      if (commentUserIdStr !== userId) {
        const error = new Error('You do not have permission to delete this comment.');
        error.statusCode = 403;
        return next(error);
      }

      await mockCommentRepo.findByIdAndDelete(commentId);

      // Decrement commentsCount in mock DB
      const creationId = comment.creation;
      const mockCreation = await mockCreationRepo.findById(creationId);
      if (mockCreation) {
        const currentCount = mockCreation.commentsCount || 0;
        const newCount = Math.max(0, currentCount - 1);
        await mockCreationRepo.findByIdAndUpdate(creationId, { commentsCount: newCount });
      }
    } else {
      comment = await Comment.findById(commentId);
      if (!comment) {
        const error = new Error('Comment not found.');
        error.statusCode = 404;
        return next(error);
      }

      if (comment.user.toString() !== userId) {
        const error = new Error('You do not have permission to delete this comment.');
        error.statusCode = 403;
        return next(error);
      }

      await Comment.findByIdAndDelete(commentId);

      // Decrement commentsCount in Mongoose
      await Creation.findByIdAndUpdate(comment.creation, { $inc: { commentsCount: -1 } });
    }

    logger.info(`Comment ${commentId} deleted successfully by owner ${userId}`);

    res.status(200).json({
      status: 'success',
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createComment,
  getComments,
  deleteComment
};
