const Notification = require('../models/notification.model');
const connectDB = require('../config/db');
const { mockNotificationRepo } = require('../models/mock.db');

/**
 * @desc    Fetch paginated notifications for the logged-in user
 * @route   GET /api/v1/notifications
 * @access  Private
 */
const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const { page, limit } = req.query;

    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 20;
    const skip = (parsedPage - 1) * parsedLimit;

    let notifications;
    let total = 0;

    if (connectDB.isDbOffline()) {
      const allNotifications = await mockNotificationRepo.find({ recipient: userId });
      total = allNotifications.length;
      notifications = allNotifications.slice(skip, skip + parsedLimit);
    } else {
      total = await Notification.countDocuments({ recipient: userId });
      notifications = await Notification.find({ recipient: userId })
        .populate('actor', 'fullName username avatarUrl profileImage')
        .populate('creation', 'title category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);
    }

    // Format absolute URLs for actors' profile/avatar images
    const getAbsoluteUrl = (relativePath) => {
      if (!relativePath) return '';
      if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
      }
      const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
      return `${req.protocol}://${req.get('host')}${cleanPath}`;
    };

    const formattedNotifications = notifications.map((n) => {
      const nObj = typeof n.toObject === 'function' ? n.toObject() : { ...n };
      if (nObj.actor) {
        if (nObj.actor.avatarUrl && nObj.actor.avatarUrl.startsWith('/uploads/')) {
          nObj.actor.avatarUrl = getAbsoluteUrl(nObj.actor.avatarUrl);
        }
        if (nObj.actor.profileImage && nObj.actor.profileImage.startsWith('/uploads/')) {
          nObj.actor.profileImage = getAbsoluteUrl(nObj.actor.profileImage);
        }
      }
      return nObj;
    });

    res.status(200).json({
      status: 'success',
      results: formattedNotifications.length,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      },
      notifications: formattedNotifications
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark a specific notification as read
 * @route   PATCH /api/v1/notifications/:id/read
 * @access  Private
 */
const markAsRead = async (req, res, next) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user._id.toString();

    let notification;

    if (connectDB.isDbOffline()) {
      notification = await mockNotificationRepo.findById(notificationId);
      if (!notification) {
        const error = new Error('Notification not found.');
        error.statusCode = 404;
        return next(error);
      }

      if (notification.recipient.toString() !== userId) {
        const error = new Error('Unauthorized action.');
        error.statusCode = 403;
        return next(error);
      }

      notification = await mockNotificationRepo.findByIdAndUpdate(notificationId, { isRead: true });
    } else {
      notification = await Notification.findById(notificationId);
      if (!notification) {
        const error = new Error('Notification not found.');
        error.statusCode = 404;
        return next(error);
      }

      if (notification.recipient.toString() !== userId) {
        const error = new Error('Unauthorized action.');
        error.statusCode = 403;
        return next(error);
      }

      notification.isRead = true;
      await notification.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Notification marked as read.',
      notification
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all notifications for the user as read
 * @route   PATCH /api/v1/notifications/read-all
 * @access  Private
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();

    if (connectDB.isDbOffline()) {
      await mockNotificationRepo.updateMany({ recipient: userId, isRead: false }, { isRead: true });
    } else {
      await Notification.updateMany({ recipient: userId, isRead: false }, { isRead: true });
    }

    res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead
};
