const AdminService = require('../services/admin.service');

/**
 * @desc    Get users list with search and pagination filters
 * @route   GET /api/v1/admin/users
 * @access  Private (Admin only)
 */
const getUsersList = async (req, res, next) => {
  try {
    const { search, role, status, isVerified, page, limit } = req.query;

    const data = await AdminService.getUsers({
      search,
      role,
      status,
      isVerified,
      page,
      limit
    });

    res.status(200).json({
      status: 'success',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get detailed user profile and metadata
 * @route   GET /api/v1/admin/users/:id
 * @access  Private (Admin only)
 */
const getUserDetails = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await AdminService.getUserById(userId);

    if (!user) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      return next(error);
    }

    res.status(200).json({
      status: 'success',
      user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user status (suspend, ban, active)
 * @route   PUT /api/v1/admin/users/:id/status
 * @access  Private (Admin only)
 */
const updateUserStatus = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { status, reason, until } = req.body;
    const performerId = req.user._id;
    const performerRole = req.user.role;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    if (!status || !['active', 'suspended', 'banned'].includes(status)) {
      const error = new Error('Please provide a valid account status value (active, suspended, banned).');
      error.statusCode = 400;
      return next(error);
    }

    // Role enforcement based on the permissions matrix
    if (status === 'banned' && !['admin', 'super_admin'].includes(performerRole)) {
      const error = new Error('Permission denied: You do not have permission to permanently ban user accounts.');
      error.statusCode = 403;
      return next(error);
    }

    if (status === 'active' && !['admin', 'super_admin'].includes(performerRole)) {
      const error = new Error('Permission denied: You do not have permission to restore user accounts.');
      error.statusCode = 403;
      return next(error);
    }

    if (status === 'suspended' && !['moderator', 'admin', 'super_admin'].includes(performerRole)) {
      const error = new Error('Permission denied: You do not have permission to suspend user accounts.');
      error.statusCode = 403;
      return next(error);
    }

    const updatedUser = await AdminService.updateUserStatus(
      userId,
      { status, reason, until },
      performerId,
      ipAddress
    );

    res.status(200).json({
      status: 'success',
      message: `User account status has been updated to '${status}'.`,
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle verified badge of a creator
 * @route   PUT /api/v1/admin/users/:id/verify
 * @access  Private (Admin only)
 */
const toggleUserVerification = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { isVerified } = req.body;
    const performerId = req.user._id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    if (isVerified === undefined) {
      const error = new Error('Please specify isVerified flag in request payload.');
      error.statusCode = 400;
      return next(error);
    }

    const updatedUser = await AdminService.toggleUserVerification(
      userId,
      isVerified,
      performerId,
      ipAddress
    );

    res.status(200).json({
      status: 'success',
      message: `User creator verification badge has been set to ${isVerified}.`,
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add / Update moderation notes on a user
 * @route   POST /api/v1/admin/users/:id/notes
 * @access  Private (Admin only)
 */
const addUserNote = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { notes } = req.body;
    const performerId = req.user._id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const updatedUser = await AdminService.addUserNote(
      userId,
      notes,
      performerId,
      ipAddress
    );

    res.status(200).json({
      status: 'success',
      message: 'User moderation notes have been updated.',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get creations list with category, search and featured filters
 * @route   GET /api/v1/admin/creations
 * @access  Private (Admin only)
 */
const getCreationsList = async (req, res, next) => {
  try {
    const { search, category, isFeatured, status, dateRange, page, limit } = req.query;

    const data = await AdminService.getCreations({
      search,
      category,
      isFeatured,
      status,
      dateRange,
      page,
      limit
    });

    res.status(200).json({
      status: 'success',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get detailed creation information
 * @route   GET /api/v1/admin/creations/:id
 * @access  Private (Admin only)
 */
const getCreationDetails = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const creation = await AdminService.getCreationById(creationId);

    if (!creation) {
      const error = new Error('Creation not found.');
      error.statusCode = 404;
      return next(error);
    }

    res.status(200).json({
      status: 'success',
      creation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update creation status (draft/hidden, published)
 * @route   PUT /api/v1/admin/creations/:id/status
 * @access  Private (Admin only)
 */
const updateCreationStatus = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const { status } = req.body;
    const performerId = req.user._id;
    const performerRole = req.user.role;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    if (!status || !['draft', 'published'].includes(status)) {
      const error = new Error('Please provide a valid creation status value (draft, published).');
      error.statusCode = 400;
      return next(error);
    }

    // Role enforcement based on the permissions matrix
    // Flag/Hide creations: Moderator, Admin, Super Admin
    if (!['moderator', 'admin', 'super_admin'].includes(performerRole)) {
      const error = new Error('Permission denied: You do not have permission to hide or restore creations.');
      error.statusCode = 403;
      return next(error);
    }

    const updatedCreation = await AdminService.updateCreationStatus(
      creationId,
      status,
      performerId,
      ipAddress
    );

    res.status(200).json({
      status: 'success',
      message: `Creation status has been set to '${status}'.`,
      creation: updatedCreation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle featured status of a creation
 * @route   PUT /api/v1/admin/creations/:id/feature
 * @access  Private (Admin only)
 */
const toggleCreationFeatured = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const { isFeatured } = req.body;
    const performerId = req.user._id;
    const performerRole = req.user.role;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    if (isFeatured === undefined) {
      const error = new Error('Please specify isFeatured flag in request payload.');
      error.statusCode = 400;
      return next(error);
    }

    // Role check: Moderator, Admin, Super Admin
    if (!['moderator', 'admin', 'super_admin'].includes(performerRole)) {
      const error = new Error('Permission denied: You do not have permission to feature creations.');
      error.statusCode = 403;
      return next(error);
    }

    const updatedCreation = await AdminService.toggleCreationFeatured(
      creationId,
      isFeatured,
      performerId,
      ipAddress
    );

    res.status(200).json({
      status: 'success',
      message: `Creation featured banner flag has been set to ${isFeatured}.`,
      creation: updatedCreation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a creation permanently
 * @route   DELETE /api/v1/admin/creations/:id
 * @access  Private (Admin only)
 */
const deleteCreation = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const performerId = req.user._id;
    const performerRole = req.user.role;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    // Role check: Admin, Super Admin (Delete is a highly destructive operation)
    if (!['admin', 'super_admin'].includes(performerRole)) {
      const error = new Error('Permission denied: You do not have permission to permanently delete creations.');
      error.statusCode = 403;
      return next(error);
    }

    const result = await AdminService.deleteCreation(
      creationId,
      performerId,
      ipAddress
    );

    res.status(200).json({
      status: 'success',
      message: 'Creation has been permanently deleted.',
      ...result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get reports list with search and filters
 * @route   GET /api/v1/admin/reports
 * @access  Private (Moderator/Admin/Super Admin)
 */
const getReportsList = async (req, res, next) => {
  try {
    const { search, status, escalated, assignedTo, page, limit } = req.query;

    const data = await AdminService.getReports({
      search,
      status,
      escalated,
      assignedTo,
      page,
      limit
    });

    res.status(200).json({
      status: 'success',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get detailed Report Workspace details (reporter details, target content, reported user details, history)
 * @route   GET /api/v1/admin/reports/:id
 * @access  Private (Moderator/Admin/Super Admin)
 */
const getReportDetails = async (req, res, next) => {
  try {
    const reportId = req.params.id;
    const details = await AdminService.getReportWorkspaceDetails(reportId);

    if (!details) {
      const error = new Error('Report not found.');
      error.statusCode = 404;
      return next(error);
    }

    res.status(200).json({
      status: 'success',
      ...details
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Assign report ticket to moderator
 * @route   PUT /api/v1/admin/reports/:id/assign
 * @access  Private (Moderator/Admin/Super Admin)
 */
const updateReportAssignment = async (req, res, next) => {
  try {
    const reportId = req.params.id;
    const { assignedTo } = req.body;
    const performerId = req.user._id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const report = await AdminService.assignReport(reportId, assignedTo, performerId, ipAddress);

    res.status(200).json({
      status: 'success',
      message: 'Report ticket assignment updated.',
      report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Escalate report ticket
 * @route   PUT /api/v1/admin/reports/:id/escalate
 * @access  Private (Moderator/Admin/Super Admin)
 */
const escalateReportTicket = async (req, res, next) => {
  try {
    const reportId = req.params.id;
    const { notes } = req.body;
    const performerId = req.user._id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const report = await AdminService.escalateReport(reportId, notes, performerId, ipAddress);

    res.status(200).json({
      status: 'success',
      message: 'Report ticket escalated to admins.',
      report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resolve report ticket with action details (dismiss, hide content, warn, suspend, ban)
 * @route   PUT /api/v1/admin/reports/:id/resolve
 * @access  Private (Moderator/Admin/Super Admin)
 */
const resolveReportTicket = async (req, res, next) => {
  try {
    const reportId = req.params.id;
    const { action, notes, durationDays } = req.body;
    const performerId = req.user._id;
    const performerRole = req.user.role;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    if (!action) {
      const error = new Error('Please specify resolution action.');
      error.statusCode = 400;
      return next(error);
    }

    // Role checks
    if (action === 'ban_user' && !['admin', 'super_admin'].includes(performerRole)) {
      const error = new Error('Permission denied: Only Admins can permanently ban accounts.');
      error.statusCode = 403;
      return next(error);
    }

    const report = await AdminService.resolveReport(reportId, { action, notes, durationDays }, performerId, ipAddress);

    res.status(200).json({
      status: 'success',
      message: `Report ticket resolved successfully. Action taken: ${action}`,
      report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get creator verification requests queue
 * @route   GET /api/v1/admin/verifications
 * @access  Private (Moderator/Admin/Super Admin)
 */
const getVerificationsList = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;

    const data = await AdminService.getVerificationRequests({
      status,
      page,
      limit
    });

    res.status(200).json({
      status: 'success',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve or Reject verification request
 * @route   PUT /api/v1/admin/verifications/:id/resolve
 * @access  Private (Moderator/Admin/Super Admin)
 */
const resolveVerificationTicket = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const { status, feedback } = req.body;
    const performerId = req.user._id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const request = await AdminService.resolveVerificationRequest(requestId, { status, feedback }, performerId, ipAddress);

    res.status(200).json({
      status: 'success',
      message: `Creator verification application has been ${status}.`,
      request
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get financials transactions list
 * @route   GET /api/v1/admin/transactions
 * @access  Private (Moderator/Admin/Super Admin)
 */
const getTransactionsList = async (req, res, next) => {
  try {
    const { search, type, dateRange, status, amount, page, limit } = req.query;
    const data = await AdminService.getTransactions({
      search,
      type,
      dateRange,
      status,
      amount,
      page,
      limit
    });
    res.status(200).json({
      status: 'success',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get audit logs logs
 * @route   GET /api/v1/admin/audits
 * @access  Private (Moderator/Admin/Super Admin)
 */
const getAuditLogsList = async (req, res, next) => {
  try {
    const { search, actionType, dateRange, page, limit } = req.query;
    const data = await AdminService.getAuditLogs({
      search,
      actionType,
      dateRange,
      page,
      limit
    });
    res.status(200).json({
      status: 'success',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Refund/Reverse a shop purchase or tip transaction
 * @route   POST /api/v1/admin/transactions/:id/refund
 * @access  Private (Admin/Super Admin only)
 */
const refundTransactionEndpoint = async (req, res, next) => {
  try {
    const transactionId = req.params.id;
    const { reason } = req.body;
    const performerId = req.user._id;
    const performerRole = req.user.role;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    // Enforce Admin / Super Admin role checks
    if (!['admin', 'super_admin'].includes(performerRole)) {
      const error = new Error('Permission denied: Only Admins can perform refund operations.');
      error.statusCode = 403;
      return next(error);
    }

    const result = await AdminService.refundTransaction(
      transactionId,
      reason,
      performerId,
      ipAddress
    );

    res.status(200).json({
      status: 'success',
      ...result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsersList,
  getUserDetails,
  updateUserStatus,
  toggleUserVerification,
  addUserNote,
  getCreationsList,
  getCreationDetails,
  updateCreationStatus,
  toggleCreationFeatured,
  deleteCreation,
  getReportsList,
  getReportDetails,
  updateReportAssignment,
  escalateReportTicket,
  resolveReportTicket,
  getVerificationsList,
  resolveVerificationTicket,
  getTransactionsList,
  getAuditLogsList,
  refundTransactionEndpoint
};
