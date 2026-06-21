const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Please provide your full name'],
      trim: true,
      maxlength: [50, 'Name cannot be more than 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Please provide your email address'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address'
      ]
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false // Exclude password from query results by default
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      maxlength: [30, 'Username cannot be more than 30 characters']
    },
    bio: {
      type: String,
      maxlength: [150, 'Bio cannot be more than 150 characters'],
      default: ''
    },
    location: {
      type: String,
      maxlength: [100, 'Location cannot be more than 100 characters'],
      default: ''
    },
    category: {
      type: String,
      enum: ['Artist', 'Writer', 'Photographer', 'Personal', 'Other'],
      default: 'Artist'
    },
    avatarUrl: {
      type: String,
      default: ''
    },
    bannerUrl: {
      type: String,
      default: ''
    },
    profileImage: {
      type: String,
      default: ''
    },
    bannerImage: {
      type: String,
      default: ''
    },
    totalStars: {
      type: Number,
      default: 0
    },
    walletBalance: {
      type: Number,
      default: 0
    },
    passwordResetToken: {
      type: String,
      index: true
    },
    passwordResetExpires: {
      type: Date,
      index: true
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    emailVerifiedAt: {
      type: Date
    },
    emailVerificationToken: {
      type: String,
      index: true
    },
    emailVerificationExpires: {
      type: Date,
      index: true
    }
  },
  {
    timestamps: true // Auto-adds createdAt and updatedAt fields
  }
);

// Pre-save hook: Hash passwords before saving to the database
userSchema.pre('save', async function (next) {
  // Only hash password if it was actually modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance Method: Safely verify input candidate passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ category: 1 });

module.exports = mongoose.model('User', userSchema);
