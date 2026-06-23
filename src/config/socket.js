const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const connectDB = require('./db');
const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');
const {
  mockConversationRepo,
  mockMessageRepo,
  mockUserRepo,
  mockNotificationRepo
} = require('../models/mock.db');
const logger = require('./logger');

const userSockets = new Map(); // userId -> Set of socket.ids

const isUserOnline = (userId) => {
  return userSockets.has(userId.toString());
};

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Authentication Middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const secret = process.env.JWT_SECRET || 'fallback_secret_talvion_key';
      const decoded = jwt.verify(token, secret);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      logger.error('Socket authentication failed:', err.message);
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId.toString();
    
    // Store user connection
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
    
    logger.info(`User ${userId} connected to socket. Total online: ${userSockets.size}`);

    // Join room
    socket.on('join_conversation', (conversationId) => {
      socket.join(conversationId);
      logger.info(`User ${userId} joined room: ${conversationId}`);
    });

    // Leave room
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
      logger.info(`User ${userId} left room: ${conversationId}`);
    });

    // Send Message
    socket.on('send_message', async (data, callback) => {
      const { conversationId, content, type, imageBytes, localId } = data;
      try {
        let conversation;
        let otherParticipantId;

        // 1. Fetch conversation and verify participant
        if (connectDB.isDbOffline()) {
          conversation = await mockConversationRepo.findById(conversationId);
          if (!conversation) {
            return socket.emit('error_occurred', 'Conversation not found');
          }
          const isPart = conversation.participants.some(p => p._id.toString() === userId);
          if (!isPart) {
            return socket.emit('error_occurred', 'Unauthorized');
          }
          otherParticipantId = conversation.participants
            .map(p => p._id.toString())
            .find(pId => pId !== userId);
        } else {
          conversation = await Conversation.findById(conversationId);
          if (!conversation) {
            return socket.emit('error_occurred', 'Conversation not found');
          }
          const isPart = conversation.participants.some(p => p.toString() === userId);
          if (!isPart) {
            return socket.emit('error_occurred', 'Unauthorized');
          }
          otherParticipantId = conversation.participants
            .map(p => p.toString())
            .find(pId => pId !== userId);
        }

        // 2. Check if the other participant is currently in the room
        let status = 'sent';
        let isOtherInRoom = false;
        
        const roomSockets = io.sockets.adapter.rooms.get(conversationId);
        if (roomSockets && otherParticipantId) {
          const otherSockets = userSockets.get(otherParticipantId) || new Set();
          for (const sId of otherSockets) {
            if (roomSockets.has(sId)) {
              isOtherInRoom = true;
              break;
            }
          }
        }

        if (isOtherInRoom) {
          status = 'read';
        } else if (otherParticipantId && isUserOnline(otherParticipantId)) {
          status = 'delivered';
        }

        // 3. Create message
        let message;
        if (connectDB.isDbOffline()) {
          message = await mockMessageRepo.create({
            conversation: conversationId,
            sender: userId,
            type: type || 'text',
            content,
            imageBytes: imageBytes || '',
            status
          });

          // Update unread count if other participant is not in room
          if (!isOtherInRoom && otherParticipantId) {
            const unreadCounts = conversation.unreadCounts || {};
            unreadCounts[otherParticipantId] = (unreadCounts[otherParticipantId] || 0) + 1;
            await mockConversationRepo.findByIdAndUpdate(conversationId, { unreadCounts });
          }
        } else {
          message = await Message.create({
            conversation: conversationId,
            sender: userId,
            type: type || 'text',
            content,
            imageBytes: imageBytes || '',
            status,
            deliveredAt: status === 'delivered' || status === 'read' ? new Date() : null,
            readAt: status === 'read' ? new Date() : null
          });

          // Update conversation last activity & last message
          conversation.lastMessage = message._id;
          conversation.lastActivity = message.createdAt;

          // Update unread count
          if (!isOtherInRoom && otherParticipantId) {
            if (!conversation.unreadCounts) {
              conversation.unreadCounts = new Map();
            }
            const currentUnread = conversation.unreadCounts.get(otherParticipantId) || 0;
            conversation.unreadCounts.set(otherParticipantId, currentUnread + 1);
          }
          await conversation.save();

          message = await Message.findById(message._id).populate('sender', 'fullName username avatarUrl profileImage');
        }

        const messageData = typeof message.toObject === 'function' ? message.toObject() : { ...message };
        if (localId) {
          messageData.localId = localId;
        }

        // 4. Emit message to conversation room
        io.to(conversationId).emit('message_received', messageData);

        // 5. If other participant is online but not in room, update their inbox
        if (otherParticipantId) {
          const otherSockets = userSockets.get(otherParticipantId);
          if (otherSockets) {
            otherSockets.forEach(sId => {
              io.to(sId).emit('inbox_updated', { conversationId });
            });
          }
        }

        // 6. Trigger offline chat notification if the recipient is offline
        const isOnline = otherParticipantId && isUserOnline(otherParticipantId);
        if (!isOnline && otherParticipantId) {
          if (connectDB.isDbOffline()) {
            await mockNotificationRepo.create({
              recipient: otherParticipantId,
              actor: userId,
              type: 'message'
            });
          } else {
            await Notification.create({
              recipient: otherParticipantId,
              actor: userId,
              type: 'message'
            });
          }
        }

        // Acknowledge sending success
        if (typeof callback === 'function') {
          callback({ status: 'success', message: messageData });
        }
      } catch (err) {
        logger.error('Error sending socket message:', err.message);
        socket.emit('error_occurred', 'Failed to send message');
      }
    });

    // Read Messages
    socket.on('read_messages', async (data) => {
      const { conversationId } = data;
      try {
        let conversation;
        let otherParticipantId;

        if (connectDB.isDbOffline()) {
          conversation = await mockConversationRepo.findById(conversationId);
          if (!conversation) return;
          otherParticipantId = conversation.participants
            .map(p => p._id.toString())
            .find(pId => pId !== userId);

          const unreadCounts = conversation.unreadCounts || {};
          unreadCounts[userId] = 0;
          await mockConversationRepo.findByIdAndUpdate(conversationId, { unreadCounts });

          await mockMessageRepo.updateMany(
            { conversation: conversationId, sender: otherParticipantId, status: { $ne: 'read' } },
            { status: 'read', readAt: new Date() }
          );
        } else {
          conversation = await Conversation.findById(conversationId);
          if (!conversation) return;
          otherParticipantId = conversation.participants
            .map(p => p.toString())
            .find(pId => pId !== userId);

          if (!conversation.unreadCounts) {
            conversation.unreadCounts = new Map();
          }
          conversation.unreadCounts.set(userId, 0);
          await conversation.save();

          await Message.updateMany(
            { conversation: conversationId, sender: otherParticipantId, status: { $ne: 'read' } },
            { status: 'read', readAt: new Date() }
          );
        }

        // Notify the other participant that messages have been read
        if (otherParticipantId) {
          const otherSockets = userSockets.get(otherParticipantId);
          if (otherSockets) {
            otherSockets.forEach(sId => {
              io.to(sId).emit('messages_read', { conversationId, readBy: userId });
            });
          }
        }
      } catch (err) {
        logger.error('Error marking read in socket:', err.message);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      const userSet = userSockets.get(userId);
      if (userSet) {
        userSet.delete(socket.id);
        if (userSet.size === 0) {
          userSockets.delete(userId);
        }
      }
      logger.info(`User ${userId} disconnected. Total online: ${userSockets.size}`);
    });
  });

  return io;
};

module.exports = { initSocket, isUserOnline };
