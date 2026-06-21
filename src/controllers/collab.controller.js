const { CollabRequest, CollabChat } = require('../models/collab.model');
const User = require('../models/user.model');
const Conversation = require('../models/conversation.model');
const Notification = require('../models/notification.model');
const connectDB = require('../config/db');
const {
  mockCollabRequestRepo,
  mockCollabChatRepo,
  mockUserRepo,
  mockUsers,
  mockConversationRepo,
  mockNotificationRepo
} = require('../models/mock.db');

/**
 * @desc    Get users available for discovery (excluding self and existing requests/chats)
 * @route   GET /api/v1/collabs/discover
 * @access  Private
 */
const getDiscoverUsers = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const { page, limit } = req.query;

    let discoverUsers = [];
    let pagination = {};

    if (connectDB.isDbOffline()) {
      // 1. Get all requests involving this user
      const requests = await mockCollabRequestRepo.find();
      const userRequests = requests.filter(
        r => r.sender._id === userId || r.receiver._id === userId
      );
      const requestUserIds = new Set(
        userRequests.map(r => (r.sender._id === userId ? r.receiver._id : r.sender._id))
      );

      // 2. Get active chats involving this user
      const activeChats = await mockCollabChatRepo.find({ participant: userId, status: 'active' });
      const activeChatUserIds = new Set();
      activeChats.forEach(c => {
        c.participants.forEach(p => {
          if (p._id !== userId) activeChatUserIds.add(p._id);
        });
      });

      // 3. Filter mockUsers
      discoverUsers = mockUsers.filter(u => {
        const uId = u._id;
        return (
          uId !== userId &&
          !requestUserIds.has(uId) &&
          !activeChatUserIds.has(uId)
        );
      });
    } else {
      // 1. Get requests
      const userRequests = await CollabRequest.find({
        $or: [{ sender: userId }, { receiver: userId }]
      });
      const requestUserIds = userRequests.map(r =>
        r.sender.toString() === userId ? r.receiver.toString() : r.sender.toString()
      );

      // 2. Get active chats
      const activeChats = await CollabChat.find({
        participants: userId,
        status: 'active'
      });
      const activeChatUserIds = [];
      activeChats.forEach(c => {
        c.participants.forEach(pId => {
          if (pId.toString() !== userId) activeChatUserIds.push(pId.toString());
        });
      });

      // 3. Find other users
      const excludedIds = [userId, ...requestUserIds, ...activeChatUserIds];

      const parsedPage = parseInt(page, 10) || 1;
      const parsedLimit = parseInt(limit, 10) || 20; // Default limit 20
      const skip = (parsedPage - 1) * parsedLimit;

      const total = await User.countDocuments({
        _id: { $nin: excludedIds }
      });

      discoverUsers = await User.find({
        _id: { $nin: excludedIds }
      })
        .select('fullName username category bio avatarUrl totalStars')
        .skip(skip)
        .limit(parsedLimit);

      pagination = {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      };
    }

    res.status(200).json({
      status: 'success',
      results: discoverUsers.length,
      pagination: Object.keys(pagination).length ? pagination : undefined,
      users: discoverUsers
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send a collaboration request
 * @route   POST /api/v1/collabs/request
 * @access  Private
 */
const sendCollabRequest = async (req, res, next) => {
  try {
    const senderId = req.user._id.toString();
    const { receiverId, message } = req.body;

    if (!receiverId || !message) {
      const error = new Error('Please provide receiverId and message');
      error.statusCode = 400;
      return next(error);
    }

    if (senderId === receiverId.toString()) {
      const error = new Error('You cannot send a collaboration request to yourself.');
      error.statusCode = 400;
      return next(error);
    }

    let request;

    if (connectDB.isDbOffline()) {
      // Check if receiver exists
      const receiver = await mockUserRepo.findById(receiverId);
      if (!receiver) {
        const error = new Error('Receiver user not found');
        error.statusCode = 404;
        return next(error);
      }

      // Spam prevention: check requests in the last 30s
      const allRequests = await mockCollabRequestRepo.find();
      const recent = allRequests.find(
        r =>
          ((r.sender._id === senderId && r.receiver._id === receiverId) ||
            (r.sender._id === receiverId && r.receiver._id === senderId)) &&
          (Date.now() - new Date(r.createdAt).getTime() < 30 * 1000)
      );

      if (recent) {
        const error = new Error('Please wait 30 seconds before sending another request.');
        error.statusCode = 429;
        return next(error);
      }

      // Check if request already exists as active (pending or accepted)
      const duplicate = allRequests.find(
        r =>
          ((r.sender._id === senderId && r.receiver._id === receiverId) ||
            (r.sender._id === receiverId && r.receiver._id === senderId)) &&
          ['pending', 'accepted'].includes(r.status)
      );

      if (duplicate) {
        const error = new Error('An active collaboration request already exists between you');
        error.statusCode = 400;
        return next(error);
      }

      request = await mockCollabRequestRepo.create({
        sender: senderId,
        receiver: receiverId,
        message
      });

      // Trigger collab_request notification
      await mockNotificationRepo.create({
        recipient: receiverId,
        actor: senderId,
        type: 'collab_request'
      });
    } else {
      const receiver = await User.findById(receiverId);
      if (!receiver) {
        const error = new Error('Receiver user not found');
        error.statusCode = 404;
        return next(error);
      }

      // Spam prevention: check requests in the last 30s
      const recent = await CollabRequest.findOne({
        $or: [
          { sender: senderId, receiver: receiverId },
          { sender: receiverId, receiver: senderId }
        ],
        createdAt: { $gt: new Date(Date.now() - 30 * 1000) }
      });

      if (recent) {
        const error = new Error('Please wait 30 seconds before sending another request.');
        error.statusCode = 429;
        return next(error);
      }

      // Check if request already exists as active (pending or accepted)
      const duplicate = await CollabRequest.findOne({
        $or: [
          { sender: senderId, receiver: receiverId },
          { sender: receiverId, receiver: senderId }
        ],
        status: { $in: ['pending', 'accepted'] }
      });

      if (duplicate) {
        const error = new Error('An active collaboration request already exists between you');
        error.statusCode = 400;
        return next(error);
      }

      request = await CollabRequest.create({
        sender: senderId,
        receiver: receiverId,
        message
      });

      await request.populate('sender receiver', 'fullName username category bio avatarUrl');

      // Trigger collab_request notification
      await Notification.create({
        recipient: receiverId,
        actor: senderId,
        type: 'collab_request'
      });
    }

    res.status(201).json({
      status: 'success',
      message: 'Collaboration request sent successfully',
      request
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get incoming pending collaboration requests
 * @route   GET /api/v1/collabs/requests/incoming
 * @access  Private
 */
const getIncomingRequests = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const status = req.query.status || 'pending';

    let requests;

    if (connectDB.isDbOffline()) {
      requests = await mockCollabRequestRepo.find({ receiver: userId, status });
    } else {
      requests = await CollabRequest.find({
        receiver: userId,
        status
      })
        .populate('sender', 'fullName username category bio avatarUrl')
        .sort({ createdAt: -1 });
    }

    res.status(200).json({
      status: 'success',
      results: requests.length,
      requests
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get sent pending collaboration requests
 * @route   GET /api/v1/collabs/requests/sent
 * @access  Private
 */
const getSentRequests = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const status = req.query.status || 'pending';

    let requests;

    if (connectDB.isDbOffline()) {
      requests = await mockCollabRequestRepo.find({ sender: userId, status });
    } else {
      requests = await CollabRequest.find({
        sender: userId,
        status
      })
        .populate('receiver', 'fullName username category bio avatarUrl')
        .sort({ createdAt: -1 });
    }

    res.status(200).json({
      status: 'success',
      results: requests.length,
      requests
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Respond to a collaboration request (Accept / Reject)
 * @route   POST /api/v1/collabs/requests/:id/respond
 * @access  Private
 */
const respondToRequest = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const userId = req.user._id.toString();
    const { action } = req.body; // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action)) {
      const error = new Error('Action must be either accept or reject');
      error.statusCode = 400;
      return next(error);
    }

    let request;
    let chat = null;

    if (connectDB.isDbOffline()) {
      request = await mockCollabRequestRepo.findById(requestId);
      if (!request) {
        const error = new Error('Collaboration request not found');
        error.statusCode = 404;
        return next(error);
      }

      const receiverId = (typeof request.receiver === 'object') ? request.receiver._id : request.receiver;
      if (receiverId !== userId) {
        const error = new Error('You do not have permission to respond to this request');
        error.statusCode = 403;
        return next(error);
      }

      if (request.status !== 'pending') {
        const error = new Error(`Request is already ${request.status}`);
        error.statusCode = 400;
        return next(error);
      }

      const status = action === 'accept' ? 'accepted' : 'rejected';
      request = await mockCollabRequestRepo.findByIdAndUpdate(requestId, { status });

      if (action === 'accept') {
        const senderId = (typeof request.sender === 'object') ? request.sender._id : request.sender;
        
        // 1. Create/open the unified Conversation
        let conversation = await mockConversationRepo.findOne({
          participants: { $all: [senderId, userId] }
        });
        if (!conversation) {
          conversation = await mockConversationRepo.create({
            participants: [senderId, userId],
            isCollab: true,
            collabRequest: requestId
          });
        }
        
        // 2. Trigger notification
        await mockNotificationRepo.create({
          recipient: senderId,
          actor: userId,
          type: 'collab_accept'
        });

        // 3. Keep old CollabChat as compatibility fallback
        const activeChats = await mockCollabChatRepo.find();
        const chatExists = activeChats.find(
          c =>
            c.status === 'active' &&
            c.participants.some(p => p._id === senderId) &&
            c.participants.some(p => p._id === userId)
        );

        if (!chatExists) {
          chat = await mockCollabChatRepo.create({
            participants: [senderId, userId]
          });
        } else {
          chat = chatExists;
        }
      }
    } else {
      request = await CollabRequest.findById(requestId);
      if (!request) {
        const error = new Error('Collaboration request not found');
        error.statusCode = 404;
        return next(error);
      }

      if (request.receiver.toString() !== userId) {
        const error = new Error('You do not have permission to respond to this request');
        error.statusCode = 403;
        return next(error);
      }

      if (request.status !== 'pending') {
        const error = new Error(`Request is already ${request.status}`);
        error.statusCode = 400;
        return next(error);
      }

      request.status = action === 'accept' ? 'accepted' : 'rejected';
      await request.save();

      if (action === 'accept') {
        // 1. Create/open the unified Conversation
        let conversation = await Conversation.findOne({
          participants: { $all: [request.sender, userId] }
        });
        if (!conversation) {
          conversation = await Conversation.create({
            participants: [request.sender, userId],
            isCollab: true,
            collabRequest: requestId
          });
        }

        // 2. Trigger notification
        await Notification.create({
          recipient: request.sender,
          actor: userId,
          type: 'collab_accept'
        });

        // 3. Keep old CollabChat as compatibility fallback
        const chatExists = await CollabChat.findOne({
          participants: { $all: [request.sender, userId] },
          status: 'active'
        });

        if (!chatExists) {
          chat = await CollabChat.create({
            participants: [request.sender, userId]
          });
        } else {
          chat = chatExists;
        }
        await chat.populate('participants', 'fullName username category bio avatarUrl');
      }
    }

    res.status(200).json({
      status: 'success',
      message: `Collaboration request ${action}ed successfully`,
      request,
      chat
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel/delete a sent collaboration request
 * @route   POST /api/v1/collabs/requests/:id/cancel
 * @access  Private
 */
const cancelRequest = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const userId = req.user._id.toString();

    if (connectDB.isDbOffline()) {
      const request = await mockCollabRequestRepo.findById(requestId);
      if (!request) {
        const error = new Error('Collaboration request not found');
        error.statusCode = 404;
        return next(error);
      }

      const senderId = (typeof request.sender === 'object') ? request.sender._id : request.sender;
      if (senderId !== userId) {
        const error = new Error('You do not have permission to cancel this request');
        error.statusCode = 403;
        return next(error);
      }

      await mockCollabRequestRepo.findByIdAndUpdate(requestId, { status: 'cancelled' });
    } else {
      const request = await CollabRequest.findById(requestId);
      if (!request) {
        const error = new Error('Collaboration request not found');
        error.statusCode = 404;
        return next(error);
      }

      if (request.sender.toString() !== userId) {
        const error = new Error('You do not have permission to cancel this request');
        error.statusCode = 403;
        return next(error);
      }

      request.status = 'cancelled';
      await request.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Collaboration request canceled successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get active collaborations
 * @route   GET /api/v1/collabs/active
 * @access  Private
 */
const getActiveCollabs = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();

    let collabs;

    if (connectDB.isDbOffline()) {
      collabs = await mockCollabChatRepo.find({ participant: userId, status: 'active' });
    } else {
      collabs = await CollabChat.find({
        participants: userId,
        status: 'active'
      })
        .populate('participants', 'fullName username category bio avatarUrl')
        .sort({ updatedAt: -1 });
    }

    res.status(200).json({
      status: 'success',
      results: collabs.length,
      collabs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all messages inside a specific active collab chat
 * @route   GET /api/v1/collabs/chats/:id
 * @access  Private
 */
const getChatMessages = async (req, res, next) => {
  try {
    const chatId = req.params.id;
    const userId = req.user._id.toString();

    let chat;

    if (connectDB.isDbOffline()) {
      chat = await mockCollabChatRepo.findById(chatId);
      if (!chat) {
        const error = new Error('Collaboration chat not found');
        error.statusCode = 404;
        return next(error);
      }

      const isParticipant = chat.participants.some(p => p._id === userId);
      if (!isParticipant) {
        const error = new Error('You are not a participant in this chat');
        error.statusCode = 403;
        return next(error);
      }
    } else {
      chat = await CollabChat.findById(chatId).populate(
        'participants messages.sender',
        'fullName username category bio avatarUrl'
      );
      if (!chat) {
        const error = new Error('Collaboration chat not found');
        error.statusCode = 404;
        return next(error);
      }

      const isParticipant = chat.participants.some(p => p._id.toString() === userId);
      if (!isParticipant) {
        const error = new Error('You are not a participant in this chat');
        error.statusCode = 403;
        return next(error);
      }
    }

    res.status(200).json({
      status: 'success',
      messages: chat.messages
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send a message (text or image) to a collab chat
 * @route   POST /api/v1/collabs/chats/:id/messages
 * @access  Private
 */
const sendMessage = async (req, res, next) => {
  try {
    const chatId = req.params.id;
    const userId = req.user._id.toString();
    const { type, text, imageBytes } = req.body;

    if (!type || !['text', 'image'].includes(type)) {
      const error = new Error('Please specify message type: text or image');
      error.statusCode = 400;
      return next(error);
    }

    if (type === 'text' && !text) {
      const error = new Error('Please specify message text content');
      error.statusCode = 400;
      return next(error);
    }

    if (type === 'image' && !imageBytes) {
      const error = new Error('Please specify base64 imageBytes for image message');
      error.statusCode = 400;
      return next(error);
    }

    let chat;
    let newMessage;

    if (connectDB.isDbOffline()) {
      chat = await mockCollabChatRepo.findById(chatId);
      if (!chat) {
        const error = new Error('Collaboration chat not found');
        error.statusCode = 404;
        return next(error);
      }

      const isParticipant = chat.participants.some(p => p._id === userId);
      if (!isParticipant) {
        const error = new Error('You are not a participant in this chat');
        error.statusCode = 403;
        return next(error);
      }

      newMessage = {
        _id: `mock-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: userId,
        type,
        text: text || '',
        imageBytes: imageBytes || '',
        createdAt: new Date()
      };

      const messages = chat.messages ? [...chat.messages] : [];
      // To bypass populate wrap for storing
      const rawMessages = mockCollabChats.find(c => c._id === chatId).messages;
      rawMessages.push({
        _id: newMessage._id,
        sender: newMessage.sender,
        type: newMessage.type,
        text: newMessage.text,
        imageBytes: newMessage.imageBytes,
        createdAt: newMessage.createdAt
      });

      chat = await mockCollabChatRepo.findById(chatId); // Refresh populated
      newMessage = chat.messages.find(m => m._id === newMessage._id);
    } else {
      chat = await CollabChat.findById(chatId);
      if (!chat) {
        const error = new Error('Collaboration chat not found');
        error.statusCode = 404;
        return next(error);
      }

      const isParticipant = chat.participants.some(pId => pId.toString() === userId);
      if (!isParticipant) {
        const error = new Error('You are not a participant in this chat');
        error.statusCode = 403;
        return next(error);
      }

      const messageObj = {
        sender: userId,
        type,
        text: text || '',
        imageBytes: imageBytes || '',
        createdAt: new Date()
      };

      chat.messages.push(messageObj);
      await chat.save();

      // Retrieve and populate last message
      const savedChat = await CollabChat.findById(chatId).populate(
        'messages.sender',
        'fullName username category bio avatarUrl'
      );
      newMessage = savedChat.messages[savedChat.messages.length - 1];
    }

    res.status(201).json({
      status: 'success',
      message: 'Message sent successfully',
      newMessage
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Finish/post collaboration and close chat
 * @route   POST /api/v1/collabs/chats/:id/finish
 * @access  Private
 */
const finishCollab = async (req, res, next) => {
  try {
    const chatId = req.params.id;
    const userId = req.user._id.toString();

    let chat;

    if (connectDB.isDbOffline()) {
      chat = await mockCollabChatRepo.findById(chatId);
      if (!chat) {
        const error = new Error('Collaboration chat not found');
        error.statusCode = 404;
        return next(error);
      }

      const isParticipant = chat.participants.some(p => p._id === userId);
      if (!isParticipant) {
        const error = new Error('You are not a participant in this chat');
        error.statusCode = 403;
        return next(error);
      }

      chat = await mockCollabChatRepo.findByIdAndUpdate(chatId, { status: 'finished' });
    } else {
      chat = await CollabChat.findById(chatId);
      if (!chat) {
        const error = new Error('Collaboration chat not found');
        error.statusCode = 404;
        return next(error);
      }

      const isParticipant = chat.participants.some(pId => pId.toString() === userId);
      if (!isParticipant) {
        const error = new Error('You are not a participant in this chat');
        error.statusCode = 403;
        return next(error);
      }

      chat.status = 'finished';
      await chat.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Collaboration marked as finished successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDiscoverUsers,
  sendCollabRequest,
  getIncomingRequests,
  getSentRequests,
  respondToRequest,
  cancelRequest,
  getActiveCollabs,
  getChatMessages,
  sendMessage,
  finishCollab
};
