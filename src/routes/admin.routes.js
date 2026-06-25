const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const {
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
} = require('../controllers/admin.controller');

// Protect all admin endpoints
router.use(protect);
router.use(restrictTo('support_staff', 'moderator', 'admin', 'super_admin'));

/**
 * @desc    Get current administrative user profile
 * @route   GET /api/v1/admin/me
 * @access  Private (Admin only)
 */
router.get('/me', (req, res) => {
  res.status(200).json({
    status: 'success',
    user: {
      id: req.user._id,
      fullName: req.user.fullName,
      email: req.user.email,
      username: req.user.username,
      role: req.user.role,
      status: req.user.status,
      isVerified: req.user.isVerified,
      createdAt: req.user.createdAt
    }
  });
});

/**
 * @desc    Get initial placeholder dashboard statistics
 * @route   GET /api/v1/admin/dashboard
 * @access  Private (Admin only)
 */
router.get('/dashboard', (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      stats: {
        totalUsers: 0,
        activeUsers: 0,
        newUsersToday: 0,
        totalCreations: 0,
        totalStories: 0,
        totalCollaborations: 0,
        totalQuillsSent: 0,
        totalPremiumQuillsSent: 0,
        totalGemsGenerated: 0,
        totalGemsSpent: 0,
        revenueCents: 0,
        pendingReports: 0,
        pendingVerifications: 0
      },
      charts: {
        registrations: [],
        creations: [],
        transactions: []
      }
    }
  });
});

// User Management Routes
router.get('/users', getUsersList);
router.get('/users/:id', getUserDetails);
router.put('/users/:id/status', updateUserStatus);
router.put('/users/:id/verify', toggleUserVerification);
router.post('/users/:id/notes', addUserNote);

// Creations Management Routes
router.get('/creations', getCreationsList);
router.get('/creations/:id', getCreationDetails);
router.put('/creations/:id/status', updateCreationStatus);
router.put('/creations/:id/feature', toggleCreationFeatured);
router.delete('/creations/:id', deleteCreation);

// Reports Queue Routes
router.get('/reports', getReportsList);
router.get('/reports/:id', getReportDetails);
router.put('/reports/:id/assign', updateReportAssignment);
router.put('/reports/:id/escalate', escalateReportTicket);
router.put('/reports/:id/resolve', resolveReportTicket);

// Verification Queue Routes
router.get('/verifications', getVerificationsList);
router.put('/verifications/:id/resolve', resolveVerificationTicket);

// Financials Routes
router.get('/transactions', getTransactionsList);
router.post('/transactions/:id/refund', refundTransactionEndpoint);

// Audit Logs Routes
router.get('/audits', getAuditLogsList);

module.exports = router;
