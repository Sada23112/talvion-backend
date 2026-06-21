const express = require('express');
const router = express.Router();
const {
  getCreations,
  createCreation,
  likeCreation,
  bookmarkCreation,
  deleteCreation
} = require('../controllers/creation.controller');
const { protect } = require('../middlewares/auth.middleware');
const { verified } = require('../middlewares/verify.middleware');
const { uploadCreationMedia } = require('../middlewares/upload.middleware');

// Public route to browse creations
router.get('/', getCreations);

// Private routes requiring JWT verification and email verification
router.post('/', protect, verified, uploadCreationMedia, createCreation);
router.post('/:id/like', protect, verified, likeCreation);
router.post('/:id/bookmark', protect, verified, bookmarkCreation);
router.delete('/:id', protect, verified, deleteCreation);

module.exports = router;
