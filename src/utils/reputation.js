const User = require('../models/user.model');
const Creation = require('../models/creation.model');
const logger = require('../config/logger');
const connectDB = require('../config/db');

const calculateCategoryStars = (value, brackets) => {
  let stars = 0;
  let temp = value;
  for (const bracket of brackets) {
    if (temp <= 0) break;
    const take = Math.min(temp, bracket.size);
    stars += take / bracket.divisor;
    temp -= take;
  }
  return stars;
};

const calculateUserStars = (likes, comments, saves) => {
  const likeBrackets = [
    { size: 5000, divisor: 50 },     // Bronze: 1 star per 50 likes
    { size: 20000, divisor: 100 },   // Silver: 1 star per 100 likes
    { size: 60000, divisor: 200 },   // Gold: 1 star per 200 likes
    { size: Infinity, divisor: 500 } // Diamond/Legend: 1 star per 500 likes
  ];

  const commentBrackets = [
    { size: 1000, divisor: 10 },     // Bronze: 1 star per 10 comments
    { size: 4000, divisor: 20 },     // Silver: 1 star per 20 comments
    { size: 10500, divisor: 35 },    // Gold: 1 star per 35 comments
    { size: Infinity, divisor: 50 }  // Diamond/Legend: 1 star per 50 comments
  ];

  // Saves (bookmarks): 1 star per save (no change across tiers)
  const saveBrackets = [
    { size: Infinity, divisor: 1 }
  ];

  const starsFromLikes = calculateCategoryStars(likes, likeBrackets);
  const starsFromComments = calculateCategoryStars(comments, commentBrackets);
  const starsFromSaves = calculateCategoryStars(saves, saveBrackets);

  const total = starsFromLikes + starsFromComments + starsFromSaves;
  return Math.round(total * 10) / 10; // Round to 1 decimal place
};

const updateCreatorStars = async (creatorId) => {
  try {
    if (!creatorId) return 0;
    
    if (connectDB.isDbOffline()) {
      const { mockUsers, mockCreations } = require('../models/mock.db');
      const user = mockUsers.find(u => u._id === creatorId.toString());
      if (!user) return 0;

      const creations = mockCreations.filter(c => {
        const cId = c.creator && c.creator._id ? c.creator._id : c.creator;
        return cId.toString() === creatorId.toString();
      });

      let likesCount = 0;
      let commentsCount = 0;
      let bookmarksCount = 0;

      for (const creation of creations) {
        likesCount += creation.likes ? creation.likes.length : 0;
        commentsCount += creation.commentsCount || 0;
        bookmarksCount += creation.bookmarks ? creation.bookmarks.length : 0;
      }

      const newStars = calculateUserStars(likesCount, commentsCount, bookmarksCount);
      user.totalStars = newStars;
      logger.info(`Updated MOCK user reputation stars: user=${creatorId} likes=${likesCount} comments=${commentsCount} saves=${bookmarksCount} stars=${newStars}`);
      return newStars;
    } else {
      // Mongoose implementation
      const creations = await Creation.find({ creator: creatorId });
      
      let likesCount = 0;
      let commentsCount = 0;
      let bookmarksCount = 0;
      
      for (const creation of creations) {
        likesCount += creation.likes ? creation.likes.length : 0;
        commentsCount += creation.commentsCount || 0;
        bookmarksCount += creation.bookmarks ? creation.bookmarks.length : 0;
      }
      
      const newStars = calculateUserStars(likesCount, commentsCount, bookmarksCount);
      
      await User.findByIdAndUpdate(creatorId, { totalStars: newStars });
      
      logger.info(`Updated user reputation stars: user=${creatorId} likes=${likesCount} comments=${commentsCount} saves=${bookmarksCount} stars=${newStars}`);
      return newStars;
    }
  } catch (err) {
    logger.error(`Failed to update creator reputation stars: creatorId=${creatorId}`, err);
    return 0;
  }
};

module.exports = {
  calculateUserStars,
  updateCreatorStars
};
