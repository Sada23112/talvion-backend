const express = require('express');
const router = express.Router();
const {
  createAnnotation,
  getAnnotations,
  deleteAnnotation
} = require('../controllers/annotation.controller');
const { protect } = require('../middlewares/auth.middleware');
const { verified } = require('../middlewares/verify.middleware');
const validate = require('../middlewares/validate.middleware');

const annotationValidationSchema = {
  type: {
    required: true,
    type: 'string',
    enum: ['highlight', 'bookmark', 'note']
  },
  startOffset: {
    required: true,
    type: 'number'
  },
  endOffset: {
    required: true,
    type: 'number'
  }
};

// POST /api/v1/creations/:creationId/annotations
router.post('/creations/:creationId/annotations', protect, verified, validate(annotationValidationSchema), createAnnotation);

// GET /api/v1/creations/:creationId/annotations
router.get('/creations/:creationId/annotations', protect, getAnnotations);

// DELETE /api/v1/annotations/:annotationId
router.delete('/annotations/:annotationId', protect, verified, deleteAnnotation);

module.exports = router;
