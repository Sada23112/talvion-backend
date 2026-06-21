const express = require('express');
const router = express.Router();
const {
  getConversations,
  getOrCreateConversation,
  getConversationMessages,
  markConversationAsRead
} = require('../controllers/conversation.controller');
const { protect } = require('../middlewares/auth.middleware');
const { verified } = require('../middlewares/verify.middleware');

// Protect all conversation routes
router.use(protect);
router.use(verified);

router.get('/', getConversations);
router.post('/', getOrCreateConversation);
router.get('/:id/messages', getConversationMessages);
router.patch('/:id/read', markConversationAsRead);

module.exports = router;
