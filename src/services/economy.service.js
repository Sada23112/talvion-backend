const connectDB = require('../config/db');

// Mongoose Models
const QuillWallet = require('../models/quillWallet.model');
const GemWallet = require('../models/gemWallet.model');
const Transaction = require('../models/transaction.model');
const TaskCompletion = require('../models/taskCompletion.model');
const PremiumPurchase = require('../models/premiumPurchase.model');
const Creation = require('../models/creation.model');
const User = require('../models/user.model');
const NotificationService = require('./notification.service');

// Mock Repositories
const {
  mockQuillWalletRepo,
  mockGemWalletRepo,
  mockTransactionRepo,
  mockTaskCompletionRepo,
  mockPremiumPurchaseRepo,
  mockCreationRepo,
  mockUserRepo,
  mockUsers,
  mockCreations,
  mockTransactions
} = require('../models/mock.db');

class EconomyService {
  // ── HELPER: GET REPOS/MODELS DYNAMICALLY ─────────────────────────
  static _isOffline() {
    return connectDB.isDbOffline();
  }

  // ── WALLET RETRIEVAL & INITIALIZATION ────────────────────────────
  static async getQuillWallet(userId) {
    if (this._isOffline()) {
      return await mockQuillWalletRepo.findOne({ user: userId });
    } else {
      let wallet = await QuillWallet.findOne({ user: userId });
      if (!wallet) {
        wallet = await QuillWallet.create({ user: userId, quills: 24, premiumQuills: 0 });
      }
      return wallet;
    }
  }

  static async getGemWallet(userId) {
    if (this._isOffline()) {
      return await mockGemWalletRepo.findOne({ user: userId });
    } else {
      let wallet = await GemWallet.findOne({ user: userId });
      if (!wallet) {
        wallet = await GemWallet.create({
          user: userId,
          gems: 138,
          dailyGemsEarned: 0,
          lastResetDate: null,
          purchasedBadges: [],
          purchasedThemes: []
        });
      }
      return wallet;
    }
  }

  // ── DAILY GEMS CAP SYSTEM ────────────────────────────────────────
  static getDailyGemsCap(stars) {
    if (stars >= 1000) return Infinity; // Legend: No cap
    if (stars >= 600)  return 50;       // Diamond
    if (stars >= 300)  return 35;       // Gold
    if (stars >= 100)  return 20;       // Silver
    return 10;                         // Bronze (0-100 stars)
  }

  /**
   * Reset user's daily cap if day has changed
   */
  static _checkAndResetDailyCap(wallet) {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastResetStr = wallet.lastResetDate
      ? new Date(wallet.lastResetDate).toISOString().split('T')[0]
      : '';

    if (todayStr !== lastResetStr) {
      wallet.dailyGemsEarned = 0;
      wallet.lastResetDate = new Date();
    }
  }

  /**
   * Add gems to a user atomically, respecting their daily earning caps
   */
  static async addGems(userId, amount, source, bypassCap = false) {
    if (amount <= 0) return 0;
    
    // Get user to check star rating
    let user;
    if (this._isOffline()) {
      user = mockUsers.find(u => u._id === userId.toString());
    } else {
      user = await User.findById(userId);
    }

    const totalStars = user ? (user.totalStars || 0) : 0;
    const dailyCap = this.getDailyGemsCap(totalStars);

    const wallet = await this.getGemWallet(userId);
    this._checkAndResetDailyCap(wallet);

    let gemsToAdd = amount;
    if (!bypassCap && dailyCap !== Infinity) {
      const remainingLimit = Math.max(0, dailyCap - wallet.dailyGemsEarned);
      gemsToAdd = Math.min(amount, remainingLimit);
    }

    if (gemsToAdd > 0) {
      wallet.gems += gemsToAdd;
      if (!bypassCap) {
        wallet.dailyGemsEarned += gemsToAdd;
      }
      await wallet.save();

      // Log transaction
      if (this._isOffline()) {
        await mockTransactionRepo.create({
          user: userId,
          amount: gemsToAdd,
          currency: 'gem',
          type: 'gems_earned',
          source,
          description: `Gems earned from ${source}`
        });
      } else {
        await Transaction.create({
          user: userId,
          amount: gemsToAdd,
          currency: 'gem',
          type: 'gems_earned',
          source,
          description: `Gems earned from ${source}`
        });
      }
    }

    return gemsToAdd;
  }

