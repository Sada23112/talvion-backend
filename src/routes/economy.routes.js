const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth.middleware');
const {
  getWalletBalance,
  sendQuillTip,
  watchAdSupport,
  getDailyTasks,
  claimTask,
  spendGems,
  getTransactions,
  buyPremiumQuills,
  verifyPremiumPurchase,
  getAnalytics
} = require('../controllers/economy.controller');

// All economy routes require authentication
router.use(protect);

router.get('/wallet', getWalletBalance);
router.post('/quill/send', sendQuillTip);
router.post('/ad-support', watchAdSupport);
router.get('/tasks', getDailyTasks);
router.post('/tasks/:taskId/claim', claimTask);
router.post('/spend/:type', spendGems);
router.get('/transactions', getTransactions);
router.post('/premium/buy', buyPremiumQuills);
router.post('/premium/verify', verifyPremiumPurchase);
router.get('/analytics', getAnalytics);

module.exports = router;
