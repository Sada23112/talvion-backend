const mongoose = require('mongoose');
const User = require('../models/user.model');
const AuditLog = require('../models/auditLog.model');
const Transaction = require('../models/transaction.model');
const PremiumPurchase = require('../models/premiumPurchase.model');
const Creation = require('../models/creation.model');
const connectDB = require('../config/db');
const { 
  mockUsers, 
  mockUserRepo, 
  mockAuditLogRepo,
  mockTransactions,
  mockPremiumPurchases,
  mockCreations,
  mockAuditLogs,
  mockQuillWallets,
  mockGemWallets,
  mockTransactionRepo,
  mockPremiumPurchaseRepo,
  mockNotifications,
  mockQuillWalletRepo,
  mockGemWalletRepo
} = require('../models/mock.db');

/**
 * Log an administrative action to the AuditLog database
 */
const logAdminAction = async ({
  adminId,
  actionType,
  targetModel,
  targetId,
  description,
  previousState,
  newState,
  ipAddress
}, options = {}) => {
  const { session, throwOnError = false } = options;
  try {
    const logData = {
      admin: adminId,
      actionType,
      targetModel,
      targetId: targetId.toString(),
      description,
      previousState: previousState ? JSON.parse(JSON.stringify(previousState)) : null,
      newState: newState ? JSON.parse(JSON.stringify(newState)) : null,
      ipAddress: ipAddress || ''
    };

    if (connectDB.isDbOffline()) {
      await mockAuditLogRepo.create(logData);
    } else {
      if (session) {
        await AuditLog.create([logData], { session });
      } else {
        await AuditLog.create(logData);
      }
    }
  } catch (err) {
    console.error('Failed to log admin audit action:', err);
    if (throwOnError) {
      throw err;
    }
  }
};

/**
 * Fetch list of users with pagination, filters, and search
 */
const getUsers = async ({ search, role, status, isVerified, page = 1, limit = 10 }) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  if (connectDB.isDbOffline()) {
    let list = [...mockUsers];

    // Search query matching
    if (search) {
      const searchLower = search.toLowerCase().trim();
      list = list.filter(u => 
        u._id.toLowerCase().includes(searchLower) ||
        (u.fullName && u.fullName.toLowerCase().includes(searchLower)) ||
        (u.username && u.username.toLowerCase().includes(searchLower)) ||
        (u.email && u.email.toLowerCase().includes(searchLower))
      );
    }

    // Role filter
    if (role) {
      list = list.filter(u => u.role === role);
    }

    // Status filter
    if (status) {
      list = list.filter(u => u.status === status);
    }

    // Verification filter
    if (isVerified !== undefined) {
      const verifyBool = isVerified === 'true' || isVerified === true;
      list = list.filter(u => u.isVerified === verifyBool);
    }

    const total = list.length;
    const paginated = list.slice(skip, skip + limitNum);
    const pages = Math.ceil(total / limitNum);

    // Return Mongoose-like format
    const usersFormatted = paginated.map(u => ({
      _id: u._id,
      fullName: u.fullName,
      email: u.email,
      username: u.username,
      role: u.role,
      status: u.status,
      isVerified: u.isVerified,
      walletBalance: u.walletBalance,
      totalStars: u.totalStars,
      createdAt: u.createdAt
    }));

    return {
      users: usersFormatted,
      total,
      page: pageNum,
      pages
    };
  } else {
    // Live Mongoose query building
    const query = {};

    if (search) {
      const isObjectId = mongoose.Types.ObjectId.isValid(search);
      if (isObjectId) {
        query._id = search;
      } else {
        const regex = new RegExp(search, 'i');
        query.$or = [
          { fullName: regex },
          { username: regex },
          { email: regex }
        ];
      }
    }

    if (role) {
      query.role = role;
    }

    if (status) {
      query.status = status;
    }

    if (isVerified !== undefined) {
      query.isVerified = isVerified === 'true' || isVerified === true;
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const pages = Math.ceil(total / limitNum);

    return {
      users,
      total,
      page: pageNum,
      pages
    };
  }
};

/**
 * Fetch detailed user details
 */
const getUserById = async (id) => {
  if (connectDB.isDbOffline()) {
    const user = mockUsers.find(u => u._id === id);
    if (!user) return null;

    // Remove password hash from returned user object
    const { password, ...safeUser } = user;
    return safeUser;
  } else {
    return await User.findById(id).select('-password');
  }
};

/**
 * Update user status (suspend, ban, restore)
 */
const updateUserStatus = async (userId, { status, reason, until }, performerId, ipAddress) => {
  let user;
  let previousState;

  if (connectDB.isDbOffline()) {
    user = mockUsers.find(u => u._id === userId);
    if (!user) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { status: user.status, statusReason: user.statusReason, statusUntil: user.statusUntil };
  } else {
    user = await User.findById(userId);
    if (!user) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { status: user.status, statusReason: user.statusReason, statusUntil: user.statusUntil };
  }

  // Super Admin protection rule 1: A Super Admin cannot ban/suspend themselves
  if (user._id.toString() === performerId.toString()) {
    const err = new Error('Security violation: Administrative users cannot ban or suspend their own accounts.');
    err.statusCode = 400;
    throw err;
  }

  // Super Admin protection rule 2: Banning or demoting the last active Super Admin is prohibited
  if (user.role === 'super_admin' && status !== 'active') {
    let superAdminCount = 0;
    if (connectDB.isDbOffline()) {
      superAdminCount = mockUsers.filter(u => u.role === 'super_admin' && u.status === 'active').length;
    } else {
      superAdminCount = await User.countDocuments({ role: 'super_admin', status: 'active' });
    }

    if (superAdminCount <= 1) {
      const err = new Error('Action blocked: Cannot suspend or ban the final remaining active Super Admin in the system.');
      err.statusCode = 400;
      throw err;
    }
  }

  const updates = {
    status,
    statusReason: reason || '',
    statusUntil: status === 'suspended' && until ? new Date(until) : null
  };

  let updatedUser;
  if (connectDB.isDbOffline()) {
    const wrapped = mockUserRepo._wrapUser(user);
    wrapped.status = updates.status;
    wrapped.statusReason = updates.statusReason;
    wrapped.statusUntil = updates.statusUntil;
    await wrapped.save();
    
    // Revoke mock session keys
    const { mockUserSessions } = require('../models/mock.db');
    const userSessions = mockUserSessions.filter(s => s.user === userId);
    userSessions.forEach(s => s.isRevoked = true);
    
    updatedUser = await getUserById(userId);
  } else {
    updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-password');
    
    // Revoke sessions inside live database
    const UserSession = require('../models/userSession.model');
    await UserSession.updateMany({ user: userId }, { isRevoked: true });
  }

  // Audit log action
  await logAdminAction({
    adminId: performerId,
    actionType: `${status}_user`,
    targetModel: 'User',
    targetId: userId,
    description: `User status changed to '${status}'. Reason: ${reason || 'None'}. Until: ${until || 'Indefinite'}.`,
    previousState,
    newState: updates,
    ipAddress
  });

  return updatedUser;
};

/**
 * Toggle verification badge status of a creator
 */
const toggleUserVerification = async (userId, isVerified, performerId, ipAddress) => {
  let user;
  let previousState;

  if (connectDB.isDbOffline()) {
    user = mockUsers.find(u => u._id === userId);
    if (!user) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { isVerified: user.isVerified };
  } else {
    user = await User.findById(userId);
    if (!user) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { isVerified: user.isVerified };
  }

  const updates = { isVerified: isVerified === 'true' || isVerified === true };

  let updatedUser;
  if (connectDB.isDbOffline()) {
    const wrapped = mockUserRepo._wrapUser(user);
    wrapped.isVerified = updates.isVerified;
    await wrapped.save();
    updatedUser = await getUserById(userId);
  } else {
    updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-password');
  }

  // Audit log action
  await logAdminAction({
    adminId: performerId,
    actionType: updates.isVerified ? 'verify_user' : 'unverify_user',
    targetModel: 'User',
    targetId: userId,
    description: `User verification status changed to ${updates.isVerified}.`,
    previousState,
    newState: updates,
    ipAddress
  });

  return updatedUser;
};

/**
 * Add / Update moderation notes on a user
 */
