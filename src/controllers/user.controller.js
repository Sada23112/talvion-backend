const path = require('path');
const fs = require('fs');
const User = require('../models/user.model');
const Creation = require('../models/creation.model');
const { CollabRequest, CollabChat } = require('../models/collab.model');
const ReadingProgress = require('../models/readingProgress.model');
const connectDB = require('../config/db');
const logger = require('../config/logger');
const { mockUserRepo, mockUsers } = require('../models/mock.db');

/**
 * @desc    Get currently logged in user profile
 * @route   GET /api/v1/users/me
 * @access  Private
 */
const getProfile = async (req, res, next) => {
  try {
    // req.user is already populated by the auth guard middleware
    res.status(200).json({
      status: 'success',
      user: {
        id: req.user._id,
        fullName: req.user.fullName,
        email: req.user.email,
        username: req.user.username,
        bio: req.user.bio,
        location: req.user.location,
        category: req.user.category,
        avatarUrl: req.user.avatarUrl,
        bannerUrl: req.user.bannerUrl,
        profileImage: req.user.profileImage || '',
        bannerImage: req.user.bannerImage || '',
        totalStars: req.user.totalStars,
        walletBalance: req.user.walletBalance,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user profile details
 * @route   PUT /api/v1/users/me
 * @access  Private
 */
const updateProfile = async (req, res, next) => {
  try {
    const { fullName, email, username, bio, location, category } = req.body;
    const userId = req.user._id;

    const updates = {};
    if (fullName) updates.fullName = fullName.trim();
    if (bio !== undefined) updates.bio = bio.trim();
    if (location !== undefined) updates.location = location.trim();
    if (category) updates.category = category;

    // 1. Email validation & uniqueness check (if updated)
    if (email && email.trim().toLowerCase() !== (req.user.email || '').toLowerCase()) {
      const emailLower = email.trim().toLowerCase();
      if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(emailLower)) {
        const error = new Error('Please provide a valid email address');
        error.statusCode = 400;
        return next(error);
      }

      let emailTaken;
      if (connectDB.isDbOffline()) {
        emailTaken = mockUsers.find(u => u.email && u.email.toLowerCase() === emailLower && u._id !== userId);
      } else {
        emailTaken = await User.findOne({ email: emailLower, _id: { $ne: userId } });
      }

      if (emailTaken) {
        const error = new Error('Email address is already taken by another account');
        error.statusCode = 400;
        return next(error);
      }
      updates.email = emailLower;
    }

    // 2. Username validation & uniqueness check (if updated)
    if (username && username.trim().toLowerCase() !== (req.user.username || '').toLowerCase()) {
      const usernameLower = username.trim().toLowerCase();
      
      // Enforce URL-friendly alphanumeric / no-spaces format
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(usernameLower)) {
        const error = new Error('Username must be between 3 and 30 characters and can only contain letters, numbers, and underscores');
        error.statusCode = 400;
        return next(error);
      }

      let usernameTaken;
      if (connectDB.isDbOffline()) {
        usernameTaken = mockUsers.find(u => u.username && u.username.toLowerCase() === usernameLower && u._id !== userId);
      } else {
        usernameTaken = await User.findOne({ username: usernameLower, _id: { $ne: userId } });
      }

      if (usernameTaken) {
        const error = new Error('Username is already taken');
        error.statusCode = 400;
        return next(error);
      }
      updates.username = usernameLower;
    }

    // 3. Save profile updates
    let updatedUser;
    if (connectDB.isDbOffline()) {
      updatedUser = await mockUserRepo.findByIdAndUpdate(userId, updates);
    } else {
      updatedUser = await User.findByIdAndUpdate(userId, updates, {
        new: true, // returns updated doc
        runValidators: true // runs schema validation checks
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        username: updatedUser.username,
        bio: updatedUser.bio,
        location: updatedUser.location,
        category: updatedUser.category,
        avatarUrl: updatedUser.avatarUrl,
        bannerUrl: updatedUser.bannerUrl,
        profileImage: updatedUser.profileImage || '',
        bannerImage: updatedUser.bannerImage || '',
        totalStars: updatedUser.totalStars,
        walletBalance: updatedUser.walletBalance,
        updatedAt: updatedUser.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change user password
 * @route   PUT /api/v1/users/me/password
 * @access  Private
 */
const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      const error = new Error('Please provide both your current and new passwords');
      error.statusCode = 400;
      return next(error);
    }

    if (newPassword.length < 6) {
      const error = new Error('New password must be at least 6 characters long');
      error.statusCode = 400;
      return next(error);
    }

    // 1. Fetch user (making sure password is selected)
    let user;
    if (connectDB.isDbOffline()) {
      user = await mockUserRepo.findById(req.user._id);
    } else {
      user = await User.findById(req.user._id).select('+password');
    }

    // 2. Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      const error = new Error('The current password you entered is incorrect');
      error.statusCode = 401;
      return next(error);
    }

    // 3. Save new password
    if (connectDB.isDbOffline()) {
      await mockUserRepo.findByIdAndUpdate(user._id, { password: newPassword });
    } else {
      user.password = newPassword;
      await user.save(); // pre-save hook automatically encrypts the password
    }

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete user account
 * @route   DELETE /api/v1/users/me
 * @access  Private
 */
const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    if (connectDB.isDbOffline()) {
      await mockUserRepo.findByIdAndDelete(userId);
    } else {
      // 1. Delete all creations by this user
      await Creation.deleteMany({ creator: userId });

      // 2. Delete all collab requests where this user is sender or receiver
      await CollabRequest.deleteMany({
        $or: [{ sender: userId }, { receiver: userId }]
      });

      // 3. Delete all collab chats involving this user
      await CollabChat.deleteMany({ participants: userId });

      // 4. Delete all reading progress logs of this user
      await ReadingProgress.deleteMany({ user: userId });

      // 5. Finally, delete user profile itself
      await User.findByIdAndDelete(userId);

      logger.info('User account deleted successfully with all associated data cascading.', { userId });
    }

    res.status(200).json({
      status: 'success',
      message: 'Account deleted successfully. All data purged.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload profile photo
 * @route   POST /api/v1/users/me/avatar
 * @access  Private
 */
const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error('Please upload an image file.');
      error.statusCode = 400;
      return next(error);
    }

    const relativePath = `/uploads/${req.file.filename}`;
    const userId = req.user._id;

    let updatedUser;
    if (connectDB.isDbOffline()) {
      updatedUser = await mockUserRepo.findByIdAndUpdate(userId, {
        profileImage: relativePath,
        avatarUrl: relativePath
      });
    } else {
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { profileImage: relativePath, avatarUrl: relativePath },
        { new: true, runValidators: true }
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Profile photo uploaded successfully',
      user: {
        id: updatedUser._id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        username: updatedUser.username,
        bio: updatedUser.bio,
        location: updatedUser.location,
        category: updatedUser.category,
        avatarUrl: updatedUser.avatarUrl,
        bannerUrl: updatedUser.bannerUrl,
        profileImage: updatedUser.profileImage || '',
        bannerImage: updatedUser.bannerImage || '',
        totalStars: updatedUser.totalStars,
        walletBalance: updatedUser.walletBalance,
        updatedAt: updatedUser.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload cover banner image
 * @route   POST /api/v1/users/me/banner
 * @access  Private
 */
const uploadBanner = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error('Please upload an image file.');
      error.statusCode = 400;
      return next(error);
    }

    const relativePath = `/uploads/${req.file.filename}`;
    const userId = req.user._id;

    let updatedUser;
    if (connectDB.isDbOffline()) {
      updatedUser = await mockUserRepo.findByIdAndUpdate(userId, {
        bannerImage: relativePath,
        bannerUrl: relativePath
      });
    } else {
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { bannerImage: relativePath, bannerUrl: relativePath },
        { new: true, runValidators: true }
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Cover banner uploaded successfully',
      user: {
        id: updatedUser._id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        username: updatedUser.username,
        bio: updatedUser.bio,
        location: updatedUser.location,
        category: updatedUser.category,
        avatarUrl: updatedUser.avatarUrl,
        bannerUrl: updatedUser.bannerUrl,
        profileImage: updatedUser.profileImage || '',
        bannerImage: updatedUser.bannerImage || '',
        totalStars: updatedUser.totalStars,
        walletBalance: updatedUser.walletBalance,
        updatedAt: updatedUser.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Fetch profile photo
 * @route   GET /api/v1/users/:id/avatar
 * @access  Private
 */
const fetchAvatar = async (req, res, next) => {
  try {
    const userId = req.params.id || req.user?._id;
    let user;
    if (connectDB.isDbOffline()) {
      user = await mockUserRepo.findById(userId);
    } else {
      user = await User.findById(userId);
    }

    if (!user || (!user.avatarUrl && !user.profileImage)) {
      const error = new Error('Profile photo not found.');
      error.statusCode = 404;
      return next(error);
    }

    const imagePath = user.profileImage || user.avatarUrl;
    if (imagePath.startsWith('http')) {
      return res.redirect(imagePath);
    }

    const absolutePath = path.join(__dirname, '../../', imagePath);
    if (!fs.existsSync(absolutePath)) {
      const error = new Error('File does not exist on server.');
      error.statusCode = 404;
      return next(error);
    }

    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Fetch cover banner
 * @route   GET /api/v1/users/:id/banner
 * @access  Private
 */
const fetchBanner = async (req, res, next) => {
  try {
    const userId = req.params.id || req.user?._id;
    let user;
    if (connectDB.isDbOffline()) {
      user = await mockUserRepo.findById(userId);
    } else {
      user = await User.findById(userId);
    }

    if (!user || (!user.bannerUrl && !user.bannerImage)) {
      const error = new Error('Cover banner not found.');
      error.statusCode = 404;
      return next(error);
    }

    const imagePath = user.bannerImage || user.bannerUrl;
    if (imagePath.startsWith('http')) {
      return res.redirect(imagePath);
    }

    const absolutePath = path.join(__dirname, '../../', imagePath);
    if (!fs.existsSync(absolutePath)) {
      const error = new Error('File does not exist on server.');
      error.statusCode = 404;
      return next(error);
    }

    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get profile details of any user by ID
 * @route   GET /api/v1/users/:id
 * @access  Private
 */
const getUserProfile = async (req, res, next) => {
  try {
    const userId = req.params.id;
    let user;

    if (connectDB.isDbOffline()) {
      user = await mockUserRepo.findById(userId);
    } else {
      user = await User.findById(userId).select('-password');
    }

    if (!user) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      return next(error);
    }

    res.status(200).json({
      status: 'success',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        bio: user.bio,
        location: user.location,
        category: user.category,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        profileImage: user.profileImage || '',
        bannerImage: user.bannerImage || '',
        totalStars: user.totalStars,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  getUserProfile,
  updateProfile,
  updatePassword,
  deleteAccount,
  uploadAvatar,
  uploadBanner,
  fetchAvatar,
  fetchBanner
};
