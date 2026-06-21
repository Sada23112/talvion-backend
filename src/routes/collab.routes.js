const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/collab.controller');
const { protect } = require('../middlewares/auth.middleware');
const { verified } = require('../middlewares/verify.middleware');

// All collaboration routes require authentication
router.use(protect);

router.get('/discover', getDiscoverUsers);
router.post('/request', verified, sendCollabRequest);
router.get('/requests/incoming', getIncomingRequests);
router.get('/requests/sent', getSentRequests);
router.post('/requests/:id/respond', verified, respondToRequest);
router.post('/requests/:id/cancel', verified, cancelRequest);
router.get('/active', getActiveCollabs);
router.get('/chats/:id', getChatMessages);
router.post('/chats/:id/messages', verified, sendMessage);
router.post('/chats/:id/finish', verified, finishCollab);

module.exports = router;
