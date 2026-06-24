const EconomyService = require('../services/economy.service');
const PaymentService = require('../services/payment.service');
const connectDB = require('../config/db');

// Models & Repos
const Transaction = require('../models/transaction.model');
const TaskCompletion = require('../models/taskCompletion.model');
const PremiumPurchase = require('../models/premiumPurchase.model');
const Creation = require('../models/creation.model');

const {
  mockTransactionRepo,
  mockTaskCompletionRepo,
  mockPremiumPurchaseRepo,
  mockCreationRepo
} = require('../models/mock.db');

/**
 * @desc    Get user's wallet balances and daily cap limit details
 * @route   GET /api/v1/economy/wallet
 * @access  Private
 */
const getWalletBalance = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const quillWallet = await EconomyService.getQuillWallet(userId);
    const gemWallet = await EconomyService.getGemWallet(userId);
    
    // Determine daily cap based on user total stars
    const totalStars = req.user.totalStars || 0;
    const dailyCap = EconomyService.getDailyGemsCap(totalStars);
    
    // Auto reset today's cap if day changed
    EconomyService._checkAndResetDailyCap(gemWallet);
    await gemWallet.save();

    res.status(200).json({
      status: 'success',
      data: {
        quills: quillWallet.quills,
        premiumQuills: quillWallet.premiumQuills,
        gems: gemWallet.gems,
        dailyCap: dailyCap === Infinity ? -1 : dailyCap, // -1 denotes unlimited
        dailyGemsEarned: gemWallet.dailyGemsEarned,
        purchasedBadges: gemWallet.purchasedBadges,
        purchasedThemes: gemWallet.purchasedThemes
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send quill tip to a creation
 * @route   POST /api/v1/economy/quill/send
 * @access  Private
 */
const sendQuillTip = async (req, res, next) => {
  try {
    const senderId = req.user._id;
    const { creationId, amount, isPremium } = req.body;

    if (!creationId) {
      const error = new Error('Please specify a creation ID');
      error.statusCode = 400;
      return next(error);
    }

    const result = await EconomyService.sendQuill(
      senderId,
      creationId,
      parseInt(amount, 10) || 1,
      isPremium === true || isPremium === 'true'
    );

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Watch ad support to earn quill & award creator gem
 * @route   POST /api/v1/economy/ad-support
 * @access  Private
 */
const watchAdSupport = async (req, res, next) => {
  try {
    const viewerId = req.user._id;
    const { creationId } = req.body;

    const result = await EconomyService.watchAdSupport(viewerId, creationId);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's daily tasks list with their claimed status
 * @route   GET /api/v1/economy/tasks
 * @access  Private
 */
const getDailyTasks = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const todayStr = new Date().toISOString().split('T')[0];

    const tasks = [
      { id: 'post_today',   title: 'Post something today', reward: 1, icon: 'edit_rounded' },
      { id: 'like_5',       title: 'Like 5 posts', reward: 1, icon: 'favorite_rounded' },
      { id: 'comment_3',    title: 'Comment on 3 posts', reward: 1, icon: 'chat_bubble_rounded' },
      { id: 'explore_10',   title: 'Explore 10 posts', reward: 1, icon: 'explore_rounded' },
      { id: 'send_collab',  title: 'Send a collab request', reward: 2, icon: 'group_add_rounded' },
      { id: 'watch_ad',     title: 'Watch an ad to earn', reward: 2, icon: 'ondemand_video_rounded' }
    ];

    let completions;
    if (connectDB.isDbOffline()) {
      completions = await mockTaskCompletionRepo.find({ user: userId, dateString: todayStr });
    } else {
      completions = await TaskCompletion.find({ user: userId, dateString: todayStr });
    }

    const completedIds = completions.map(c => c.taskId);

    const taskList = tasks.map(task => ({
      ...task,
      isCompleted: completedIds.includes(task.id)
    }));

    res.status(200).json({
      status: 'success',
      results: taskList.length,
      data: taskList
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Claim task reward
 * @route   POST /api/v1/economy/tasks/:taskId/claim
 * @access  Private
 */
const claimTask = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { taskId } = req.params;

    const result = await EconomyService.claimTaskReward(userId, taskId);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Spend gems on items (boosts, themes, badges)
 * @route   POST /api/v1/economy/spend/:type
 * @access  Private
 */
const spendGems = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { type } = req.params; // badge, theme, boost
    const { itemId, cost } = req.body;

    const parsedCost = parseInt(cost, 10);
    if (isNaN(parsedCost) || parsedCost <= 0) {
      const error = new Error('Please specify a valid gem cost');
      error.statusCode = 400;
      return next(error);
    }

    const result = await EconomyService.spendGems(userId, type, parsedCost, itemId);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's transactions logs
 * @route   GET /api/v1/economy/transactions
 * @access  Private
 */
const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user._id;
    let list;

    if (connectDB.isDbOffline()) {
      list = await mockTransactionRepo.find({ user: userId });
    } else {
      list = await Transaction.find({ user: userId }).sort({ timestamp: -1 });
    }

    res.status(200).json({
      status: 'success',
      results: list.length,
      data: list
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Initialize a premium purchase order
 * @route   POST /api/v1/economy/premium/buy
 * @access  Private
 */
const buyPremiumQuills = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { packId, provider } = req.body; // provider: razorpay, cashfree, mock

    const order = await PaymentService.createOrder(userId, packId, provider);

    // Save pending purchase record
    const ppData = {
      user: userId,
      packId,
      amount: order.amount,
      premiumQuillsAwarded: packId === 'starter' ? 10 : (packId === 'popular' ? 50 : 100),
      gemsAwarded: packId === 'popular' ? 10 : (packId === 'value' ? 25 : 0),
      paymentProvider: provider || 'mock',
      orderId: order.orderId,
      status: 'pending'
    };

    if (connectDB.isDbOffline()) {
      await mockPremiumPurchaseRepo.create(ppData);
    } else {
      await PremiumPurchase.create(ppData);
    }

    res.status(200).json({
      status: 'success',
      data: order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify payment and credit premium quills / bonus gems
 * @route   POST /api/v1/economy/premium/verify
 * @access  Private
 */
const verifyPremiumPurchase = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { provider, orderId, paymentId, signature, packId } = req.body;

    const result = await PaymentService.verifyPayment(userId, {
      provider,
      orderId,
      paymentId,
      signature,
      packId
    });

    // Complete purchase record and credit quills wallet
    let purchase;
    if (connectDB.isDbOffline()) {
      purchase = await mockPremiumPurchaseRepo.findOne({ orderId });
    } else {
      purchase = await PremiumPurchase.findOne({ orderId });
    }

    if (!purchase) {
      const error = new Error('Purchase record not found');
      error.statusCode = 404;
      return next(error);
    }

    if (purchase.status === 'completed') {
      return res.status(200).json({
        status: 'success',
        message: 'Payment was already processed successfully'
      });
    }

    purchase.status = 'completed';
    purchase.paymentId = paymentId;
    await purchase.save();

    // Credit wallets
    const quillWallet = await EconomyService.getQuillWallet(userId);
    quillWallet.premiumQuills += purchase.premiumQuillsAwarded;
    await quillWallet.save();

    if (purchase.gemsAwarded > 0) {
      // Bonus gems bypass cap since they are purchased
      await EconomyService.addGems(userId, purchase.gemsAwarded, 'premium_purchase_bonus', true);
    }

    // Log purchase transaction log
    const txData = {
      user: userId,
      amount: purchase.premiumQuillsAwarded,
      currency: 'premium_quill',
      type: 'purchase_completed',
      source: 'shop_pack',
      referenceId: orderId,
      description: `Bought ${purchase.premiumQuillsAwarded} Premium Quills`
    };

    if (connectDB.isDbOffline()) {
      await mockTransactionRepo.create(txData);
    } else {
      await Transaction.create(txData);
    }

    res.status(200).json({
      status: 'success',
      data: {
        premiumQuills: quillWallet.premiumQuills,
        gemsAwarded: purchase.gemsAwarded
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get virtual economy analytics
 * @route   GET /api/v1/economy/analytics
 * @access  Private
 */
const getAnalytics = async (req, res, next) => {
  try {
    let allTx;
    if (connectDB.isDbOffline()) {
      allTx = [...mockTransactions];
    } else {
      allTx = await Transaction.find({});
    }

    const totalGemsGenerated = allTx
      .filter(t => t.currency === 'gem' && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalGemsSpent = allTx
      .filter(t => t.currency === 'gem' && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalQuillsSent = allTx
      .filter(t => t.currency === 'quill' && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalPremiumQuillsSent = allTx
      .filter(t => t.currency === 'premium_quill' && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Calculate top purchased spend items (badges, themes, boosts)
    const purchases = allTx.filter(t => t.type === 'gems_spent');
    const spendCounts = {};
    purchases.forEach(p => {
      const key = p.source || 'unknown';
      spendCounts[key] = (spendCounts[key] || 0) + 1;
    });

    let topSpendItem = 'none';
    let maxCount = 0;
    Object.keys(spendCounts).forEach(k => {
      if (spendCounts[k] > maxCount) {
        maxCount = spendCounts[k];
        topSpendItem = k;
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        totalGemsGenerated,
        totalGemsSpent,
        totalQuillsSent,
        totalPremiumQuillsSent,
        topSpendItem
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
