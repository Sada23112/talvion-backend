const express = require('express');
const router = express.Router();
const {
  getCreations,
  getCreationById,
  createCreation,
  likeCreation,
  bookmarkCreation,
  deleteCreation,
  getMyDrafts,
  updateCreation,
  reportCreation
} = require('../controllers/creation.controller');
const { protect } = require('../middlewares/auth.middleware');
const { verified } = require('../middlewares/verify.middleware');
const { uploadCreationMedia } = require('../middlewares/upload.middleware');

// Public route to browse creations
router.get('/', getCreations);
router.get('/me/drafts', protect, getMyDrafts);
router.get('/:id', getCreationById);

// Private routes requiring JWT verification and email verification
router.post('/', protect, verified, uploadCreationMedia, createCreation);
router.patch('/:id', protect, verified, uploadCreationMedia, updateCreation);
router.post('/:id/like', protect, verified, likeCreation);
router.post('/:id/bookmark', protect, verified, bookmarkCreation);
router.post('/:id/report', protect, reportCreation);
router.delete('/:id', protect, verified, deleteCreation);

module.exports = router;
