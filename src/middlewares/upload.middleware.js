const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = req.user ? req.user._id : 'anonymous';
    let prefix = 'creation';
    if (file.fieldname === 'avatar') {
      prefix = 'avatar';
    } else if (file.fieldname === 'banner') {
      prefix = 'banner';
    }
    cb(null, `${prefix}-${userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

// File validation filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  let mimetype = file.mimetype;

  // Temporary diagnostic logging
  console.log(`\n[Multer Upload Diagnostic]`);
  console.log(`  - Incoming Filename: ${file.originalname}`);
  console.log(`  - Incoming Extension: ${ext}`);
  console.log(`  - Incoming Mimetype: ${mimetype}`);
  console.log(`  - Fieldname: ${file.fieldname}`);
  console.log(`  - Multer File Object:`, file);

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
    console.log(`  - Resolved Mimetype Fallback: ${mimetype}`);
  }

  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'
  ];
  if (allowedMimeTypes.includes(mimetype)) {
    cb(null, true);
  } else {
    const reason = `Mimetype "${mimetype}" with extension "${ext}" is not supported. Only images (JPG, JPEG, PNG, WEBP) and videos (MP4, MPEG, MOV, WEBM) are allowed.`;
    console.log(`  - ❌ Rejection Reason: ${reason}\n`);
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