const addUserNote = async (userId, notes, performerId, ipAddress) => {
  let user;
  let previousState;

  if (connectDB.isDbOffline()) {
    user = mockUsers.find(u => u._id === userId);
    if (!user) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { moderationNotes: user.moderationNotes };
  } else {
    user = await User.findById(userId);
    if (!user) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { moderationNotes: user.moderationNotes };
  }

  let updatedUser;
  if (connectDB.isDbOffline()) {
    const wrapped = mockUserRepo._wrapUser(user);
    wrapped.moderationNotes = notes || '';
    await wrapped.save();
    updatedUser = await getUserById(userId);
  } else {
    updatedUser = await User.findByIdAndUpdate(
      userId, 
      { moderationNotes: notes || '' }, 
      { new: true }
    ).select('-password');
  }

  // Audit log note addition
  await logAdminAction({
    adminId: performerId,
    actionType: 'update_moderation_notes',
    targetModel: 'User',
    targetId: userId,
    description: 'Updated moderation notes.',
    previousState,
    newState: { moderationNotes: notes || '' },
    ipAddress
  });

  return updatedUser;
};

/**
 * Fetch creations list with pagination, search, and category/featured filters
 */
const getCreations = async ({ search, category, isFeatured, status, dateRange, page = 1, limit = 10 }) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  if (connectDB.isDbOffline()) {
    const { mockCreationRepo } = require('../models/mock.db');
    let creations = await mockCreationRepo.find({
      search,
      category,
      isFeatured,
      status: status || 'all'
    });

    if (dateRange) {
      const now = new Date();
      if (dateRange === 'today') {
        const todayStart = new Date(now.setHours(0,0,0,0));
        creations = creations.filter(c => new Date(c.createdAt) >= todayStart);
      } else if (dateRange === 'week') {
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        creations = creations.filter(c => new Date(c.createdAt) >= weekAgo);
      } else if (dateRange === 'month') {
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
        creations = creations.filter(c => new Date(c.createdAt) >= monthAgo);
      }
    }

    const total = creations.length;
    const paginated = creations.slice(skip, skip + limitNum);
    const pages = Math.ceil(total / limitNum);

    return {
      creations: paginated,
      total,
      page: pageNum,
      pages
    };
  } else {
    const Creation = require('../models/creation.model');
    const query = {};

    if (category) {
      query.category = category;
    }

    if (isFeatured !== undefined) {
      query.isFeatured = isFeatured === 'true' || isFeatured === true;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (dateRange) {
      const now = new Date();
      if (dateRange === 'today') {
        query.createdAt = { $gte: new Date(now.setHours(0,0,0,0)) };
      } else if (dateRange === 'week') {
        query.createdAt = { $gte: new Date(now.setDate(now.getDate() - 7)) };
      } else if (dateRange === 'month') {
        query.createdAt = { $gte: new Date(now.setMonth(now.getMonth() - 1)) };
      }
    }

    if (search) {
      const isObjectId = mongoose.Types.ObjectId.isValid(search);
      if (isObjectId) {
        query._id = search;
      } else {
        const regex = new RegExp(search, 'i');
        query.title = regex;
      }
    }

    const total = await Creation.countDocuments(query);
    const creations = await Creation.find(query)
      .populate('creator', 'fullName username email totalStars')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const pages = Math.ceil(total / limitNum);

    return {
      creations,
      total,
      page: pageNum,
      pages
    };
  }
};

/**
 * Get single creation by ID
 */
const getCreationById = async (id) => {
  if (connectDB.isDbOffline()) {
    const { mockCreationRepo } = require('../models/mock.db');
    return await mockCreationRepo.findById(id);
  } else {
    const Creation = require('../models/creation.model');
    return await Creation.findById(id).populate('creator', 'fullName username email totalStars');
  }
};

/**
 * Update creation status (draft/hidden, published)
 */
