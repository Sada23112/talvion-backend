const Report = require('../models/report.model');
const connectDB = require('../config/db');
const { mockReportRepo } = require('../models/mock.db');

/**
 * @desc    Submit a support report / bug issue ticket
 * @route   POST /api/v1/support/report
 * @access  Private
 */
const createReport = async (req, res, next) => {
  try {
    const { description } = req.body;
    const userId = req.user._id;

    if (!description || !description.trim()) {
      const error = new Error('Please describe the issue or bug before submitting');
      error.statusCode = 400;
      return next(error);
    }

    let report;
    if (connectDB.isDbOffline()) {
      report = await mockReportRepo.create({
        user: userId,
        description: description.trim()
      });
    } else {
      report = await Report.create({
        user: userId,
        description: description.trim()
      });
    }

    res.status(201).json({
      status: 'success',
      message: 'Support report submitted successfully. Thank you for your feedback!',
      report: {
        id: report._id,
        user: report.user,
        description: report.description,
        status: report.status,
        createdAt: report.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createReport
};
