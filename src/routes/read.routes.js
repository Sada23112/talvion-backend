const express = require('express');
const router = express.Router();
const {
  getFeatured,
  getContinueReading,
  getNewAndPopular,
  updateProgress,
  getReadCreations
} = require('../controllers/read.controller');
const { protect } = require('../middlewares/auth.middleware');
const { verified } = require('../middlewares/verify.middleware');

// Public endpoints
router.get('/featured', getFeatured);
router.get('/new-popular', getNewAndPopular);
router.get('/creations', getReadCreations);

// Private authenticated endpoints
router.get('/continue', protect, getContinueReading);
router.post('/:id/progress', protect, verified, updateProgress);

module.exports = router;