const updateCreationStatus = async (id, status, performerId, ipAddress) => {
  let previousState;
  let updated;

  if (connectDB.isDbOffline()) {
    const { mockCreationRepo } = require('../models/mock.db');
    const creation = await mockCreationRepo.findById(id);
    if (!creation) {
      const err = new Error('Creation not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { status: creation.status };
    updated = await mockCreationRepo.findByIdAndUpdate(id, { status });
  } else {
    const Creation = require('../models/creation.model');
    const creation = await Creation.findById(id);
    if (!creation) {
      const err = new Error('Creation not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { status: creation.status };
    updated = await Creation.findByIdAndUpdate(id, { status }, { new: true }).populate('creator', 'fullName username email totalStars');
  }

  await logAdminAction({
    adminId: performerId,
    actionType: status === 'published' ? 'restore_creation' : 'hide_creation',
    targetModel: 'Creation',
    targetId: id,
    description: `Creation status changed to '${status}'.`,
    previousState,
    newState: { status },
    ipAddress
  });

  return updated;
};

/**
 * Toggle featured banner flag of a creation
 */
const toggleCreationFeatured = async (id, isFeatured, performerId, ipAddress) => {
  let previousState;
  let updated;
  const isFeatBool = isFeatured === 'true' || isFeatured === true;

  if (connectDB.isDbOffline()) {
    const { mockCreationRepo } = require('../models/mock.db');
    const creation = await mockCreationRepo.findById(id);
    if (!creation) {
      const err = new Error('Creation not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { isFeatured: creation.isFeatured || false };
    updated = await mockCreationRepo.findByIdAndUpdate(id, { isFeatured: isFeatBool });
  } else {
    const Creation = require('../models/creation.model');
    const creation = await Creation.findById(id);
    if (!creation) {
      const err = new Error('Creation not found.');
      err.statusCode = 404;
      throw err;
    }
    previousState = { isFeatured: creation.isFeatured || false };
    updated = await Creation.findByIdAndUpdate(id, { isFeatured: isFeatBool }, { new: true }).populate('creator', 'fullName username email totalStars');
  }

  await logAdminAction({
    adminId: performerId,
    actionType: isFeatBool ? 'feature_creation' : 'unfeature_creation',
    targetModel: 'Creation',
    targetId: id,
    description: `Creation featured status set to ${isFeatBool}.`,
    previousState,
    newState: { isFeatured: isFeatBool },
    ipAddress
  });

  return updated;
};

/**
 * Delete a creation permanently
 */
const deleteCreation = async (id, performerId, ipAddress) => {
  let previousState;
  let creatorId;

  if (connectDB.isDbOffline()) {
    const { mockCreationRepo } = require('../models/mock.db');
    const creation = await mockCreationRepo.findById(id);
    if (!creation) {
      const err = new Error('Creation not found.');
      err.statusCode = 404;
      throw err;
    }
    creatorId = creation.creator && creation.creator._id ? creation.creator._id : creation.creator;
    previousState = { deleted: true, title: creation.title };
    await mockCreationRepo.findByIdAndDelete(id);
  } else {
    const Creation = require('../models/creation.model');
    const creation = await Creation.findById(id);
    if (!creation) {
      const err = new Error('Creation not found.');
      err.statusCode = 404;
      throw err;
    }
    creatorId = creation.creator;
    previousState = { deleted: true, title: creation.title };
    await Creation.findByIdAndDelete(id);
  }

  // Recalculate reputation stars
  const { updateCreatorStars } = require('../utils/reputation');
  await updateCreatorStars(creatorId);

  await logAdminAction({
    adminId: performerId,
    actionType: 'delete_creation',
    targetModel: 'Creation',
    targetId: id,
    description: 'Permanently deleted creation from database.',
    previousState,
    newState: { deleted: true },
    ipAddress
  });

  return { id, success: true };
};

/**
 * Fetch reports with pagination, filters, and search
 */
const getReports = async ({ search, status, escalated, assignedTo, page = 1, limit = 10 }) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  if (connectDB.isDbOffline()) {
    const { mockReportRepo } = require('../models/mock.db');
    let list = await mockReportRepo.find({ status, escalated, assignedTo });

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r => 
        (r.description && r.description.toLowerCase().includes(s)) ||
        (r.reason && r.reason.toLowerCase().includes(s)) ||
        (r.user && r.user.fullName && r.user.fullName.toLowerCase().includes(s)) ||
        (r.user && r.user.username && r.user.username.toLowerCase().includes(s))
      );
    }

    const total = list.length;
    const paginated = list.slice(skip, skip + limitNum);
    const pages = Math.ceil(total / limitNum);

    return {
      reports: paginated,
      total,
      page: pageNum,
      pages
    };
  } else {
    const Report = require('../models/report.model');
    const query = {};

    if (status) query.status = status;
    if (escalated !== undefined) query.escalated = escalated === 'true' || escalated === true;
    if (assignedTo === 'none') query.assignedTo = null;
    else if (assignedTo) query.assignedTo = assignedTo;

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { description: regex },
        { reason: regex }
      ];
    }

    const total = await Report.countDocuments(query);
    const reports = await Report.find(query)
      .populate('user', 'fullName username email avatarUrl')
      .populate('assignedTo', 'fullName username email')
      .populate('resolvedBy', 'fullName username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const pages = Math.ceil(total / limitNum);

    return {
      reports,
      total,
      page: pageNum,
      pages
    };
  }
};

/**
 * Fetch report by ID
 */
const getReportById = async (id) => {
  if (connectDB.isDbOffline()) {
    const { mockReportRepo } = require('../models/mock.db');
    return await mockReportRepo.findById(id);
  } else {
    const Report = require('../models/report.model');
    return await Report.findById(id)
      .populate('user', 'fullName username email avatarUrl')
      .populate('assignedTo', 'fullName username email')
      .populate('resolvedBy', 'fullName username email')
      .populate('history.performedBy', 'fullName username email');
  }
};

/**
 * Get detailed Workspace information for a report
 */
const getReportWorkspaceDetails = async (reportId) => {
  const report = await getReportById(reportId);
  if (!report) return null;

  const reporterId = report.user && report.user._id ? report.user._id : report.user;

  // 1. Get reporter reports count
  let previousReportsCount = 0;
  if (connectDB.isDbOffline()) {
    const { mockReports } = require('../models/mock.db');
    previousReportsCount = mockReports.filter(r => {
      const rUserId = r.user && r.user._id ? r.user._id : r.user;
      return rUserId.toString() === reporterId.toString();
    }).length;
  } else {
    const Report = require('../models/report.model');
    previousReportsCount = await Report.countDocuments({ user: reporterId });
  }

  // 2. Fetch target content and identify the reported user
  let targetContent = null;
  let reportedUserId = null;

  const targetType = report.targetType;
  const targetId = report.targetId;

  if (targetId) {
    if (connectDB.isDbOffline()) {
      if (targetType === 'creation') {
        const { mockCreationRepo } = require('../models/mock.db');
        targetContent = await mockCreationRepo.findById(targetId);
        if (targetContent) {
          reportedUserId = targetContent.creator && targetContent.creator._id ? targetContent.creator._id : targetContent.creator;
        }
      } else if (targetType === 'user') {
        targetContent = mockUsers.find(u => u._id === targetId.toString());
        reportedUserId = targetId;
      } else if (targetType === 'comment') {
        const { mockComments } = require('../models/mock.db');
        targetContent = mockComments.find(c => c._id === targetId.toString());
        if (targetContent) {
          reportedUserId = targetContent.user && targetContent.user._id ? targetContent.user._id : targetContent.user;
        }
      } else if (targetType === 'message') {
        const { mockMessages } = require('../models/mock.db');
        targetContent = mockMessages.find(m => m._id === targetId.toString());
        if (targetContent) {
          reportedUserId = targetContent.sender;
        }
      }
    } else {
      if (targetType === 'creation') {
        const Creation = require('../models/creation.model');
        targetContent = await Creation.findById(targetId).populate('creator', 'fullName username email totalStars isVerified role status avatarUrl');
        if (targetContent) {
          reportedUserId = targetContent.creator && targetContent.creator._id ? targetContent.creator._id : targetContent.creator;
        }
      } else if (targetType === 'user') {
        const User = require('../models/user.model');
        targetContent = await User.findById(targetId).select('-password');
        reportedUserId = targetId;
      } else if (targetType === 'comment') {
        const Comment = require('../models/comment.model');
        targetContent = await Comment.findById(targetId).populate('user', 'fullName username email role status');
        if (targetContent) {
          reportedUserId = targetContent.user && targetContent.user._id ? targetContent.user._id : targetContent.user;
        }
      } else if (targetType === 'message') {
        const Message = require('../models/message.model');
        targetContent = await Message.findById(targetId);
        if (targetContent) {
          reportedUserId = targetContent.sender;
        }
      }
    }
  }

  // If reportedUserId is resolved, get stats for this user
  let reportedUser = null;
  let reportedUserStats = {
    previousWarnings: 0,
    previousSuspensions: 0,
    previousBans: 0,
    moderationHistory: []
  };

  if (reportedUserId) {
    if (connectDB.isDbOffline()) {
      reportedUser = mockUsers.find(u => u._id === reportedUserId.toString());
      if (reportedUser) {
        const { password, ...safeUser } = reportedUser;
        reportedUser = safeUser;
      }
      
      const { mockAuditLogs } = require('../models/mock.db');
      const audits = mockAuditLogs.filter(a => a.targetId === reportedUserId.toString());
      reportedUserStats.previousWarnings = audits.filter(a => a.actionType === 'warn_user').length;
      reportedUserStats.previousSuspensions = audits.filter(a => a.actionType === 'suspend_user').length;
      reportedUserStats.previousBans = audits.filter(a => a.actionType === 'ban_user').length;
      reportedUserStats.moderationHistory = audits.map(a => {
        const adminObj = mockUsers.find(u => u._id === a.admin.toString()) || { fullName: 'Admin' };
        return {
          action: a.actionType,
          performedBy: adminObj.fullName,
          timestamp: a.createdAt,
          description: a.description
        };
      });
    } else {
      const User = require('../models/user.model');
      reportedUser = await User.findById(reportedUserId).select('-password');
      
      const AuditLog = require('../models/auditLog.model');
      const audits = await AuditLog.find({ targetId: reportedUserId.toString() }).populate('admin', 'fullName');
      reportedUserStats.previousWarnings = audits.filter(a => a.actionType === 'warn_user').length;
      reportedUserStats.previousSuspensions = audits.filter(a => a.actionType === 'suspend_user').length;
      reportedUserStats.previousBans = audits.filter(a => a.actionType === 'ban_user').length;
      reportedUserStats.moderationHistory = audits.map(a => ({
        action: a.actionType,
        performedBy: a.admin ? a.admin.fullName : 'Admin',
        timestamp: a.createdAt,
        description: a.description
      }));
    }
  }

  return {
    report,
    reporterStats: {
      previousReportsCount
    },
    reportedUser,
    reportedUserStats,
    targetContent
  };
};

/**
 * Assign report to a moderator
 */
const assignReport = async (reportId, assignedTo, performerId, ipAddress) => {
  let updated;
  const historyEntry = {
    action: 'assign',
    performedBy: performerId,
    timestamp: new Date(),
    notes: `Report assigned to administrative user ID: ${assignedTo || 'none'}`
  };

  if (connectDB.isDbOffline()) {
    const { mockReportRepo } = require('../models/mock.db');
    updated = await mockReportRepo.findByIdAndUpdate(reportId, {
      assignedTo: assignedTo || null,
      $push: { history: historyEntry }
    });
    if (updated) {
      if (!updated.history) updated.history = [];
      updated.history.push({
        ...historyEntry,
        performedBy: performerId.toString()
      });
    }
  } else {
    const Report = require('../models/report.model');
    updated = await Report.findByIdAndUpdate(
      reportId,
      {
        assignedTo: assignedTo || null,
        $push: { history: historyEntry }
      },
      { new: true }
    ).populate('user', 'fullName username email')
     .populate('assignedTo', 'fullName username email');
  }

  await logAdminAction({
    adminId: performerId,
    actionType: 'assign_report',
    targetModel: 'Report',
    targetId: reportId,
    description: `Report assigned to: ${assignedTo || 'none'}`,
    ipAddress
  });

  return updated;
};

/**
 * Escalate report to higher authority
 */
const escalateReport = async (reportId, notes, performerId, ipAddress) => {
  let updated;
  const historyEntry = {
    action: 'escalate',
    performedBy: performerId,
    timestamp: new Date(),
    notes: notes || 'Report escalated'
  };

  if (connectDB.isDbOffline()) {
    const { mockReportRepo } = require('../models/mock.db');
    updated = await mockReportRepo.findByIdAndUpdate(reportId, {
      escalated: true,
      $push: { history: historyEntry }
    });
    if (updated) {
      if (!updated.history) updated.history = [];
      updated.history.push({
        ...historyEntry,
        performedBy: performerId.toString()
      });
    }
  } else {
    const Report = require('../models/report.model');
    updated = await Report.findByIdAndUpdate(
      reportId,
      {
        escalated: true,
        $push: { history: historyEntry }
      },
      { new: true }
    ).populate('user', 'fullName username email')
     .populate('assignedTo', 'fullName username email');
  }

  await logAdminAction({
    adminId: performerId,
    actionType: 'escalate_report',
    targetModel: 'Report',
    targetId: reportId,
    description: `Report escalated. Notes: ${notes || 'None'}`,
    ipAddress
  });

  return updated;
};

/**
 * Resolve report and take actions (dismiss, hide content, warn, suspend, ban)
 */
const resolveReport = async (reportId, { action, notes, durationDays }, performerId, ipAddress) => {
  let report;
  if (connectDB.isDbOffline()) {
    const { mockReportRepo } = require('../models/mock.db');
    report = await mockReportRepo.findById(reportId);
  } else {
    const Report = require('../models/report.model');
    report = await Report.findById(reportId);
  }

  if (!report) {
    const err = new Error('Report not found.');
    err.statusCode = 404;
    throw err;
  }

  const targetType = report.targetType;
  const targetId = report.targetId;

  // Take action based on the resolution type
  if (action === 'hide_content' && targetId) {
    if (targetType === 'creation') {
      await updateCreationStatus(targetId, 'draft', performerId, ipAddress);
    } else if (targetType === 'comment') {
      if (connectDB.isDbOffline()) {
        const { mockComments } = require('../models/mock.db');
        const comment = mockComments.find(c => c._id === targetId.toString());
        if (comment) {
          comment.text = '[Content hidden by moderator]';
        }
      } else {
        const Comment = require('../models/comment.model');
        await Comment.findByIdAndUpdate(targetId, { text: '[Content hidden by moderator]' });
      }
    }
  } else if (action === 'restore_content' && targetId) {
    if (targetType === 'creation') {
      await updateCreationStatus(targetId, 'published', performerId, ipAddress);
    }
  } else if (action === 'warn_user' && targetId) {
    let reportedUserId = targetId;
    if (targetType === 'creation') {
      const c = await getCreationById(targetId);
      if (c) reportedUserId = c.creator && c.creator._id ? c.creator._id : c.creator;
    }
    await logAdminAction({
      adminId: performerId,
      actionType: 'warn_user',
      targetModel: 'User',
      targetId: reportedUserId,
      description: `User warned. Reason: ${notes || 'Violation of terms'}`,
      ipAddress
    });
  } else if (action === 'suspend_user' && targetId) {
    let reportedUserId = targetId;
    if (targetType === 'creation') {
      const c = await getCreationById(targetId);
      if (c) reportedUserId = c.creator && c.creator._id ? c.creator._id : c.creator;
    }
    const days = parseInt(durationDays, 10) || 7;
    const untilDate = new Date();
    untilDate.setDate(untilDate.getDate() + days);
    
    await updateUserStatus(reportedUserId, { status: 'suspended', reason: notes || 'Violation of terms', until: untilDate.toISOString() }, performerId, ipAddress);
  } else if (action === 'ban_user' && targetId) {
    let reportedUserId = targetId;
    if (targetType === 'creation') {
      const c = await getCreationById(targetId);
      if (c) reportedUserId = c.creator && c.creator._id ? c.creator._id : c.creator;
    }
    await updateUserStatus(reportedUserId, { status: 'banned', reason: notes || 'Violation of terms' }, performerId, ipAddress);
  }

  // Update Report Status to resolved
  const historyEntry = {
    action: 'resolve',
    performedBy: performerId,
    timestamp: new Date(),
    notes: `Report resolved via action: ${action}. Notes: ${notes || 'None'}`
  };

  let updatedReport;
  if (connectDB.isDbOffline()) {
    const { mockReportRepo } = require('../models/mock.db');
    updatedReport = await mockReportRepo.findByIdAndUpdate(reportId, {
      status: 'resolved',
      resolvedBy: performerId,
      $push: { history: historyEntry }
    });
    if (updatedReport) {
      updatedReport.status = 'resolved';
      updatedReport.resolvedBy = performerId.toString();
      if (!updatedReport.history) updatedReport.history = [];
      updatedReport.history.push({
        ...historyEntry,
        performedBy: performerId.toString()
      });
    }
  } else {
    const Report = require('../models/report.model');
    updatedReport = await Report.findByIdAndUpdate(
      reportId,
      {
        status: 'resolved',
        resolvedBy: performerId,
        $push: { history: historyEntry }
      },
      { new: true }
    ).populate('user', 'fullName username email')
     .populate('assignedTo', 'fullName username email')
     .populate('resolvedBy', 'fullName username email');
  }

  await logAdminAction({
    adminId: performerId,
    actionType: 'resolve_report',
    targetModel: 'Report',
    targetId: reportId,
    description: `Resolved report with action: ${action}. Notes: ${notes || 'None'}`,
    ipAddress
  });

  return updatedReport;
};

/**
 * Fetch creator verification requests with pagination
 */
const getVerificationRequests = async ({ status, page = 1, limit = 10 }) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  if (connectDB.isDbOffline()) {
    const { mockVerificationRequestRepo } = require('../models/mock.db');
    const list = await mockVerificationRequestRepo.find({ status });
    const total = list.length;
    const paginated = list.slice(skip, skip + limitNum);
    const pages = Math.ceil(total / limitNum);

    return {
      requests: paginated,
      total,
      page: pageNum,
      pages
    };
  } else {
    const VerificationRequest = require('../models/verificationRequest.model');
    const query = {};
    if (status) query.status = status;

    const total = await VerificationRequest.countDocuments(query);
    const requests = await VerificationRequest.find(query)
      .populate('user', 'fullName username email bio totalStars category avatarUrl')
      .populate('reviewedBy', 'fullName username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const pages = Math.ceil(total / limitNum);

    return {
      requests,
      total,
      page: pageNum,
      pages
    };
  }
};

/**
 * Approve or Reject creator verification request
 */
const resolveVerificationRequest = async (requestId, { status, feedback }, performerId, ipAddress) => {
  let updated;
  if (!['approved', 'rejected'].includes(status)) {
    const err = new Error('Please provide a valid resolution status (approved, rejected).');
    err.statusCode = 400;
    throw err;
  }

  let request;
  if (connectDB.isDbOffline()) {
    const { mockVerificationRequestRepo } = require('../models/mock.db');
    request = await mockVerificationRequestRepo.findById(requestId);
  } else {
    const VerificationRequest = require('../models/verificationRequest.model');
    request = await VerificationRequest.findById(requestId);
  }

  if (!request) {
    const err = new Error('Verification request not found.');
    err.statusCode = 404;
    throw err;
  }

  const userId = request.user && request.user._id ? request.user._id : request.user;

  if (connectDB.isDbOffline()) {
    const { mockVerificationRequestRepo } = require('../models/mock.db');
    updated = await mockVerificationRequestRepo.findByIdAndUpdate(requestId, {
      status,
      feedback: feedback || '',
      reviewedBy: performerId,
      reviewedAt: new Date()
    });
    
    if (status === 'approved') {
      await toggleUserVerification(userId, true, performerId, ipAddress);
    }
  } else {
    const VerificationRequest = require('../models/verificationRequest.model');
    updated = await VerificationRequest.findByIdAndUpdate(
      requestId,
      {
        status,
        feedback: feedback || '',
        reviewedBy: performerId,
        reviewedAt: new Date()
      },
      { new: true }
    ).populate('user', 'fullName username email')
     .populate('reviewedBy', 'fullName username email');

    if (status === 'approved') {
      await toggleUserVerification(userId, true, performerId, ipAddress);
    }
  }

  await logAdminAction({
    adminId: performerId,
    actionType: `resolve_verification_${status}`,
    targetModel: 'VerificationRequest',
    targetId: requestId,
    description: `Creator verification request was ${status}. Feedback: ${feedback || 'None'}`,
    ipAddress
  });

  return updated;
};

const getTransactions = async ({ search, type, dateRange, status, amount, page = 1, limit = 10 }) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  if (connectDB.isDbOffline()) {
    let list = [...mockTransactions];

    if (type) {
      list = list.filter(t => t.type === type);
    }

    if (amount) {
      const amt = parseFloat(amount);
      if (!isNaN(amt)) {
        list = list.filter(t => Math.abs(t.amount) === Math.abs(amt));
      }
    }

    if (dateRange) {
      const now = new Date();
      let cutOffDate = new Date();
      if (dateRange === 'today') {
        cutOffDate.setHours(0, 0, 0, 0);
      } else if (dateRange === 'last_7_days') {
        cutOffDate.setDate(now.getDate() - 7);
      } else if (dateRange === 'last_30_days') {
        cutOffDate.setDate(now.getDate() - 30);
      }
      list = list.filter(t => new Date(t.timestamp || t.createdAt) >= cutOffDate);
    }

    if (search) {
      const searchLower = search.toLowerCase().trim();
      list = list.filter(t => {
        const populatedUser = mockUsers.find(u => u._id === t.user.toString());
        const usernameMatch = populatedUser && populatedUser.username && populatedUser.username.toLowerCase().includes(searchLower);
        const fullNameMatch = populatedUser && populatedUser.fullName && populatedUser.fullName.toLowerCase().includes(searchLower);
        const descMatch = t.description && t.description.toLowerCase().includes(searchLower);
        const refMatch = t.referenceId && t.referenceId.toLowerCase().includes(searchLower);
        return usernameMatch || fullNameMatch || descMatch || refMatch;
      });
    }

    let resolvedList = [];
    for (const tx of list) {
      const populatedUser = mockUsers.find(u => u._id === tx.user.toString()) || { _id: tx.user, fullName: 'Unknown User', username: 'unknown' };
      const txObj = {
        ...tx,
        user: {
          _id: populatedUser._id,
          fullName: populatedUser.fullName,
          username: populatedUser.username,
          email: populatedUser.email
        },
        status: 'completed',
        recipient: null,
        paymentDetails: null,
        creationDetails: null
      };

      const refundTx = mockTransactions.find(r => r.type === 'refund' && r.referenceId === tx._id.toString());
      if (refundTx) {
        txObj.status = 'refunded';
      }

      if (tx.type === 'purchase_completed') {
        const purchase = mockPremiumPurchases.find(p => p.orderId === tx.referenceId);
        if (purchase) {
          txObj.status = purchase.status;
          txObj.paymentDetails = {
            paymentProvider: purchase.paymentProvider,
            amount: purchase.amount,
            currency: purchase.currency,
            packId: purchase.packId,
            status: purchase.status
          };
        }
      } else if (tx.type === 'quill_sent' || tx.type === 'premium_quill_sent') {
        const creation = mockCreations.find(c => c._id === tx.referenceId);
        if (creation) {
          txObj.creationDetails = {
            _id: creation._id,
            title: creation.title,
            category: creation.category
          };
          const recipientUser = mockUsers.find(u => u._id === (creation.creator._id || creation.creator).toString());
          if (recipientUser) {
            txObj.recipient = {
              _id: recipientUser._id,
              fullName: recipientUser.fullName,
              username: recipientUser.username
            };
          }
        }
      }

      resolvedList.push(txObj);
    }

    if (status) {
      resolvedList = resolvedList.filter(t => t.status === status);
    }

    const total = resolvedList.length;
    resolvedList.sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));
    const paginated = resolvedList.slice(skip, skip + limitNum);
    const pages = Math.ceil(total / limitNum);

    return {
      transactions: paginated,
      total,
      pages,
      page: pageNum,
      limit: limitNum
    };
  } else {
    const query = {};

    if (type) {
      query.type = type;
    }

    if (amount) {
      const amtVal = parseFloat(amount);
      if (!isNaN(amtVal)) {
        query.$or = [{ amount: amtVal }, { amount: -amtVal }];
      }
    }

    if (dateRange) {
      const now = new Date();
      let cutOffDate = new Date();
      if (dateRange === 'today') {
        cutOffDate.setHours(0, 0, 0, 0);
      } else if (dateRange === 'last_7_days') {
        cutOffDate.setDate(now.getDate() - 7);
      } else if (dateRange === 'last_30_days') {
        cutOffDate.setDate(now.getDate() - 30);
      }
      query.createdAt = { $gte: cutOffDate };
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const matchedUsers = await User.find({
        $or: [
          { fullName: searchRegex },
          { username: searchRegex },
          { email: searchRegex }
        ]
      }).select('_id');
      const userIds = matchedUsers.map(u => u._id);

      query.$or = [
        { user: { $in: userIds } },
        { description: searchRegex },
        { referenceId: searchRegex }
      ];
    }

    const allMatchingTxs = await Transaction.find(query)
      .populate('user', 'fullName username email')
      .sort({ createdAt: -1 });

    let resolvedList = [];
    for (const tx of allMatchingTxs) {
      const txObj = tx.toObject();
      txObj.status = 'completed';
      txObj.recipient = null;
      txObj.paymentDetails = null;
      txObj.creationDetails = null;

      const refundTx = await Transaction.findOne({ type: 'refund', referenceId: tx._id.toString() });
      if (refundTx) {
        txObj.status = 'refunded';
      }

      if (tx.type === 'purchase_completed') {
        const purchase = await PremiumPurchase.findOne({ orderId: tx.referenceId });
        if (purchase) {
          txObj.status = purchase.status;
          txObj.paymentDetails = {
            paymentProvider: purchase.paymentProvider,
            amount: purchase.amount,
            currency: purchase.currency,
            packId: purchase.packId,
            status: purchase.status
          };
        }
      } else if (tx.type === 'quill_sent' || tx.type === 'premium_quill_sent') {
        const creation = await Creation.findById(tx.referenceId).populate('creator', 'fullName username');
        if (creation) {
          txObj.creationDetails = {
            _id: creation._id,
            title: creation.title,
            category: creation.category
          };
          if (creation.creator) {
            txObj.recipient = {
              _id: creation.creator._id,
              fullName: creation.creator.fullName,
              username: creation.creator.username
            };
          }
        }
      }

      resolvedList.push(txObj);
    }

    if (status) {
      resolvedList = resolvedList.filter(t => t.status === status);
    }

    const total = resolvedList.length;
    const paginated = resolvedList.slice(skip, skip + limitNum);
    const pages = Math.ceil(total / limitNum);

    return {
      transactions: paginated,
      total,
      pages,
      page: pageNum,
      limit: limitNum
    };
  }
};

