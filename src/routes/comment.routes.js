const express = require('express');
const router = express.Router();
const {
  createComment,
  getComments,
  deleteComment
} = require('../controllers/comment.controller');
const { protect } = require('../middlewares/auth.middleware');
const { verified } = require('../middlewares/verify.middleware');
const validate = require('../middlewares/validate.middleware');

const commentValidationSchema = {
  text: {
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 500
  }
};

// POST /api/v1/creations/:creationId/comments
router.post('/creations/:creationId/comments', protect, verified, validate(commentValidationSchema), createComment);

// GET /api/v1/creations/:creationId/comments
router.get('/creations/:creationId/comments', getComments);

// DELETE /api/v1/comments/:commentId
router.delete('/comments/:commentId', protect, verified, deleteComment);

module.exports = router;
