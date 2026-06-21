const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const User = require('../models/user.model');
const connectDB = require('../config/db');
const { mockConversationRepo, mockMessageRepo, mockUserRepo } = require('../models/mock.db');

/**
 * @desc    Get all conversations for the logged-in user
 * @route   GET /api/v1/conversations
 * @access  Private
 */
const getConversations = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    let conversations;

    if (connectDB.isDbOffline()) {
      conversations = await mockConversationRepo.find({ participant: userId });
    } else {
      conversations = await Conversation.find({
        participants: userId
      })
        .populate('participants', 'fullName username avatarUrl profileImage category bio')
        .populate({
          path: 'lastMessage',
          populate: {
            path: 'sender',
            select: 'fullName username avatarUrl profileImage'
          }
        })
        .sort({ lastActivity: -1 });
    }

    res.status(200).json({
      status: 'success',
      results: conversations.length,
      conversations
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create or retrieve conversation with another user
 * @route   POST /api/v1/conversations
 * @access  Private
 */
const getOrCreateConversation = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const { participantId } = req.body;

    if (!participantId) {
      const error = new Error('Please provide participantId');
      error.statusCode = 400;
      return next(error);
    }

    if (userId === participantId.toString()) {
      const error = new Error('Cannot start a conversation with yourself');
      error.statusCode = 400;
      return next(error);
    }

    let conversation;

    if (connectDB.isDbOffline()) {
      const participant = await mockUserRepo.findById(participantId);
      if (!participant) {
        const error = new Error('User not found');
        error.statusCode = 404;
        return next(error);
      }

      conversation = await mockConversationRepo.findOne({
        participants: { $all: [userId, participantId] }
      });

      if (!conversation) {
        conversation = await mockConversationRepo.create({
          participants: [userId, participantId]
        });
      }
    } else {
      const participant = await User.findById(participantId);
      if (!participant) {
        const error = new Error('User not found');
        error.statusCode = 404;
        return next(error);
      }

      conversation = await Conversation.findOne({
        participants: { $all: [userId, participantId] }
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [userId, participantId]
        });
      }

      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'fullName username avatarUrl profileImage category bio')
        .populate({
          path: 'lastMessage',
          populate: {
            path: 'sender',
            select: 'fullName username avatarUrl profileImage'
          }
        });
    }

    res.status(200).json({
      status: 'success',
      conversation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get paginated messages inside a conversation
 * @route   GET /api/v1/conversations/:id/messages
 * @access  Private
 */
const getConversationMessages = async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    const userId = req.user._id.toString();
    const { page, limit } = req.query;

    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 20;
    const skip = (parsedPage - 1) * parsedLimit;

    let conversation;
    let messages;
    let total = 0;

    if (connectDB.isDbOffline()) {
      conversation = await mockConversationRepo.findById(conversationId);
      if (!conversation) {
        const error = new Error('Conversation not found');
        error.statusCode = 404;
        return next(error);
      }

      const isParticipant = conversation.participants.some(p => p._id.toString() === userId);
      if (!isParticipant) {
        const error = new Error('You are not a participant in this conversation');
        error.statusCode = 403;
        return next(error);
      }

      const allMessages = await mockMessageRepo.find({ conversation: conversationId });
      total = allMessages.length;
      messages = allMessages.slice(skip, skip + parsedLimit);
    } else {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        const error = new Error('Conversation not found');
        error.statusCode = 404;
        return next(error);
      }

      const isParticipant = conversation.participants.some(p => p.toString() === userId);
      if (!isParticipant) {
        const error = new Error('You are not a participant in this conversation');
        error.statusCode = 403;
        return next(error);
      }

      total = await Message.countDocuments({ conversation: conversationId });
      messages = await Message.find({ conversation: conversationId })
        .populate('sender', 'fullName username avatarUrl profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);
    }

    res.status(200).json({
      status: 'success',
      results: messages.length,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      },
      messages
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all messages in a conversation as read
 * @route   PATCH /api/v1/conversations/:id/read
 * @access  Private
 */
const markConversationAsRead = async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    const userId = req.user._id.toString();

    if (connectDB.isDbOffline()) {
      const conversation = await mockConversationRepo.findById(conversationId);
      if (!conversation) {
        const error = new Error('Conversation not found');
        error.statusCode = 404;
        return next(error);
      }

      // Reset unread count for current user
      const unreadCounts = conversation.unreadCounts || {};
      unreadCounts[userId] = 0;
      await mockConversationRepo.findByIdAndUpdate(conversationId, { unreadCounts });

      // Mark messages as read
      await mockMessageRepo.updateMany(
        { conversation: conversationId, sender: { $ne: userId }, status: { $ne: 'read' } },
        { status: 'read', readAt: new Date() }
      );
    } else {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        const error = new Error('Conversation not found');
        error.statusCode = 404;
        return next(error);
      }

      // Reset unread count
      if (!conversation.unreadCounts) {
        conversation.unreadCounts = new Map();
      }
      conversation.unreadCounts.set(userId, 0);
      await conversation.save();

      // Mark messages as read
      await Message.updateMany(
        { conversation: conversationId, sender: { $ne: userId }, status: { $ne: 'read' } },
        { status: 'read', readAt: new Date() }
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Conversation marked as read'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConversations,
  getOrCreateConversation,
  getConversationMessages,
  markConversationAsRead
};
