const Creation = require('../models/creation.model');
const ReadingProgress = require('../models/readingProgress.model');
const connectDB = require('../config/db');
const {
  mockCreationRepo,
  mockReadingProgressRepo,
  mockCreations
} = require('../models/mock.db');

/**
 * @desc    Get featured long-form content
 * @route   GET /api/v1/read/featured
 * @access  Public
 */
const getFeatured = async (req, res, next) => {
  try {
    let featured = null;

    if (connectDB.isDbOffline()) {
      // Return "The Space Between Us" mock creation
      featured = mockCreations.find(c => c._id === 'mock-creation-4') || mockCreations.find(c => ['Story', 'Poem', 'Essay'].includes(c.category));
      if (featured) {
        featured = await mockCreationRepo.findById(featured._id);
      }
    } else {
      // Find the story/poem/essay with the most likes
      featured = await Creation.findOne({
        category: { $in: ['Story', 'Poem', 'Essay'] }
      })
        .populate('creator', 'fullName username category totalStars avatarUrl')
        .sort({ 'likes.length': -1, createdAt: -1 });
    }

    res.status(200).json({
      status: 'success',
      featured
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's continue reading shelf
 * @route   GET /api/v1/read/continue
 * @access  Private
 */
const getContinueReading = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();

    let list;

    if (connectDB.isDbOffline()) {
      list = await mockReadingProgressRepo.find({ user: userId });
      // Sort by updatedAt desc
      list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } else {
      list = await ReadingProgress.find({ user: userId })
        .populate({
          path: 'creation',
          populate: {
            path: 'creator',
            select: 'fullName username category totalStars avatarUrl'
          }
        })
        .sort({ updatedAt: -1 });
    }

    res.status(200).json({
      status: 'success',
      results: list.length,
      progressList: list
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get new and popular reading content
 * @route   GET /api/v1/read/new-popular
 * @access  Public
 */
const getNewAndPopular = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    let list;
    let pagination = {};

    if (connectDB.isDbOffline()) {
      list = mockCreations.filter(c => ['Story', 'Poem', 'Essay'].includes(c.category));
      // Sort by likes length, then date
      list.sort((a, b) => b.likes.length - a.likes.length || b.createdAt - a.createdAt);
      list = list.map(c => mockCreationRepo._populateCreator(c));
    } else {
      const parsedPage = parseInt(page, 10) || 1;
      const parsedLimit = parseInt(limit, 10) || 10; // Default limit 10
      const skip = (parsedPage - 1) * parsedLimit;

      const total = await Creation.countDocuments({
        category: { $in: ['Story', 'Poem', 'Essay'] }
      });

      list = await Creation.find({
        category: { $in: ['Story', 'Poem', 'Essay'] }
      })
        .populate('creator', 'fullName username category totalStars avatarUrl')
        .sort({ 'likes.length': -1, createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);

      pagination = {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      };
    }

    res.status(200).json({
      status: 'success',
      results: list.length,
      pagination: Object.keys(pagination).length ? pagination : undefined,
      creations: list
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update reading progress on a creation
 * @route   POST /api/v1/read/:id/progress
 * @access  Private
 */
const updateProgress = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const userId = req.user._id.toString();
    const { progress } = req.body;

    if (progress === undefined || progress < 0 || progress > 100) {
      const error = new Error('Please provide progress percentage (0 - 100)');
      error.statusCode = 400;
      return next(error);
    }

    let progressRecord;

    if (connectDB.isDbOffline()) {
      // Verify creation exists
      const creation = await mockCreationRepo.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      progressRecord = await mockReadingProgressRepo.createOrUpdateProgress({
        user: userId,
        creation: creationId,
        progress
      });
    } else {
      const creation = await Creation.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      // Upsert progress
      progressRecord = await ReadingProgress.findOneAndUpdate(
        { user: userId, creation: creationId },
        { progress, updatedAt: new Date() },
        { new: true, upsert: true }
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Reading progress updated successfully',
      progressRecord
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get reading creations filtered by category (Poem, Story, Essay, Quote)
 * @route   GET /api/v1/read/creations
 * @access  Public
 */
const getReadCreations = async (req, res, next) => {
  try {
    const { category, search, page, limit } = req.query;

    let creations;
    let pagination = {};

    if (connectDB.isDbOffline()) {
      let list = [...mockCreations];
      
      if (category && category !== 'For You') {
        const cleanCategory = category.toLowerCase().trim();
        list = list.filter(c => {
          const cat = (c.category || '').toLowerCase();
          if (cleanCategory.includes('stories') || cleanCategory.includes('story')) {
            return cat === 'story';
          }
          if (cleanCategory.includes('poetry') || cleanCategory.includes('poem')) {
            return cat === 'poem';
          }
          if (cleanCategory.includes('essay')) {
            return cat === 'essay';
          }
          if (cleanCategory.includes('quote')) {
            return cat === 'quote';
          }
          return cat.includes(cleanCategory) || cleanCategory.includes(cat);
        });
      } else {
        // Fallback to all reading categories
        list = list.filter(c => ['Story', 'Poem', 'Essay', 'Quote'].includes(c.category));
      }

      if (search) {
        const s = search.toLowerCase();
        const { mockUsers } = require('../models/mock.db');
        list = list.filter(c => {
          const creatorId = c.creator && c.creator._id ? c.creator._id : c.creator;
          const user = mockUsers.find(u => u._id === creatorId);
          const creatorName = user ? user.fullName : 'Meera Iyer';
          const creatorUsername = user ? user.username : 'meera_iyer';

          return (c.title && c.title.toLowerCase().includes(s)) ||
            (c.caption && c.caption.toLowerCase().includes(s)) ||
            (c.hashtags && c.hashtags.some(t => t && t.toLowerCase().includes(s))) ||
            (creatorName && creatorName.toLowerCase().includes(s)) ||
            (creatorUsername && creatorUsername.toLowerCase().includes(s));
        });
      }

      creations = list.map(c => mockCreationRepo._populateCreator(c));
    } else {
      const query = {};

      if (category && category !== 'For You') {
        const cleanCategory = category.toLowerCase().trim();
        if (cleanCategory.includes('stories') || cleanCategory.includes('story')) {
          query.category = 'Story';
        } else if (cleanCategory.includes('poetry') || cleanCategory.includes('poem')) {
          query.category = 'Poem';
        } else if (cleanCategory.includes('essay')) {
          query.category = 'Essay';
        } else if (cleanCategory.includes('quote')) {
          query.category = 'Quote';
        } else {
          query.category = new RegExp(cleanCategory, 'i');
        }
      } else {
        query.category = { $in: ['Story', 'Poem', 'Essay', 'Quote'] };
      }

      if (search) {
        const regex = new RegExp(search, 'i');
        
        let userIds = [];
        try {
          const User = require('../models/user.model');
          const matchingUsers = await User.find({
            $or: [
              { fullName: regex },
              { username: regex }
            ]
          }).select('_id');
          userIds = matchingUsers.map(u => u._id);
        } catch (err) {
          // ignore
        }

        query.$or = [
          { title: regex },
          { caption: regex },
          { hashtags: regex }
        ];

        if (userIds.length > 0) {
          query.$or.push({ creator: { $in: userIds } });
        }
      }

      const parsedPage = parseInt(page, 10) || 1;
      const parsedLimit = parseInt(limit, 10) || 20; // Default limit 20
      const skip = (parsedPage - 1) * parsedLimit;

      const total = await Creation.countDocuments(query);

      creations = await Creation.find(query)
        .populate('creator', 'fullName username category totalStars avatarUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);

      pagination = {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      };
    }

    res.status(200).json({
      status: 'success',
      results: creations.length,
      pagination: Object.keys(pagination).length ? pagination : undefined,
      creations
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFeatured,
  getContinueReading,
  getNewAndPopular,
  updateProgress,
  getReadCreations
};