const getAuditLogs = async ({ search, actionType, dateRange, page = 1, limit = 10 }) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  if (connectDB.isDbOffline()) {
    let list = [...mockAuditLogs];

    if (actionType) {
      list = list.filter(l => l.actionType === actionType);
    }

    if (dateRange) {
      const now = new Date();
      let cutOffDate = new Date();
      if (dateRange === 'today') {
        cutOffDate.setHours(0, 0, 0, 0);
      } else if (dateRange === 'last_7_days') {
        cutOffDate.setDate(now.getDate() - 7);
      } else if (dateRange === 'last_30_days') {
        cutOffDate.setDate(now.getDate() - 30);
      }
      list = list.filter(l => new Date(l.createdAt) >= cutOffDate);
    }

    if (search) {
      const searchLower = search.toLowerCase().trim();
      list = list.filter(l => {
        const popAdmin = mockUsers.find(u => u._id === l.admin.toString());
        const adminName = popAdmin && popAdmin.fullName && popAdmin.fullName.toLowerCase().includes(searchLower);
        const adminUsername = popAdmin && popAdmin.username && popAdmin.username.toLowerCase().includes(searchLower);
        const descMatch = l.description && l.description.toLowerCase().includes(searchLower);
        const targetModelMatch = l.targetModel && l.targetModel.toLowerCase().includes(searchLower);
        const targetIdMatch = l.targetId && l.targetId.toLowerCase().includes(searchLower);
        return adminName || adminUsername || descMatch || targetModelMatch || targetIdMatch;
      });
    }

    const total = list.length;
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const paginated = list.slice(skip, skip + limitNum);
    const pages = Math.ceil(total / limitNum);

    const populated = paginated.map(l => {
      const popAdmin = mockUsers.find(u => u._id === l.admin.toString()) || { _id: l.admin, fullName: 'Unknown Admin', username: 'unknown', role: 'admin' };
      return {
        ...l,
        admin: {
          _id: popAdmin._id,
          fullName: popAdmin.fullName,
          username: popAdmin.username,
          role: popAdmin.role,
          email: popAdmin.email
        }
      };
    });

    return {
      audits: populated,
      total,
      pages,
      page: pageNum,
      limit: limitNum
    };
  } else {
    const query = {};

    if (actionType) {
      query.actionType = actionType;
    }

    if (dateRange) {
      const now = new Date();
      let cutOffDate = new Date();
      if (dateRange === 'today') {
        cutOffDate.setHours(0, 0, 0, 0);
      } else if (dateRange === 'last_7_days') {
        cutOffDate.setDate(now.getDate() - 7);
      } else if (dateRange === 'last_30_days') {
        cutOffDate.setDate(now.getDate() - 30);
      }
      query.createdAt = { $gte: cutOffDate };
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const matchedAdmins = await User.find({
        $or: [
          { fullName: searchRegex },
          { username: searchRegex }
        ]
      }).select('_id');
      const adminIds = matchedAdmins.map(u => u._id);

      query.$or = [
        { admin: { $in: adminIds } },
        { description: searchRegex },
        { targetModel: searchRegex },
        { targetId: searchRegex }
      ];
    }

    const total = await AuditLog.countDocuments(query);
    const audits = await AuditLog.find(query)
      .populate('admin', 'fullName username role email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const pages = Math.ceil(total / limitNum);

    return {
      audits,
      total,
      pages,
      page: pageNum,
      limit: limitNum
    };
  }
};