  // ── QUILL SENDING (TIPPING) ──────────────────────────────────────
  static async sendQuill(senderId, creationId, amount, isPremium = false) {
    if (amount <= 0 || amount > 3) {
      throw new Error('You can only send 1 to 3 quills at a time');
    }

    // Check if creation exists
    let creation;
    if (this._isOffline()) {
      creation = mockCreations.find(c => c._id === creationId);
    } else {
      creation = await Creation.findById(creationId).populate('creator');
    }

    if (!creation) {
      throw new Error('Creation not found');
    }

    const creatorId = creation.creator._id || creation.creator;
    if (creatorId.toString() === senderId.toString()) {
      throw new Error('You cannot support your own creation');
    }

    // Verify sender balance
    const senderQuillWallet = await this.getQuillWallet(senderId);
    if (isPremium) {
      if (senderQuillWallet.premiumQuills < amount) {
        throw new Error('Insufficient premium quills balance');
      }
      senderQuillWallet.premiumQuills -= amount;
    } else {
      if (senderQuillWallet.quills < amount) {
        throw new Error('Insufficient quills balance');
      }
      senderQuillWallet.quills -= amount;
    }
    await senderQuillWallet.save();

    // Log sender spending transaction
    if (this._isOffline()) {
      await mockTransactionRepo.create({
        user: senderId,
        amount: -amount,
        currency: isPremium ? 'premium_quill' : 'quill',
        type: isPremium ? 'premium_quill_sent' : 'quill_sent',
        source: 'tip',
        referenceId: creationId,
        description: `Sent ${amount} ${isPremium ? 'premium ' : ''}quill(s) to support post`
      });
    } else {
      await Transaction.create({
        user: senderId,
        amount: -amount,
        currency: isPremium ? 'premium_quill' : 'quill',
        type: isPremium ? 'premium_quill_sent' : 'quill_sent',
        source: 'tip',
        referenceId: creationId,
        description: `Sent ${amount} ${isPremium ? 'premium ' : ''}quill(s) to support post`
      });
    }

    // Sender reward gems (regular: 1 gem, premium: 2.5 gems per quill)
    const senderGemReward = isPremium ? amount * 2.5 : amount * 1.0;
    const actualSenderGems = await this.addGems(senderId, senderGemReward, 'quill_tip_sender');

    // Recipient artist rewards
    let actualRecipientGems = 0;
    const isJoint = creation.isJoint === true || creation.isJoint === 'true';

    if (isJoint) {
      // Collaboration Post: Every collaborator (creator + mentions) receives gems
      const collabIds = [creatorId, ...(creation.mentions || [])];
      const collabGemsPerQuill = isPremium ? 5 : 3;
      const totalReward = amount * collabGemsPerQuill;

      for (const collabId of collabIds) {
        const added = await this.addGems(collabId, totalReward, 'quill_tip_recipient_collab');
        if (collabId.toString() === creatorId.toString()) {
          actualRecipientGems = added; // track for return payload
        }
      }
    } else {
      // Solo Post: Creator receives gems (regular: 2, premium: 4)
      const soloGemsPerQuill = isPremium ? 4 : 2;
      const totalReward = amount * soloGemsPerQuill;
      actualRecipientGems = await this.addGems(creatorId, totalReward, 'quill_tip_recipient_solo');
    }

    // Trigger tip notification
    await NotificationService.createNotification(senderId, creatorId, 'tip', creationId);

    return {
      success: true,
      senderGems: actualSenderGems,
      artistGems: actualRecipientGems
    };
  }

  // ── AD SUPPORT SYSTEM ────────────────────────────────────────────
  static async watchAdSupport(viewerId, creationId) {
    // 30s Cooldown and 5 ads limit daily verification
    const todayStr = new Date().toISOString().split('T')[0];
    let userAdsToday;

    if (this._isOffline()) {
      // Simple mock cooldown bypass / limit check
      userAdsToday = mockTransactions.filter(
        t => t.user === viewerId && t.type === 'ad_reward' && t.createdAt >= new Date(todayStr)
      );
    } else {
      userAdsToday = await Transaction.find({
        user: viewerId,
        type: 'ad_reward',
        timestamp: { $gte: new Date(todayStr) }
      });
    }

    if (userAdsToday.length >= 5) {
      throw new Error('Daily support ad limits reached (Max 5/day)');
    }

    // Cooldown verification (30s)
    if (userAdsToday.length > 0) {
      const lastAdTime = new Date(userAdsToday[0].timestamp || userAdsToday[0].createdAt).getTime();
      if (Date.now() - lastAdTime < 30000) {
        throw new Error('Please wait 30 seconds before supporting again');
      }
    }

    // Viewer receives 1 quill
    const viewerQuillWallet = await this.getQuillWallet(viewerId);
    viewerQuillWallet.quills += 1;
    await viewerQuillWallet.save();

    // Log viewer quill transaction
    if (this._isOffline()) {
      await mockTransactionRepo.create({
        user: viewerId,
        amount: 1,
        currency: 'quill',
        type: 'ad_reward',
        source: 'ad_support',
        referenceId: creationId,
        description: 'Earned 1 quill from watching support ad'
      });
    } else {
      await Transaction.create({
        user: viewerId,
        amount: 1,
        currency: 'quill',
        type: 'ad_reward',
        source: 'ad_support',
        referenceId: creationId,
        description: 'Earned 1 quill from watching support ad'
      });
    }

    // Recipient Artist receives 1 gem
    let artistGemsEarned = 0;
    if (creationId) {
      let creation;
      if (this._isOffline()) {
        creation = mockCreations.find(c => c._id === creationId);
      } else {
        creation = await Creation.findById(creationId);
      }

      if (creation) {
        const creatorId = creation.creator._id || creation.creator;
        artistGemsEarned = await this.addGems(creatorId, 1, 'support_ad_artist');
      }
    }

    return {
      success: true,
      quillsEarned: 1,
      artistGemsEarned
    };
  }

