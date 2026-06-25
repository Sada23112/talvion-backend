const Notification = require('../models/notification.model');
const { mockNotificationRepo } = require('../models/mock.db');
const connectDB = require('../config/db');
const logger = require('../config/logger');

class NotificationService {
  /**
   * Dispatches a new notification to the database.
   * @param {string} actor - ID of the user performing the action
   * @param {string} recipient - ID of the user receiving the notification
   * @param {string} type - One of: like, comment, message, collab_request, collab_accept, follow, tip, mention
   * @param {string} [creationId] - ID of the associated creation (optional)
   */
  static async createNotification(actor, recipient, type, creationId = null, message = null, options = {}) {
    const { session, throwOnError = false } = options;
    try {
      if (actor.toString() === recipient.toString()) {
        return null; // Do not notify oneself
      }

      const notifData = {
        actor,
        recipient,
        type,
      };
      
      if (creationId) {
        notifData.creation = creationId;
      }

      if (message) {
        notifData.message = message;
      }

      let notification;
      if (connectDB.isDbOffline()) {
        notification = await mockNotificationRepo.create(notifData);
      } else {
        if (session) {
          const results = await Notification.create([notifData], { session });
          notification = results[0];
        } else {
          notification = await Notification.create(notifData);
        }
      }

      return notification;
    } catch (error) {
      logger.error(`Error creating ${type} notification`, error);
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }
}

module.exports = NotificationService;
