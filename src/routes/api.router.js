const express = require('express');
const router = express.Router();
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const supportRoutes = require('./support.routes');
const creationRoutes = require('./creation.routes');
const collabRoutes = require('./collab.routes');
const readRoutes = require('./read.routes');
const commentRoutes = require('./comment.routes');
const annotationRoutes = require('./annotation.routes');
const notificationRoutes = require('./notification.routes');
const conversationRoutes = require('./conversation.routes');
const economyRoutes = require('./economy.routes');
const adminRoutes = require('./admin.routes');

// 1. Mount Functional Authentication Routes
router.use('/auth', authRoutes);

// Mount Admin Routes
router.use('/admin', adminRoutes);

// Mount Economy Routes
router.use('/economy', economyRoutes);

// Mount Notification Routes
router.use('/notifications', notificationRoutes);

// Mount Conversation Routes
router.use('/conversations', conversationRoutes);

// 2. Mount User Profiles & Settings Routes
router.use('/users', userRoutes);

// 3. Mount Support & Report Routes
router.use('/support', supportRoutes);

// 4. Mount Creations & Feed Routes
router.use('/creations', creationRoutes);

// 5. Mount Collaboration & Chat Routes
router.use('/collabs', collabRoutes);

// 6. Mount Long-form Reading Routes
router.use('/read', readRoutes);

// 7. Mount Comments Routes
router.use('/', commentRoutes);

// 8. Mount Annotation Routes
router.use('/', annotationRoutes);

// 2. Mock / Starter Social Feed Router
router.get('/posts', (req, res) => {
  res.status(200).json({
    status: 'success',
    results: 3,
    posts: [
      {
        id: 'post-1',
        author: 'design_guru',
        content: 'Talvion UI directories are successfully structured! Time to design the feed.',
        likes: 12,
        createdAt: new Date().toISOString()
      },
      {
        id: 'post-2',
        author: 'flutter_fan',
        content: 'Clean architecture makes Dart code so readable! Fully decoupled frontend.',
        likes: 42,
        createdAt: new Date().toISOString()
      },
      {
        id: 'post-3',
        author: 'node_ninja',
        content: 'Express + Mongoose makes an incredibly rapid combination for social apps.',
        likes: 99,
        createdAt: new Date().toISOString()
      }
    ]
  });
});

module.exports = router;
