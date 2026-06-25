const Creation = require('../models/creation.model');
const Notification = require('../models/notification.model');
const ReadingProgress = require('../models/readingProgress.model');

const Report = require('../models/report.model');
const connectDB = require('../config/db');
const logger = require('../config/logger');
const { mockCreationRepo, mockNotificationRepo, mockReportRepo } = require('../models/mock.db');
const { updateCreatorStars } = require('../utils/reputation');
const EconomyService = require('../services/economy.service');

const getAbsoluteUrl = (req, relativePath) => {
  if (!relativePath) return '';
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${req.protocol}://${req.get('host')}${cleanPath}`;
};

const formatCreationResponse = (req, creationDoc) => {
  const c = typeof creationDoc.toObject === 'function' ? creationDoc.toObject() : { ...creationDoc };
  
  c.commentsCount = c.commentsCount || 0;

  if (c.content && (c.content.startsWith('/uploads/') || c.category === 'Art' || c.category === 'Photo')) {
    c.content = getAbsoluteUrl(req, c.content);
  }
  
  if (c.media && Array.isArray(c.media)) {
    c.media = c.media.map(item => ({
      ...item,
      url: getAbsoluteUrl(req, item.url)
    }));
  }
  
  if (c.creator) {
    if (c.creator.avatarUrl && c.creator.avatarUrl.startsWith('/uploads/')) {
      c.creator.avatarUrl = getAbsoluteUrl(req, c.creator.avatarUrl);
    }
    if (c.creator.profileImage && c.creator.profileImage.startsWith('/uploads/')) {
      c.creator.profileImage = getAbsoluteUrl(req, c.creator.profileImage);
    }
    if (c.creator.bannerUrl && c.creator.bannerUrl.startsWith('/uploads/')) {
      c.creator.bannerUrl = getAbsoluteUrl(req, c.creator.bannerUrl);
    }
    if (c.creator.bannerImage && c.creator.bannerImage.startsWith('/uploads/')) {
      c.creator.bannerImage = getAbsoluteUrl(req, c.creator.bannerImage);
    }
  }
  
  return c;
};

/**
 * @desc    Fetch all creations with optional category and search filters
 * @route   GET /api/v1/creations
 * @access  Public
 */
