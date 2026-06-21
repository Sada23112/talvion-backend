const express = require('express');
const router = express.Router();
const { createReport } = require('../controllers/support.controller');
const { protect } = require('../middlewares/auth.middleware');

// Route requires JWT authorization
router.post('/report', protect, createReport);

module.exports = router;
