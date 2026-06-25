const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const path = require('path');

// Storage configuration for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folder = 'talvion/creations';
    if (file.fieldname === 'avatar') {
      folder = 'talvion/avatars';
    } else if (file.fieldname === 'banner') {
      folder = 'talvion/banners';
    }
    
    // Cloudinary automatically handles formats but we can enforce some if we want
    // Here we let Cloudinary use auto format, but we can set allowed formats:
    return {
      folder: folder,
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'mp4', 'mov', 'webm'],
      resource_type: 'auto', // Important for video support
    };
  },
});

// File validation filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  let mimetype = file.mimetype;

  // Fallback resolving if the client sent generic binary mimetype
  if (mimetype === 'application/octet-stream') {
    if (ext === '.png') {
      mimetype = 'image/png';
    } else if (ext === '.jpg' || ext === '.jpeg') {
      mimetype = 'image/jpeg';
    } else if (ext === '.webp') {
      mimetype = 'image/webp';
    } else if (ext === '.mp4') {
      mimetype = 'video/mp4';
    } else if (ext === '.mov') {
      mimetype = 'video/quicktime';
    } else if (ext === '.webm') {
      mimetype = 'video/webm';
    }
  }

  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'
  ];
  if (allowedMimeTypes.includes(mimetype)) {
    cb(null, true);
  } else {
    const error = new Error('Invalid file type. Only images and videos are allowed.');
    error.statusCode = 400;
    cb(error, false);
  }
};

// Limit uploads to 5MB
const limits = {
  fileSize: 5 * 1024 * 1024
};

const upload = multer({
  storage,
  fileFilter,
  limits
});

module.exports = {
  uploadAvatar: upload.single('avatar'),
  uploadBanner: upload.single('banner'),
  uploadCreationMedia: upload.array('images', 5)
};