const refundTransaction = async (transactionId, reason, performerId, ipAddress) => {
  if (!reason || !reason.trim()) {
    throw new Error('Refund reason is required.');
  }

  const NotificationService = require('./notification.service');

  if (connectDB.isDbOffline()) {
    const tx = mockTransactions.find(t => t._id === transactionId);
    if (!tx) {
      throw new Error('Transaction not found.');
    }

    const alreadyRefunded = mockTransactions.some(r => r.type === 'refund' && r.referenceId === transactionId);
    if (alreadyRefunded) {
      throw new Error('This transaction has already been refunded.');
    }

    // Save states for atomic rollback in mock mode
    const originalTransactionsLength = mockTransactions.length;
    const originalAuditLogsLength = mockAuditLogs.length;
    const originalNotificationsLength = mockNotifications.length;

    if (tx.type === 'purchase_completed') {
      const purchase = mockPremiumPurchases.find(p => p.orderId === tx.referenceId);
      if (!purchase) {
        throw new Error('Associated shop purchase order not found.');
      }
      if (purchase.status === 'refunded') {
        throw new Error('This purchase has already been refunded.');
      }

      const buyerWallet = await mockQuillWalletRepo.findOne({ user: tx.user.toString() });
      const buyerGemWallet = await mockGemWalletRepo.findOne({ user: tx.user.toString() });

      const quillsAwarded = purchase.premiumQuillsAwarded;
      const gemsAwarded = purchase.gemsAwarded || 0;

      // Capture snapshots for rollback
      const origBuyerWallet = buyerWallet ? { ...buyerWallet } : null;
      const origBuyerGemWallet = buyerGemWallet ? { ...buyerGemWallet } : null;
      const origPurchaseStatus = purchase.status;

      // Balance check to prevent negative balance
      if ((buyerWallet && buyerWallet.premiumQuills < quillsAwarded) || (gemsAwarded > 0 && buyerGemWallet && buyerGemWallet.gems < gemsAwarded)) {
        await logAdminAction({
          adminId: performerId,
          actionType: 'refund_manual_review',
          targetModel: 'PremiumPurchase',
          targetId: purchase._id,
          description: `Refund flagged for manual review: Buyer has insufficient quills/gems. Reason: ${reason}`,
          previousState: {
            originalTransactionId: tx._id.toString(),
            originalAmount: tx.amount,
            originalCurrency: tx.currency,
            balances: {
              sender: {
                quills: 0,
                premiumQuills: buyerWallet ? buyerWallet.premiumQuills : 0,
                gems: buyerGemWallet ? buyerGemWallet.gems : 0
              }
            }
          },
          newState: {
            status: 'manual_review',
            warning: 'Buyer has insufficient quills/gems. Wallet balance was not deducted.',
            refundReason: reason
          },
          ipAddress
        });

        const err = new Error(`WARNING: Refund requires manual review. Buyer has insufficient balance (Premium Quills: ${buyerWallet?.premiumQuills || 0}, Gems: ${buyerGemWallet?.gems || 0}) to reverse the purchase.`);
        err.statusCode = 400;
        err.isManualReview = true;
        throw err;
      }

      // Perform edits
      if (buyerWallet) buyerWallet.premiumQuills -= quillsAwarded;
      if (buyerGemWallet && gemsAwarded > 0) buyerGemWallet.gems -= gemsAwarded;
      purchase.status = 'refunded';

      try {
        const refundTx = {
          _id: `mock-tx-refund-${Date.now()}`,
          user: tx.user,
          amount: -quillsAwarded,
          currency: 'premium_quill',
          type: 'refund',
          source: 'shop_pack_refund',
          referenceId: tx._id.toString(),
          description: `Refunded shop purchase ${tx._id}: ${reason}`,
          timestamp: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        mockTransactions.push(refundTx);

        await NotificationService.createNotification(
          performerId,
          tx.user,
          'tip',
          null,
          `Your premium purchase order ${purchase.orderId} of INR ${purchase.amount} has been refunded by administration. Quills and gems have been deducted.`,
          { throwOnError: true }
        );

        await logAdminAction({
          adminId: performerId,
          actionType: 'refund_purchase',
          targetModel: 'PremiumPurchase',
          targetId: purchase._id,
          description: `Refunded premium purchase order ${purchase.orderId}. Reason: ${reason}`,
          previousState: {
            originalTransactionId: tx._id.toString(),
            originalAmount: tx.amount,
            originalCurrency: tx.currency,
            balances: {
              sender: {
                quills: 0,
                premiumQuills: origBuyerWallet ? origBuyerWallet.premiumQuills : 0,
                gems: origBuyerGemWallet ? origBuyerGemWallet.gems : 0
              }
            }
          },
          newState: {
            refundAmount: -quillsAwarded,
            refundReason: reason,
            balances: {
              sender: {
                quills: 0,
                premiumQuills: buyerWallet ? buyerWallet.premiumQuills : 0,
                gems: buyerGemWallet ? buyerGemWallet.gems : 0
              }
            }
          },
          ipAddress
        }, { throwOnError: true });

        return { success: true, message: 'Shop purchase refunded successfully.' };
      } catch (err) {
        // Rollback mock data changes
        if (buyerWallet && origBuyerWallet) buyerWallet.premiumQuills = origBuyerWallet.premiumQuills;
        if (buyerGemWallet && origBuyerGemWallet) buyerGemWallet.gems = origBuyerGemWallet.gems;
        purchase.status = origPurchaseStatus;
        mockTransactions.length = originalTransactionsLength;
        mockAuditLogs.length = originalAuditLogsLength;
        mockNotifications.length = originalNotificationsLength;
        throw err;
      }
    } 
    
    if (tx.type === 'quill_sent' || tx.type === 'premium_quill_sent') {
      const creation = mockCreations.find(c => c._id === tx.referenceId);
      if (!creation) {
        throw new Error('Associated creation not found.');
      }
      const creatorId = creation.creator._id || creation.creator;

      const isPremium = tx.type === 'premium_quill_sent';
      const quillAmount = Math.abs(tx.amount);

      const isJoint = creation.isJoint === true || creation.isJoint === 'true';
      let gemsAwarded = 0;
      if (isJoint) {
        gemsAwarded = quillAmount * (isPremium ? 5 : 3);
      } else {
        gemsAwarded = quillAmount * (isPremium ? 4 : 2);
      }

      const senderGemsReward = isPremium ? quillAmount * 2.5 : quillAmount * 1.0;

      const senderQuillWallet = await mockQuillWalletRepo.findOne({ user: tx.user.toString() });
      const senderGemWallet = await mockGemWalletRepo.findOne({ user: tx.user.toString() });
      const recipientGemWallet = await mockGemWalletRepo.findOne({ user: creatorId.toString() });

      const origSenderQuillWallet = senderQuillWallet ? { ...senderQuillWallet } : null;
      const origSenderGemWallet = senderGemWallet ? { ...senderGemWallet } : null;
      const origRecipientGemWallet = recipientGemWallet ? { ...recipientGemWallet } : null;

      // Balance check to prevent negative balances for creator
      if (!recipientGemWallet || recipientGemWallet.gems < gemsAwarded) {
        await logAdminAction({
          adminId: performerId,
          actionType: 'refund_manual_review',
          targetModel: 'Transaction',
          targetId: tx._id,
          description: `Refund flagged for manual review: Recipient creator has insufficient gems (current: ${recipientGemWallet ? recipientGemWallet.gems : 0}, required: ${gemsAwarded}). Reason: ${reason}`,
          previousState: {
            originalTransactionId: tx._id.toString(),
            originalAmount: tx.amount,
            originalCurrency: tx.currency,
            balances: {
              sender: {
                quills: senderQuillWallet ? senderQuillWallet.quills : 0,
                premiumQuills: senderQuillWallet ? senderQuillWallet.premiumQuills : 0,
                gems: senderGemWallet ? senderGemWallet.gems : 0
              },
              recipient: {
                gems: recipientGemWallet ? recipientGemWallet.gems : 0
              }
            }
          },
          newState: {
            status: 'manual_review',
            warning: 'Recipient has insufficient gems. Wallet balance was not deducted.',
            refundReason: reason
          },
          ipAddress
        });

        const err = new Error(`WARNING: Refund requires manual review. Recipient creator has insufficient gems (current: ${recipientGemWallet ? recipientGemWallet.gems : 0}, required: ${gemsAwarded}). No balances were modified.`);
        err.statusCode = 400;
        err.isManualReview = true;
        throw err;
      }

      if (senderGemsReward > 0 && (!senderGemWallet || senderGemWallet.gems < senderGemsReward)) {
        throw new Error(`Reversal rejected: Sender tipster has insufficient gems to cover gem reward deduction (current: ${senderGemWallet ? senderGemWallet.gems : 0}, required: ${senderGemsReward}). Manual review required.`);
      }

      // Perform edits
      if (senderQuillWallet) {
        if (isPremium) {
          senderQuillWallet.premiumQuills += quillAmount;
        } else {
          senderQuillWallet.quills += quillAmount;
        }
      }
      if (senderGemWallet) {
        senderGemWallet.gems -= senderGemsReward;
      }
      if (recipientGemWallet) {
        recipientGemWallet.gems -= gemsAwarded;
      }

      try {
        const refundSenderTx = {
          _id: `mock-tx-refund-${Date.now()}-1`,
          user: tx.user,
          amount: quillAmount,
          currency: tx.currency,
          type: 'refund',
          source: 'tip_refund',
          referenceId: tx._id.toString(),
          description: `Refunded tip transaction ${tx._id}: ${reason}`,
          timestamp: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        mockTransactions.push(refundSenderTx);

        const refundRecipientTx = {
          _id: `mock-tx-refund-${Date.now()}-2`,
          user: creatorId,
          amount: -gemsAwarded,
          currency: 'gem',
          type: 'gems_spent',
          source: 'tip_refund_deduction',
          referenceId: tx._id.toString(),
          description: `Deducted gems for refunded tip ${tx._id}`,
          timestamp: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        mockTransactions.push(refundRecipientTx);

        await NotificationService.createNotification(
          performerId,
          tx.user,
          'tip',
          creation._id,
          `Your tip of ${quillAmount} ${isPremium ? 'Premium ' : ''}Quill(s) on '${creation.title}' has been refunded by admin. Quills returned to wallet.`,
          { throwOnError: true }
        );

        await NotificationService.createNotification(
          performerId,
          creatorId,
          'tip',
          creation._id,
          `A tip of ${quillAmount} ${isPremium ? 'Premium ' : ''}Quill(s) on your creation '${creation.title}' was reversed by admin. Gems deducted.`,
          { throwOnError: true }
        );

        await logAdminAction({
          adminId: performerId,
          actionType: 'refund_tip',
          targetModel: 'Transaction',
          targetId: tx._id,
          description: `Refunded tip transaction ${tx._id} on creation '${creation.title}'. Reason: ${reason}`,
          previousState: {
            originalTransactionId: tx._id.toString(),
            originalAmount: tx.amount,
            originalCurrency: tx.currency,
            balances: {
              sender: {
                quills: origSenderQuillWallet ? origSenderQuillWallet.quills : 0,
                premiumQuills: origSenderQuillWallet ? origSenderQuillWallet.premiumQuills : 0,
                gems: origSenderGemWallet ? origSenderGemWallet.gems : 0
              },
              recipient: {
                gems: origRecipientGemWallet ? origRecipientGemWallet.gems : 0
              }
            }
          },
          newState: {
            refundAmount: quillAmount,
            refundReason: reason,
            balances: {
              sender: {
                quills: senderQuillWallet ? senderQuillWallet.quills : 0,
                premiumQuills: senderQuillWallet ? senderQuillWallet.premiumQuills : 0,
                gems: senderGemWallet ? senderGemWallet.gems : 0
              },
              recipient: {
                gems: recipientGemWallet ? recipientGemWallet.gems : 0
              }
            }
          },
          ipAddress
        }, { throwOnError: true });

        return { success: true, message: 'Tip refunded successfully.' };
      } catch (err) {
        // Rollback mock data changes
        if (senderQuillWallet && origSenderQuillWallet) {
          senderQuillWallet.premiumQuills = origSenderQuillWallet.premiumQuills;
          senderQuillWallet.quills = origSenderQuillWallet.quills;
        }
        if (senderGemWallet && origSenderGemWallet) senderGemWallet.gems = origSenderGemWallet.gems;
        if (recipientGemWallet && origRecipientGemWallet) recipientGemWallet.gems = origRecipientGemWallet.gems;
        mockTransactions.length = originalTransactionsLength;
        mockAuditLogs.length = originalAuditLogsLength;
        mockNotifications.length = originalNotificationsLength;
        throw err;
      }
    }

    throw new Error('This type of transaction cannot be refunded.');
  } else {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const tx = await Transaction.findById(transactionId).session(session);
      if (!tx) {
        throw new Error('Transaction not found.');
      }

      const alreadyRefunded = await Transaction.findOne({ type: 'refund', referenceId: transactionId }).session(session);
      if (alreadyRefunded) {
        throw new Error('This transaction has already been refunded.');
      }

      if (tx.type === 'purchase_completed') {
        const purchase = await PremiumPurchase.findOne({ orderId: tx.referenceId }).session(session);
        if (!purchase) {
          throw new Error('Associated shop purchase order not found.');
        }
        if (purchase.status === 'refunded') {
          throw new Error('This purchase has already been refunded.');
        }

        const QuillWallet = require('../models/quillWallet.model');
        const GemWallet = require('../models/gemWallet.model');

        let buyerWallet = await QuillWallet.findOne({ user: tx.user }).session(session);
        let buyerGemWallet = await GemWallet.findOne({ user: tx.user }).session(session);

        const quillsAwarded = purchase.premiumQuillsAwarded;
        const gemsAwarded = purchase.gemsAwarded || 0;

        // Balance check to prevent negative balance
        if ((buyerWallet && buyerWallet.premiumQuills < quillsAwarded) || (gemsAwarded > 0 && buyerGemWallet && buyerGemWallet.gems < gemsAwarded)) {
          // Log manual review outside transaction session so it persists
          await logAdminAction({
            adminId: performerId,
            actionType: 'refund_manual_review',
            targetModel: 'PremiumPurchase',
            targetId: purchase._id,
            description: `Refund flagged for manual review: Buyer has insufficient quills/gems. Reason: ${reason}`,
            previousState: {
              originalTransactionId: tx._id.toString(),
              originalAmount: tx.amount,
              originalCurrency: tx.currency,
              balances: {
                sender: {
                  quills: 0,
                  premiumQuills: buyerWallet ? buyerWallet.premiumQuills : 0,
                  gems: buyerGemWallet ? buyerGemWallet.gems : 0
                }
              }
            },
            newState: {
              status: 'manual_review',
              warning: 'Buyer has insufficient quills/gems. Wallet balance was not deducted.',
              refundReason: reason
            },
            ipAddress
          });

          const err = new Error(`WARNING: Refund requires manual review. Buyer has insufficient balance (Premium Quills: ${buyerWallet?.premiumQuills || 0}, Gems: ${buyerGemWallet?.gems || 0}) to reverse the purchase.`);
          err.statusCode = 400;
          err.isManualReview = true;
          throw err;
        }

        const beforeQuills = buyerWallet ? buyerWallet.premiumQuills : 0;
        const beforeGems = buyerGemWallet ? buyerGemWallet.gems : 0;

        if (buyerWallet) {
          buyerWallet.premiumQuills -= quillsAwarded;
          await buyerWallet.save({ session });
        }
        if (buyerGemWallet && gemsAwarded > 0) {
          buyerGemWallet.gems -= gemsAwarded;
          await buyerGemWallet.save({ session });
        }

        const afterQuills = buyerWallet ? buyerWallet.premiumQuills : 0;
        const afterGems = buyerGemWallet ? buyerGemWallet.gems : 0;

        purchase.status = 'refunded';
        await purchase.save({ session });

        await Transaction.create([{
          user: tx.user,
          amount: -quillsAwarded,
          currency: 'premium_quill',
          type: 'refund',
          source: 'shop_pack_refund',
          referenceId: tx._id.toString(),
          description: `Refunded shop purchase ${tx._id}: ${reason}`
        }], { session });

        await NotificationService.createNotification(
          performerId,
          tx.user,
          'tip',
          null,
          `Your premium purchase order ${purchase.orderId} of INR ${purchase.amount} has been refunded by administration. Quills and gems have been deducted.`,
          { session, throwOnError: true }
        );

        await logAdminAction({
          adminId: performerId,
          actionType: 'refund_purchase',
          targetModel: 'PremiumPurchase',
          targetId: purchase._id,
          description: `Refunded premium purchase order ${purchase.orderId}. Reason: ${reason}`,
          previousState: {
            originalTransactionId: tx._id.toString(),
            originalAmount: tx.amount,
            originalCurrency: tx.currency,
            balances: {
              sender: {
                quills: 0,
                premiumQuills: beforeQuills,
                gems: beforeGems
              }
            }
          },
          newState: {
            refundAmount: -quillsAwarded,
            refundReason: reason,
            balances: {
              sender: {
                quills: 0,
                premiumQuills: afterQuills,
                gems: afterGems
              }
            }
          },
          ipAddress
        }, { session, throwOnError: true });

      } else if (tx.type === 'quill_sent' || tx.type === 'premium_quill_sent') {
        const creation = await Creation.findById(tx.referenceId).session(session);
        if (!creation) {
          throw new Error('Associated creation not found.');
        }
        const creatorId = creation.creator;

        const isPremium = tx.type === 'premium_quill_sent';
        const quillAmount = Math.abs(tx.amount);

        const isJoint = creation.isJoint === true || creation.isJoint === 'true';
        let gemsAwarded = 0;
        if (isJoint) {
          gemsAwarded = quillAmount * (isPremium ? 5 : 3);
        } else {
          gemsAwarded = quillAmount * (isPremium ? 4 : 2);
        }

        const senderGemsReward = isPremium ? quillAmount * 2.5 : quillAmount * 1.0;

        const QuillWallet = require('../models/quillWallet.model');
        const GemWallet = require('../models/gemWallet.model');

        let senderQuillWallet = await QuillWallet.findOne({ user: tx.user }).session(session);
        let senderGemWallet = await GemWallet.findOne({ user: tx.user }).session(session);
        let recipientGemWallet = await GemWallet.findOne({ user: creatorId }).session(session);

        // Balance check to prevent negative balances for creator
        if (!recipientGemWallet || recipientGemWallet.gems < gemsAwarded) {
          // Log manual review outside transaction session so it persists
          await logAdminAction({
            adminId: performerId,
            actionType: 'refund_manual_review',
            targetModel: 'Transaction',
            targetId: tx._id,
            description: `Refund flagged for manual review: Recipient creator has insufficient gems (current: ${recipientGemWallet ? recipientGemWallet.gems : 0}, required: ${gemsAwarded}). Reason: ${reason}`,
            previousState: {
              originalTransactionId: tx._id.toString(),
              originalAmount: tx.amount,
              originalCurrency: tx.currency,
              balances: {
                sender: {
                  quills: senderQuillWallet ? senderQuillWallet.quills : 0,
                  premiumQuills: senderQuillWallet ? senderQuillWallet.premiumQuills : 0,
                  gems: senderGemWallet ? senderGemWallet.gems : 0
                },
                recipient: {
                  gems: recipientGemWallet ? recipientGemWallet.gems : 0
                }
              }
            },
            newState: {
              status: 'manual_review',
              warning: 'Recipient has insufficient gems. Wallet balance was not deducted.',
              refundReason: reason
            },
            ipAddress
          });

          const err = new Error(`WARNING: Refund requires manual review. Recipient creator has insufficient gems (current: ${recipientGemWallet ? recipientGemWallet.gems : 0}, required: ${gemsAwarded}). No balances were modified.`);
          err.statusCode = 400;
          err.isManualReview = true;
          throw err;
        }

        if (senderGemsReward > 0 && (!senderGemWallet || senderGemWallet.gems < senderGemsReward)) {
          throw new Error(`Reversal rejected: Sender tipster has insufficient gems to cover gem reward deduction (current: ${senderGemWallet ? senderGemWallet.gems : 0}, required: ${senderGemsReward}). Manual review required.`);
        }

        const beforeSenderQuills = senderQuillWallet ? (isPremium ? senderQuillWallet.premiumQuills : senderQuillWallet.quills) : 0;
        const beforeSenderGems = senderGemWallet ? senderGemWallet.gems : 0;
        const beforeRecipientGems = recipientGemWallet ? recipientGemWallet.gems : 0;

        if (senderQuillWallet) {
          if (isPremium) {
            senderQuillWallet.premiumQuills += quillAmount;
          } else {
            senderQuillWallet.quills += quillAmount;
          }
          await senderQuillWallet.save({ session });
        }
        if (senderGemWallet) {
          senderGemWallet.gems -= senderGemsReward;
          await senderGemWallet.save({ session });
        }

        if (recipientGemWallet) {
          recipientGemWallet.gems -= gemsAwarded;
          await recipientGemWallet.save({ session });
        }

        const afterSenderQuills = senderQuillWallet ? (isPremium ? senderQuillWallet.premiumQuills : senderQuillWallet.quills) : 0;
        const afterSenderGems = senderGemWallet ? senderGemWallet.gems : 0;
        const afterRecipientGems = recipientGemWallet ? recipientGemWallet.gems : 0;

        await Transaction.create([
          {
            user: tx.user,
            amount: quillAmount,
            currency: tx.currency,
            type: 'refund',
            source: 'tip_refund',
            referenceId: tx._id.toString(),
            description: `Refunded tip transaction ${tx._id}: ${reason}`
          },
          {
            user: creatorId,
            amount: -gemsAwarded,
            currency: 'gem',
            type: 'gems_spent',
            source: 'tip_refund_deduction',
            referenceId: tx._id.toString(),
            description: `Deducted gems for refunded tip ${tx._id}`
          }
        ], { session });

        await NotificationService.createNotification(
          performerId,
          tx.user,
          'tip',
          creation._id,
          `Your tip of ${quillAmount} ${isPremium ? 'Premium ' : ''}Quill(s) on '${creation.title}' has been refunded by admin. Quills returned to wallet.`,
          { session, throwOnError: true }
        );

        await NotificationService.createNotification(
          performerId,
          creatorId,
          'tip',
          creation._id,
          `A tip of ${quillAmount} ${isPremium ? 'Premium ' : ''}Quill(s) on your creation '${creation.title}' was reversed by admin. Gems deducted.`,
          { session, throwOnError: true }
        );

        await logAdminAction({
          adminId: performerId,
          actionType: 'refund_tip',
          targetModel: 'Transaction',
          targetId: tx._id,
          description: `Refunded tip transaction ${tx._id} on creation '${creation.title}'. Reason: ${reason}`,
          previousState: {
            originalTransactionId: tx._id.toString(),
            originalAmount: tx.amount,
            originalCurrency: tx.currency,
            balances: {
              sender: {
                quills: beforeSenderQuills,
                premiumQuills: beforeSenderQuills, // covers premium status
                gems: beforeSenderGems
              },
              recipient: {
                gems: beforeRecipientGems
              }
            }
          },
          newState: {
            refundAmount: quillAmount,
            refundReason: reason,
            balances: {
              sender: {
                quills: afterSenderQuills,
                premiumQuills: afterSenderQuills,
                gems: afterSenderGems
              },
              recipient: {
                gems: afterRecipientGems
              }
            }
          },
          ipAddress
        }, { session, throwOnError: true });
      } else {
        throw new Error('This type of transaction cannot be refunded.');
      }

      await session.commitTransaction();
      return { success: true, message: 'Transaction refunded successfully.' };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUserStatus,
  toggleUserVerification,
  addUserNote,
  getCreations,
  getCreationById,
  updateCreationStatus,
  toggleCreationFeatured,
  deleteCreation,
  logAdminAction,
  getReports,
  getReportById,
  getReportWorkspaceDetails,
  assignReport,
  escalateReport,
  resolveReport,
  getVerificationRequests,
  resolveVerificationRequest,
  getTransactions,
  getAuditLogs,
  refundTransaction
};