const getCreations = async (req, res, next) => {
  try {
    const { category, search, page, limit, creator, isJoint, status } = req.query;

    let creations;
    let pagination = {};

    if (connectDB.isDbOffline()) {
      const allCreations = await mockCreationRepo.find({ category, search, creator, isJoint, status });
      const parsedPage = parseInt(page, 10) || 1;
      const parsedLimit = parseInt(limit, 10) || 20;
      const skip = (parsedPage - 1) * parsedLimit;

      creations = allCreations.slice(skip, skip + parsedLimit);
      pagination = {
        page: parsedPage,
        limit: parsedLimit,
        total: allCreations.length,
        pages: Math.ceil(allCreations.length / parsedLimit)
      };
    } else {
      const query = {};

      if (category) {
        // Allow query matching like mock DB (singular/plural)
        const cleanCategory = category.toLowerCase().replace('✍️ ', '').replace('🎨 ', '').replace('📷 ', '').replace('📖 ', '').trim();
        if (cleanCategory.startsWith('writer') || cleanCategory.startsWith('poem')) {
          query.category = { $in: ['Poem', 'Story'] };
        } else if (cleanCategory.startsWith('artist') || cleanCategory.startsWith('art')) {
          query.category = 'Art';
        } else if (cleanCategory.startsWith('photo')) {
          query.category = 'Photo';
        } else if (cleanCategory.startsWith('story')) {
          query.category = 'Story';
        } else {
          // Fallback regular expression matching
          query.category = new RegExp(cleanCategory, 'i');
        }
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
          logger.error('Failed to query users during creation search:', err);
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

      if (creator) {
        query.creator = creator;
      }

      if (isJoint !== undefined) {
        query.isJoint = isJoint === 'true' || isJoint === true;
      }

      // Filter by status (default to published, matching empty/undefined status as published)
      if (status === 'draft') {
        query.status = 'draft';
      } else {
        query.status = { $ne: 'draft' };
      }

      // Parse pagination
      const parsedPage = parseInt(page, 10) || 1;
      const parsedLimit = parseInt(limit, 10) || 20; // Default limit 20
      const skip = (parsedPage - 1) * parsedLimit;

      const totalCreations = await Creation.countDocuments(query);

      creations = await Creation.find(query)
        .populate('creator', 'fullName username category totalStars avatarUrl')
        .populate('mentions', 'fullName username category totalStars avatarUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);

      pagination = {
        page: parsedPage,
        limit: parsedLimit,
        total: totalCreations,
        pages: Math.ceil(totalCreations / parsedLimit)
      };
    }

    res.status(200).json({
      status: 'success',
      results: creations.length,
      pagination: Object.keys(pagination).length ? pagination : undefined,
      creations: creations.map(c => formatCreationResponse(req, c))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Fetch a single creation by ID
 * @route   GET /api/v1/creations/:id
 * @access  Public
 */
const getCreationById = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    let creation;

    if (connectDB.isDbOffline()) {
      creation = await mockCreationRepo.findById(creationId);
    } else {
      creation = await Creation.findById(creationId)
        .populate('creator', 'fullName username category totalStars avatarUrl profileImage bannerUrl bannerImage')
        .populate('mentions', 'fullName username category totalStars avatarUrl profileImage');
    }

    if (!creation) {
      const error = new Error('Creation not found');
      error.statusCode = 404;
      return next(error);
    }

    res.status(200).json({
      status: 'success',
      creation: formatCreationResponse(req, creation)
    });
  } catch (error) {
    if (error.name === 'CastError') {
      const castError = new Error('Creation not found');
      castError.statusCode = 404;
      return next(castError);
    }
    next(error);
  }
};

/**
 * @desc    Create a new creation
 * @route   POST /api/v1/creations
 * @access  Private
 */
const createCreation = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Helper to parse arrays from JSON string or comma-separated values (for multipart support)
    const parseArray = (field) => {
      if (!field) return [];
      if (Array.isArray(field)) return field;
      try {
        const parsed = JSON.parse(field);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {}
      if (typeof field === 'string') {
        return field.split(',').map(s => s.trim()).filter(Boolean);
      }
      return [];
    };

    const title = req.body.title ? req.body.title.trim() : '';
    const caption = req.body.caption ? req.body.caption.trim() : '';
    const category = req.body.category ? req.body.category.trim() : '';
    let content = req.body.content ? req.body.content.trim() : '';
    const gradientColors = parseArray(req.body.gradientColors);
    const rawHashtags = parseArray(req.body.hashtags);
    const pages = parseArray(req.body.pages);
    const tags = parseArray(req.body.tags);
    const mentions = parseArray(req.body.mentions);
    const isJoint = req.body.isJoint === 'true' || req.body.isJoint === true;
    const is18Plus = req.body.is18Plus === 'true' || req.body.is18Plus === true;
    const readTime = req.body.readTime ? req.body.readTime.trim() : '';
    const status = req.body.status ? req.body.status.trim() : 'published';
    const visibility = req.body.visibility ? req.body.visibility.trim() : 'public';

    // Validate category
    const validCategories = ['Art', 'Photo', 'Story', 'Poem', 'Essay', 'Quote'];
    if (!category) {
      const error = new Error(`Please specify a creation category (${validCategories.join(', ')})`);
      error.statusCode = 400;
      return next(error);
    }

    // Standardize category casing
    const matchedCategory = validCategories.find(c => c.toLowerCase() === category.toLowerCase());
    if (!matchedCategory) {
      const error = new Error(`Category must be either: ${validCategories.join(', ')}`);
      error.statusCode = 400;
      return next(error);
    }

    // Clean hashtags (strip leading '#' characters)
    const hashtags = rawHashtags.map(tag => tag.startsWith('#') ? tag.slice(1) : tag);

    // Process media files if uploaded via multipart
    const media = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        media.push({
          url: file.path,
          filename: file.filename,
          mimetype: file.mimetype,
          size: file.size
        });
      }
      // If content is empty and it's a media creation, set content to the first file's relative path
      if (!content && (matchedCategory === 'Art' || matchedCategory === 'Photo')) {
        content = media[0].url;
      }
    }

    // If it's a media category (Art/Photo) and there's no media or content, throw error
    if ((matchedCategory === 'Art' || matchedCategory === 'Photo') && !content && media.length === 0) {
      const error = new Error('Please upload at least one image/video or provide an image URL for Art/Photo creations.');
      error.statusCode = 400;
      return next(error);
    }

    // Extra post check
    if (status === 'published') {
      try {
        await EconomyService.chargeForExtraPost(userId);
      } catch (err) {
        err.statusCode = 400;
        return next(err);
      }
    }

    let creation;

    if (connectDB.isDbOffline()) {
      creation = await mockCreationRepo.create({
        creator: userId,
        title,
        caption,
        category: matchedCategory,
        content,
        gradientColors,
        hashtags,
        pages,
        tags,
        mentions,
        isJoint,
        is18Plus,
        media,
        readTime,
        status,
        visibility
      });
    } else {
      creation = await Creation.create({
        creator: userId,
        title,
        caption,
        category: matchedCategory,
        content,
        gradientColors,
        hashtags,
        pages,
        tags,
        mentions,
        isJoint,
        is18Plus,
        media,
        readTime,
        status,
        visibility
      });
      // Populate creator and mentions details for the response
      await creation.populate([
        { path: 'creator', select: 'fullName username category totalStars avatarUrl profileImage bannerUrl bannerImage' },
        { path: 'mentions', select: 'fullName username category totalStars avatarUrl profileImage' }
      ]);
    }

    // Trigger mention notifications
    if (mentions && mentions.length > 0 && status === 'published') {
      const NotificationService = require('../services/notification.service');
      for (const mentionedId of mentions) {
        await NotificationService.createNotification(userId, mentionedId, 'mention', creation._id || creation.id);
      }
    }

    res.status(201).json({
      status: 'success',
      message: status === 'draft' ? 'Draft saved successfully' : 'Creation published successfully',
      creation: formatCreationResponse(req, creation)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle like state on a creation
 * @route   POST /api/v1/creations/:id/like
 * @access  Private
 */
const likeCreation = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const userId = req.user._id.toString();

    let creation;

    if (connectDB.isDbOffline()) {
      creation = await mockCreationRepo.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      const likes = creation.likes || [];
      const index = likes.indexOf(userId);

      if (index === -1) {
        likes.push(userId);
        // Trigger notification
        const creatorId = creation.creator && creation.creator._id ? creation.creator._id.toString() : creation.creator.toString();
        if (creatorId !== userId) {
          await mockNotificationRepo.create({
            recipient: creatorId,
            actor: userId,
            type: 'like',
            creation: creationId
          });
        }
      } else {
        likes.splice(index, 1);
      }

      creation = await mockCreationRepo.findByIdAndUpdate(creationId, { likes });
      
      // Update mock creator reputation stars
      const creatorId = creation.creator && creation.creator._id ? creation.creator._id.toString() : creation.creator.toString();
      await updateCreatorStars(creatorId);
    } else {
      creation = await Creation.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      const index = creation.likes.indexOf(userId);

      if (index === -1) {
        creation.likes.push(userId);
        // Trigger notification
        const creatorId = creation.creator && creation.creator._id ? creation.creator._id.toString() : creation.creator.toString();
        if (creatorId !== userId) {
          await Notification.create({
            recipient: creatorId,
            actor: userId,
            type: 'like',
            creation: creationId
          });
        }
      } else {
        creation.likes.splice(index, 1);
      }

      await creation.save();
      
      // Update creator's reputation stars
      const creatorId = creation.creator && creation.creator._id ? creation.creator._id.toString() : creation.creator.toString();
      await updateCreatorStars(creatorId);

      await creation.populate('creator', 'fullName username category totalStars avatarUrl');
    }

    const isLiked = creation.likes.includes(userId);

    res.status(200).json({
      status: 'success',
      message: isLiked ? 'Liked creation' : 'Unliked creation',
      likesCount: creation.likes.length,
      likes: creation.likes,
      isLiked
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Record a quill tip on a creation and notify both the sender
 *          and the creator (who actually earns the gems)
 * @route   POST /api/v1/creations/:id/quill
 * @access  Private
 */
const sendQuillNotification = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const senderId = req.user._id.toString();
    const senderName = req.user.fullName || 'Someone';
    const amount = parseInt(req.body.amount, 10);
    const isPremium = req.body.isPremium === true || req.body.isPremium === 'true';

    if (!amount || amount < 1 || amount > 3) {
      const error = new Error('Quill amount must be between 1 and 3');
      error.statusCode = 400;
      return next(error);
    }

    const artistGems = isPremium ? amount * 4 : amount * 2;
    const senderGems = isPremium ? Math.round(amount * 2.5) : amount * 1;

    let creatorId;
    let creatorName;

    if (connectDB.isDbOffline()) {
      const creation = await mockCreationRepo.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }
      creatorId = creation.creator && creation.creator._id ? creation.creator._id.toString() : creation.creator.toString();
      creatorName = (creation.creator && creation.creator.fullName) || 'the artist';
    } else {
      const creation = await Creation.findById(creationId).populate('creator', 'fullName');
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }
      creatorId = creation.creator._id.toString();
      creatorName = creation.creator.fullName || 'the artist';
    }

    if (creatorId === senderId) {
      const error = new Error('You cannot send a quill to your own post');
      error.statusCode = 400;
      return next(error);
    }

    const notificationRepo = connectDB.isDbOffline() ? mockNotificationRepo : Notification;

    // The artist actually receives the gems for this quill.
    await notificationRepo.create({
      recipient: creatorId,
      actor: senderId,
      type: 'quill_received',
      creation: creationId,
      message: `You have received ${artistGems} gems from ${senderName}`
    });
    // The sender gets a smaller "thank you" gem reward, split into the
    // two lines the app shows for a quill send.
    await notificationRepo.create({
      recipient: senderId,
      actor: creatorId,
      type: 'quill_sent',
      creation: creationId,
      message: `Quills sent to ${creatorName}`
    });
    await notificationRepo.create({
      recipient: senderId,
      actor: creatorId,
      type: 'quill_received',
      creation: creationId,
      message: `You have received ${senderGems} gems`
    });

    res.status(201).json({
      status: 'success',
      senderGems,
      artistGems
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle bookmark/save state on a creation
 * @route   POST /api/v1/creations/:id/bookmark
 * @access  Private
 */
const bookmarkCreation = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const userId = req.user._id.toString();

    let creation;

    if (connectDB.isDbOffline()) {
      creation = await mockCreationRepo.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      const bookmarks = creation.bookmarks || [];
      const index = bookmarks.indexOf(userId);

      if (index === -1) {
        bookmarks.push(userId);
      } else {
        bookmarks.splice(index, 1);
      }

      creation = await mockCreationRepo.findByIdAndUpdate(creationId, { bookmarks });

      // Update mock creator reputation stars
      const creatorId = creation.creator && creation.creator._id ? creation.creator._id.toString() : creation.creator.toString();
      await updateCreatorStars(creatorId);
    } else {
      creation = await Creation.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      const index = creation.bookmarks.indexOf(userId);

      if (index === -1) {
        creation.bookmarks.push(userId);
      } else {
        creation.bookmarks.splice(index, 1);
      }

      await creation.save();

      // Update creator's reputation stars
      const creatorId = creation.creator && creation.creator._id ? creation.creator._id.toString() : creation.creator.toString();
      await updateCreatorStars(creatorId);

      await creation.populate('creator', 'fullName username category totalStars avatarUrl');
    }

    const isBookmarked = creation.bookmarks.includes(userId);

    res.status(200).json({
      status: 'success',
      message: isBookmarked ? 'Bookmarked creation' : 'Removed bookmark',
      bookmarksCount: creation.bookmarks.length,
      bookmarks: creation.bookmarks,
      isBookmarked
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a creation
 * @route   DELETE /api/v1/creations/:id
 * @access  Private
 */
const deleteCreation = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const userId = req.user._id.toString();

    let creation;

    if (connectDB.isDbOffline()) {
      creation = await mockCreationRepo.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      // Check ownership (creator object matches userId string in mock repo wrap)
      const creatorIdStr = (typeof creation.creator === 'object') ? creation.creator._id : creation.creator;
      if (creatorIdStr !== userId) {
        const error = new Error('You do not have permission to delete this creation');
        error.statusCode = 403;
        return next(error);
      }

      await mockCreationRepo.findByIdAndDelete(creationId);
    } else {
      creation = await Creation.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      if (creation.creator.toString() !== userId) {
        const error = new Error('You do not have permission to delete this creation');
        error.statusCode = 403;
        return next(error);
      }

      await Creation.findByIdAndDelete(creationId);
      await ReadingProgress.deleteMany({ creation: creationId });
      logger.info('Creation and associated reading progress deleted successfully.', { creationId });
    }

    res.status(200).json({
      status: 'success',
      message: 'Creation deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current user's saved drafts
 * @route   GET /api/v1/creations/me/drafts
 * @access  Private
 */
const getMyDrafts = async (req, res, next) => {
  try {
    const userId = req.user._id;
    let drafts;

    if (connectDB.isDbOffline()) {
      drafts = await mockCreationRepo.find({ creator: userId, status: 'draft' });
    } else {
      drafts = await Creation.find({ creator: userId, status: 'draft' })
        .populate('creator', 'fullName username category totalStars avatarUrl profileImage bannerUrl bannerImage')
        .populate('mentions', 'fullName username category totalStars avatarUrl profileImage')
        .sort({ updatedAt: -1 });
    }

    res.status(200).json({
      status: 'success',
      results: drafts.length,
      creations: drafts.map(d => formatCreationResponse(req, d))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Edit/update an existing creation
 * @route   PATCH /api/v1/creations/:id
 * @access  Private
 */
const updateCreation = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const userId = req.user._id.toString();

    let creation;

    if (connectDB.isDbOffline()) {
      creation = await mockCreationRepo.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      const creatorIdStr = (typeof creation.creator === 'object') ? creation.creator._id : creation.creator;
      if (creatorIdStr !== userId) {
        const error = new Error('You do not have permission to edit this creation');
        error.statusCode = 403;
        return next(error);
      }
    } else {
      creation = await Creation.findById(creationId);
      if (!creation) {
        const error = new Error('Creation not found');
        error.statusCode = 404;
        return next(error);
      }

      if (creation.creator.toString() !== userId) {
        const error = new Error('You do not have permission to edit this creation');
        error.statusCode = 403;
        return next(error);
      }
    }

    // Process fields to update
    const updateData = {};
    const permittedFields = [
      'title',
      'caption',
      'category',
      'content',
      'pages',
      'gradientColors',
      'hashtags',
      'isJoint',
      'is18Plus',
      'readTime',
      'tags',
      'mentions',
      'status',
      'visibility'
    ];

    // Helper to parse arrays from JSON string or comma-separated values
    const parseArray = (field) => {
      if (!field) return [];
      if (Array.isArray(field)) return field;
      try {
        const parsed = JSON.parse(field);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {}
      if (typeof field === 'string') {
        return field.split(',').map(s => s.trim()).filter(Boolean);
      }
      return [];
    };

    permittedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (['pages', 'gradientColors', 'hashtags', 'tags', 'mentions'].includes(field)) {
          updateData[field] = parseArray(req.body[field]);
        } else if (['isJoint', 'is18Plus'].includes(field)) {
          updateData[field] = req.body[field] === 'true' || req.body[field] === true;
        } else if (typeof req.body[field] === 'string') {
          updateData[field] = req.body[field].trim();
        } else {
          updateData[field] = req.body[field];
        }
      }
    });

    // Clean hashtags if updated
    if (updateData.hashtags) {
      updateData.hashtags = updateData.hashtags.map(tag => tag.startsWith('#') ? tag.slice(1) : tag);
    }

    // Process media files if uploaded
    if (req.files && req.files.length > 0) {
      const media = [];
      for (const file of req.files) {
        media.push({
          url: file.path,
          filename: file.filename,
          mimetype: file.mimetype,
          size: file.size
        });
      }
      updateData.media = media;
      // If content is empty and it's a media creation, set content to the first file's relative path
      const category = updateData.category || creation.category;
      if (!updateData.content && (category === 'Art' || category === 'Photo')) {
        updateData.content = media[0].url;
      }
    }

    let updatedCreation;
    if (connectDB.isDbOffline()) {
      updatedCreation = await mockCreationRepo.findByIdAndUpdate(creationId, updateData);
    } else {
      updatedCreation = await Creation.findByIdAndUpdate(
        creationId,
        { $set: updateData },
        { new: true, runValidators: true }
      )
        .populate('creator', 'fullName username category totalStars avatarUrl profileImage bannerUrl bannerImage')
        .populate('mentions', 'fullName username category totalStars avatarUrl profileImage');
    }

    // Trigger mention notifications if status is published and mentions exist
    if (updateData.mentions && updateData.mentions.length > 0 && updatedCreation.status === 'published') {
      const NotificationService = require('../services/notification.service');
      for (const mentionedId of updateData.mentions) {
        await NotificationService.createNotification(userId, mentionedId, 'mention', updatedCreation._id || updatedCreation.id);
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Creation updated successfully',
      creation: formatCreationResponse(req, updatedCreation)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Report a specific creation
 * @route   POST /api/v1/creations/:id/report
 * @access  Private
 */
const reportCreation = async (req, res, next) => {
  try {
    const creationId = req.params.id;
    const userId = req.user._id.toString();
    const { reason, description } = req.body;

    // Verify creation exists
    let creation;
    if (connectDB.isDbOffline()) {
      creation = await mockCreationRepo.findById(creationId);
    } else {
      creation = await Creation.findById(creationId);
    }

    if (!creation) {
      const error = new Error('Creation not found');
      error.statusCode = 404;
      return next(error);
    }

    // Save the report
    let report;
    if (connectDB.isDbOffline()) {
      report = await mockReportRepo.create({
        user: userId,
        targetType: 'creation',
        targetId: creationId,
        reason: reason || 'Other',
        description: description || ''
      });
    } else {
      report = await Report.create({
        user: userId,
        targetType: 'creation',
        targetId: creationId,
        reason: reason || 'Other',
        description: description || ''
      });
    }

    logger.info('Creation reported', { creationId, userId, reason });

    res.status(201).json({
      status: 'success',
      message: 'Thank you — your report has been submitted and will be reviewed.',
      report: {
        id: report._id,
        targetType: 'creation',
        targetId: creationId,
        reason: report.reason,
        status: report.status
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCreations,
  getCreationById,
  createCreation,
  likeCreation,
  sendQuillNotification,
  bookmarkCreation,
  deleteCreation,
  getMyDrafts,
  updateCreation,
  reportCreation,
  formatCreationResponse
};
