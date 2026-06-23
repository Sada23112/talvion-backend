const express = require('express');
const router = express.Router();
const {
  getProfile,
  getUserProfile,
  updateProfile,
  updatePassword,
  deleteAccount,
  uploadAvatar,
  uploadBanner,
  fetchAvatar,
  fetchBanner,
  getBookmarkedCreations
} = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');
const { uploadAvatar: uploadAvatarMiddleware, uploadBanner: uploadBannerMiddleware } = require('../middlewares/upload.middleware');

// All profile and settings routes require JWT authentication
router.get('/me', protect, getProfile);
router.get('/me/bookmarks', protect, getBookmarkedCreations);
router.get('/:id', protect, getUserProfile);
router.put('/me', protect, updateProfile);
router.put('/me/password', protect, updatePassword);
router.delete('/me', protect, deleteAccount);

// Media Upload & Fetch Routes
router.post('/me/avatar', protect, uploadAvatarMiddleware, uploadAvatar);
router.post('/me/banner', protect, uploadBannerMiddleware, uploadBanner);
router.get('/me/avatar', protect, fetchAvatar);
router.get('/me/banner', protect, fetchBanner);
router.get('/:id/avatar', protect, fetchAvatar);
router.get('/:id/banner', protect, fetchBanner);

module.exports = router;