  // ── DAILY TASKS CLAIMING ─────────────────────────────────────────
  static async claimTaskReward(userId, taskId) {
    // Validate taskId exists in the preset
    const taskDetails = {
      post_today: { reward: 1, title: 'Post something today' },
      like_5: { reward: 1, title: 'Like 5 posts' },
      comment_3: { reward: 1, title: 'Comment on 3 posts' },
      explore_10: { reward: 1, title: 'Explore 10 posts' },
      send_collab: { reward: 2, title: 'Send a collab request' },
      watch_ad: { reward: 2, title: 'Watch an ad to earn' },
      bookmark_3: { reward: 1, title: 'Bookmark 3 posts' },
      share_post: { reward: 1, title: 'Share a post' },
      profile_update: { reward: 1, title: 'Update bio or profile' },
      read_15m: { reward: 2, title: 'Read for 15 minutes' }
    };

    const task = taskDetails[taskId];
    if (!task) {
      throw new Error('Invalid task ID');
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Check if already claimed today
    let completion;
    if (this._isOffline()) {
      completion = await mockTaskCompletionRepo.findOne({
        user: userId,
        taskId,
        dateString: todayStr
      });
    } else {
      completion = await TaskCompletion.findOne({
        user: userId,
        taskId,
        dateString: todayStr
      });
    }

    if (completion) {
      throw new Error('Task reward has already been claimed today');
    }

    // Award rewards: 0.5 gems (subject to cap) + quills reward
    const actualGems = await this.addGems(userId, 0.5, `task_${taskId}`);

    const quillWallet = await this.getQuillWallet(userId);
    quillWallet.quills += task.reward;
    await quillWallet.save();

    // Log quill transaction
    if (this._isOffline()) {
      await mockTaskCompletionRepo.create({
        user: userId,
        taskId,
        dateString: todayStr
      });

      await mockTransactionRepo.create({
        user: userId,
        amount: task.reward,
        currency: 'quill',
        type: 'daily_task_reward',
        source: 'daily_task',
        referenceId: taskId,
        description: `Claimed ${task.reward} quill(s) for task: ${task.title}`
      });
    } else {
      await TaskCompletion.create({
        user: userId,
        taskId,
        dateString: todayStr
      });

      await Transaction.create({
        user: userId,
        amount: task.reward,
        currency: 'quill',
        type: 'daily_task_reward',
        source: 'daily_task',
        referenceId: taskId,
        description: `Claimed ${task.reward} quill(s) for task: ${task.title}`
      });
    }

    return {
      success: true,
      quillsEarned: task.reward,
      gemsEarned: actualGems
    };
  }

  // ── GEM SPENDING & REFUNDS ───────────────────────────────────────
  static async spendGems(userId, itemType, itemCost, referenceId = '') {
    if (itemCost <= 0) return true;

    const wallet = await this.getGemWallet(userId);
    if (wallet.gems < itemCost) {
      throw new Error(`Insufficient gems balance. Requires ${itemCost} gems.`);
    }

    wallet.gems -= itemCost;

    if (itemType === 'theme') {
      wallet.purchasedThemes.push(referenceId);
    } else if (itemType === 'badge') {
      wallet.purchasedBadges.push(referenceId);
    }

    await wallet.save();

    // Log gem deduction transaction
    if (this._isOffline()) {
      await mockTransactionRepo.create({
        user: userId,
        amount: -itemCost,
        currency: 'gem',
        type: 'gems_spent',
        source: itemType,
        referenceId,
        description: `Spent ${itemCost} gems on ${itemType}`
      });
    } else {
      await Transaction.create({
        user: userId,
        amount: -itemCost,
        currency: 'gem',
        type: 'gems_spent',
        source: itemType,
        referenceId,
        description: `Spent ${itemCost} gems on ${itemType}`
      });
    }

    return {
      success: true,
      remainingGems: wallet.gems
    };
  }

  static async refundGems(userId, referenceId, amount) {
    // Add gems back, bypassing the cap since it is a refund
    return await this.addGems(userId, amount, 'refund', true);
  }

  // ── EXTRA POST CHECKER ───────────────────────────────────────────
  static async chargeForExtraPost(userId) {
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(todayStr);

    let count = 0;
    if (this._isOffline()) {
      count = mockCreations.filter(
        c => c.creator === userId && c.status === 'published' && c.createdAt >= startOfDay
      ).length;
    } else {
      count = await Creation.countDocuments({
        creator: userId,
        status: 'published',
        createdAt: { $gte: startOfDay }
      });
    }

    // If already posted today, deduct 12 gems
    if (count >= 1) {
      await this.spendGems(userId, 'extra_post', 12, todayStr);
      return { charged: true, cost: 12 };
    }

    return { charged: false, cost: 0 };
  }
}

module.exports = EconomyService;
