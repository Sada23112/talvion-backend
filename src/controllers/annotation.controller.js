const Annotation = require('../models/annotation.model');
const Creation = require('../models/creation.model');
const connectDB = require('../config/db');
const { mockAnnotationRepo, mockCreationRepo } = require('../models/mock.db');

const getAnnotationRepo = () => {
  return connectDB.isDbOffline() ? mockAnnotationRepo : Annotation;
};

const getCreationRepo = () => {
  return connectDB.isDbOffline() ? mockCreationRepo : Creation;
};

/**
 * @desc    Create an annotation for a creation
 * @route   POST /api/v1/creations/:creationId/annotations
 * @access  Private
 */
const createAnnotation = async (req, res, next) => {
  try {
    const { creationId } = req.params;
    const { type, text, startOffset, endOffset, color } = req.body;

    const creationRepo = getCreationRepo();
    const creation = await creationRepo.findById(creationId);

    if (!creation) {
      const error = new Error('Creation not found');
      error.statusCode = 404;
      return next(error);
    }

    const annotationRepo = getAnnotationRepo();
    const annotation = await annotationRepo.create({
      user: req.user._id,
      creation: creationId,
      type,
      text,
      startOffset,
      endOffset,
      color
    });

    res.status(201).json({
      status: 'success',
      data: annotation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's annotations for a specific creation
 * @route   GET /api/v1/creations/:creationId/annotations
 * @access  Private
 */
const getAnnotations = async (req, res, next) => {
  try {
    const { creationId } = req.params;

    const creationRepo = getCreationRepo();
    const creation = await creationRepo.findById(creationId);

    if (!creation) {
      const error = new Error('Creation not found');
      error.statusCode = 404;
      return next(error);
    }

    const annotationRepo = getAnnotationRepo();
    const annotations = connectDB.isDbOffline()
      ? await annotationRepo.find({ creation: creationId, user: req.user._id })
      : await Annotation.find({ creation: creationId, user: req.user._id }).sort({ startOffset: 1 });

    res.status(200).json({
      status: 'success',
      results: annotations.length,
      data: annotations
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete an annotation
 * @route   DELETE /api/v1/annotations/:annotationId
 * @access  Private
 */
const deleteAnnotation = async (req, res, next) => {
  try {
    const { annotationId } = req.params;
    const annotationRepo = getAnnotationRepo();

    const annotation = await annotationRepo.findById(annotationId);

    if (!annotation) {
      const error = new Error('Annotation not found');
      error.statusCode = 404;
      return next(error);
    }

    // Ensure user owns the annotation
    if (annotation.user.toString() !== req.user._id.toString()) {
      const error = new Error('You can only delete your own annotations');
      error.statusCode = 403;
      return next(error);
    }

    await annotationRepo.findByIdAndDelete(annotationId);

    res.status(200).json({
      status: 'success',
      message: 'Annotation deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAnnotation,
  getAnnotations,
  deleteAnnotation
};
