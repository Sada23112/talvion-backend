const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const mockAdminPath = path.join(__dirname, '../../mock-admin.json');

// In-memory array storage for mock users
const mockUsers = [];

// Helper to save admins to disk for offline persistence
const saveMockAdmins = () => {
  try {
    const admins = mockUsers.filter(u => ['super_admin', 'admin', 'moderator', 'support_staff'].includes(u.role));
    fs.writeFileSync(mockAdminPath, JSON.stringify(admins, null, 2));
  } catch (e) {
    // ignore
  }
};

// Try loading persisted admins
try {
  if (fs.existsSync(mockAdminPath)) {
    const data = JSON.parse(fs.readFileSync(mockAdminPath, 'utf8'));
    if (Array.isArray(data)) {
      mockUsers.push(...data);
    } else if (data && typeof data === 'object') {
      mockUsers.push(data);
    }
  }
} catch (e) {
  // ignore
}

const mockUserRepo = {
  async findOne(query) {
    let user;
    if (query.email) {
      user = mockUsers.find(u => u.email && u.email.toLowerCase() === query.email.toLowerCase().trim());
    } else if (query.username) {
      user = mockUsers.find(u => u.username && u.username.toLowerCase() === query.username.toLowerCase().trim());
    } else if (query._id) {
      user = mockUsers.find(u => u._id === query._id);
    } else if (query.passwordResetToken) {
      user = mockUsers.find(u => {
        if (u.passwordResetToken !== query.passwordResetToken) return false;
        if (query.passwordResetExpires && query.passwordResetExpires.$gt) {
          return u.passwordResetExpires && u.passwordResetExpires > query.passwordResetExpires.$gt;
        }
        return true;
      });
    } else if (query.emailVerificationToken) {
      user = mockUsers.find(u => {
        if (u.emailVerificationToken !== query.emailVerificationToken) return false;
        if (query.emailVerificationExpires && query.emailVerificationExpires.$gt) {
          return u.emailVerificationExpires && u.emailVerificationExpires > query.emailVerificationExpires.$gt;
        }
        return true;
      });
    }
    
    if (!user) return null;
    return this._wrapUser(user);
  },

  async findById(id) {
    const user = mockUsers.find(u => u._id === id);
    if (!user) return null;
    return this._wrapUser(user);
  },

  async findByIdAndUpdate(id, updateData) {
    const userIndex = mockUsers.findIndex(u => u._id === id);
    if (userIndex === -1) return null;

    let finalUpdates = { ...updateData };
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10);
      finalUpdates.password = await bcrypt.hash(updateData.password, salt);
    }

    // Update the record in our in-memory array
    mockUsers[userIndex] = {
      ...mockUsers[userIndex],
      ...finalUpdates,
      updatedAt: new Date()
    };

    return this._wrapUser(mockUsers[userIndex]);
  },

  async findByIdAndDelete(id) {
    const userIndex = mockUsers.findIndex(u => u._id === id);
    if (userIndex === -1) return null;
    
    const deletedUser = mockUsers[userIndex];
    mockUsers.splice(userIndex, 1);
    
    return this._wrapUser(deletedUser);
  },

  async create(data) {
    let hashedPassword = undefined;
    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(data.password, salt);
    }

    const newUser = {
      _id: `mock-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fullName: data.fullName,
      email: data.email.toLowerCase().trim(),
      password: hashedPassword,
      username: data.username ? data.username.trim().toLowerCase() : undefined,
      artistName: data.artistName || '',
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      bio: data.bio || '',
      location: data.location || '',
      category: data.category || 'Artist',
      avatarUrl: data.avatarUrl || '',
      bannerUrl: data.bannerUrl || '',
      profileImage: data.profileImage || '',
      bannerImage: data.bannerImage || '',
      totalStars: data.totalStars || 0,
      walletBalance: data.walletBalance || 0,
      emailVerified: data.emailVerified || false,
      emailVerifiedAt: data.emailVerifiedAt || null,
      emailVerificationToken: undefined,
      emailVerificationExpires: undefined,
      googleId: data.googleId || undefined,
      authProvider: data.authProvider || 'local',
      role: data.role || 'user',
      status: data.status || 'active',
      statusReason: data.statusReason || '',
      statusUntil: data.statusUntil || null,
      isVerified: data.isVerified || false,
      moderationNotes: data.moderationNotes || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockUsers.push(newUser);
    if (['super_admin', 'admin', 'moderator', 'support_staff'].includes(newUser.role)) {
      saveMockAdmins();
    }

    return this._wrapUser(newUser);
  },

  // Helper method to wrap raw user objects in a Mongoose-like doc interface
  _wrapUser(user) {
    return {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      password: user.password,
      username: user.username,
      artistName: user.artistName || '',
      dateOfBirth: user.dateOfBirth,
      bio: user.bio,
      location: user.location,
      category: user.category,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      profileImage: user.profileImage || '',
      bannerImage: user.bannerImage || '',
      totalStars: user.totalStars,
      walletBalance: user.walletBalance,
      passwordResetToken: user.passwordResetToken,
      passwordResetExpires: user.passwordResetExpires,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      emailVerificationToken: user.emailVerificationToken,
      emailVerificationExpires: user.emailVerificationExpires,
      googleId: user.googleId,
      authProvider: user.authProvider || 'local',
      role: user.role || 'user',
      status: user.status || 'active',
      statusReason: user.statusReason || '',
      statusUntil: user.statusUntil || null,
      isVerified: user.isVerified || false,
      moderationNotes: user.moderationNotes || '',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Chainable query helpers
      select(fields) {
        return this;
      },
      // Password comparison method
      async comparePassword(candidatePassword) {
        if (!this.password) return false;
        return await bcrypt.compare(candidatePassword, this.password);
      },
      async save() {
        const rawUser = mockUsers.find(u => u._id === this._id);
        if (rawUser) {
          if (this.password && this.password !== rawUser.password) {
            const salt = await bcrypt.genSalt(10);
            rawUser.password = await bcrypt.hash(this.password, salt);
          }
          rawUser.fullName = this.fullName;
          rawUser.username = this.username;
          rawUser.artistName = this.artistName;
          rawUser.dateOfBirth = this.dateOfBirth;
          rawUser.bio = this.bio;
          rawUser.location = this.location;
          rawUser.category = this.category;
          rawUser.avatarUrl = this.avatarUrl;
          rawUser.bannerUrl = this.bannerUrl;
          rawUser.profileImage = this.profileImage;
          rawUser.bannerImage = this.bannerImage;
          rawUser.totalStars = this.totalStars;
          rawUser.walletBalance = this.walletBalance;
          rawUser.passwordResetToken = this.passwordResetToken;
          rawUser.passwordResetExpires = this.passwordResetExpires;
          rawUser.emailVerified = this.emailVerified;
          rawUser.emailVerifiedAt = this.emailVerifiedAt;
          rawUser.emailVerificationToken = this.emailVerificationToken;
          rawUser.emailVerificationExpires = this.emailVerificationExpires;
          rawUser.googleId = this.googleId;
          rawUser.authProvider = this.authProvider;
          rawUser.role = this.role;
          rawUser.status = this.status;
          rawUser.statusReason = this.statusReason;
          rawUser.statusUntil = this.statusUntil;
          rawUser.isVerified = this.isVerified;
          rawUser.moderationNotes = this.moderationNotes;
          rawUser.updatedAt = new Date();
          
          this.password = rawUser.password;
          this.updatedAt = rawUser.updatedAt;

          if (['super_admin', 'admin', 'moderator', 'support_staff'].includes(rawUser.role)) {
            saveMockAdmins();
          }
        }
        return this;
      }
    };
  }
};

// In-memory array storage for support reports
const mockReports = [];
const mockVerificationRequests = [];
const mockTransactions = [];
const mockPremiumPurchases = [];
const mockAuditLogs = [];

const mockReportRepo = {
  async create({ user, description, targetType, targetId, reason }) {
    const newReport = {
      _id: `mock-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user,
      description: description || '',
      targetType: targetType || 'general',
      targetId: targetId || null,
      reason: reason || null,
      status: 'open',
      assignedTo: null,
      moderatorNotes: '',
      escalated: false,
      resolvedBy: null,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    mockReports.push(newReport);
    const label = targetType && targetId
      ? `[${targetType.toUpperCase()}:${targetId}]`
      : '[general]';
    console.log(`[Offline Report] ${label} reason="${reason}" by user ${user}`);
    return this._populateFields(newReport);
  },
  async find(query = {}) {
    let list = [...mockReports];
    if (query.status) {
      list = list.filter(r => r.status === query.status);
    }
    if (query.escalated !== undefined) {
      list = list.filter(r => r.escalated === (query.escalated === true || query.escalated === 'true'));
    }
    if (query.assignedTo) {
      list = list.filter(r => r.assignedTo === query.assignedTo);
    }
    return list.map(r => this._populateFields(r));
  },
  async findById(id) {
    const report = mockReports.find(r => r._id === id);
    if (!report) return null;
    return this._wrapReport(report);
  },
  async findByIdAndUpdate(id, updateData) {
    const idx = mockReports.findIndex(r => r._id === id);
    if (idx === -1) return null;
    
    mockReports[idx] = {
      ...mockReports[idx],
      ...updateData,
      updatedAt: new Date()
    };
    return this._populateFields(mockReports[idx]);
  },
  _populateFields(report) {
    const populatedUser = mockUsers.find(u => u._id === report.user) || { _id: report.user, fullName: 'Unknown User' };
    const populatedAssigned = report.assignedTo ? (mockUsers.find(u => u._id === report.assignedTo) || { _id: report.assignedTo, fullName: 'Unknown Admin' }) : null;
    const populatedResolved = report.resolvedBy ? (mockUsers.find(u => u._id === report.resolvedBy) || { _id: report.resolvedBy, fullName: 'Unknown Admin' }) : null;
    
    // Also populate history performedBy
    const populatedHistory = (report.history || []).map(h => {
      const pBy = mockUsers.find(u => u._id === h.performedBy.toString()) || { _id: h.performedBy, fullName: 'System' };
      return {
        ...h,
        performedBy: {
          _id: pBy._id,
          fullName: pBy.fullName,
          username: pBy.username,
          email: pBy.email
        }
      };
    });

    return {
      ...report,
      user: {
        _id: populatedUser._id,
        fullName: populatedUser.fullName,
        username: populatedUser.username,
        email: populatedUser.email
      },
      assignedTo: populatedAssigned ? {
        _id: populatedAssigned._id,
        fullName: populatedAssigned.fullName,
        username: populatedAssigned.username,
        email: populatedAssigned.email
      } : null,
      resolvedBy: populatedResolved ? {
        _id: populatedResolved._id,
        fullName: populatedResolved.fullName,
        username: populatedResolved.username,
        email: populatedResolved.email
      } : null,
      history: populatedHistory
    };
  },
  _wrapReport(report) {
    const self = this;
    return {
      ...report,
      async save() {
        const idx = mockReports.findIndex(r => r._id === this._id);
        if (idx !== -1) {
          mockReports[idx] = {
            ...mockReports[idx],
            status: this.status,
            assignedTo: this.assignedTo,
            moderatorNotes: this.moderatorNotes,
            escalated: this.escalated,
            resolvedBy: this.resolvedBy,
            history: this.history,
            updatedAt: new Date()
          };
          return self._populateFields(mockReports[idx]);
        }
        return this;
      }
    };
  }
};

// In-memory array storage for mock creations
const mockCreations = [
  {
    _id: 'mock-creation-1',
    creator: 'mock-user-admin',
    title: 'the healing we don\'t talk about',
    caption: 'Every scar has a story to tell, and every silent night is a step closer to finding yourself.',
    category: 'Poem',
    content: 'It starts in the quiet, in the spaces between breaths, when you realize the only person who can put you back together is you.',
    gradientColors: ['#F0D9CE', '#D8A7A7'],
    likes: [],
    bookmarks: [],
    hashtags: ['poetry', 'healing', 'selflove'],
    readTime: '2 min read',
    pages: [
      'It starts in the quiet, in the spaces between breaths, when you realize the only person who can put you back together is you.\n\nWe search for healing in others, in words spoken by strangers, but the true light is always inside.',
      'So take a breath, let the silence settle. You are not broken, you are simply assembling yourself anew, page by page, piece by piece.'
    ],
    createdAt: new Date(Date.now() - 3600000 * 2),
    updatedAt: new Date(Date.now() - 3600000 * 2)
  },
  {
    _id: 'mock-creation-2',
    creator: 'mock-user-admin',
    title: 'A cup of tea and old memories',
    caption: 'Rainy afternoons always carry the scent of cardamom and the echo of laughter from years ago.',
    category: 'Art',
    content: '',
    gradientColors: ['#D4B8A4', '#A67C6B'],
    likes: [],
    bookmarks: [],
    hashtags: ['art', 'cozy', 'nostalgia'],
    readTime: '1 min read',
    pages: [],
    createdAt: new Date(Date.now() - 3600000 * 5),
    updatedAt: new Date(Date.now() - 3600000 * 5)
  },
  {
    _id: 'mock-creation-3',
    creator: 'mock-user-admin',
    title: 'Shadows in the Mist',
    caption: 'Wandering through the early morning streets, watching the sun break through the fog.',
    category: 'Photo',
    content: '',
    gradientColors: ['#8B9A8E', '#4A3F35'],
    likes: [],
    bookmarks: [],
    hashtags: ['photography', 'morning', 'moody'],
    readTime: '1 min read',
    pages: [],
    createdAt: new Date(Date.now() - 3600000 * 12),
    updatedAt: new Date(Date.now() - 3600000 * 12)
  },
  {
    _id: 'mock-creation-4',
    creator: 'mock-user-admin',
    title: 'The Space Between Us',
    caption: 'Some silences speak louder than the words we never said.',
    category: 'Story',
    content: 'Meera had learned that the hard way, sitting across from her grandmother\'s empty chair every evening for a month after she was gone...',
    gradientColors: ['#EDD9C8', '#C9A88E'],
    likes: [],
    bookmarks: [],
    hashtags: ['story', 'fiction', 'grief'],
    readTime: '5 min read',
    pages: [
      'The Space Between Us\n\nSome silences speak louder than the words we never said. Meera had learned that the hard way, sitting across from her grandmother\'s empty chair every evening for a month after she was gone.\n\nIt wasn\'t the big moments she missed most — not the birthdays or the long monsoon afternoons spent peeling oranges on the veranda. It was the small ones. The way her grandmother hummed while she cooked, slightly off-key, never finishing the tune.',
      'Meera began writing to fill the silence. At first it was just fragments — a line here, a memory there, scribbled on the backs of grocery receipts and torn notebook pages.\n\n"Write it down before it fades," her grandmother used to say, though back then Meera never understood why. Now she did. Memory was a candle in the wind, and words were the glass that kept it burning.',
      'One evening, she found an old letter tucked inside a book of poems — her handwriting, addressed to no one in particular. It read like a conversation with the future, with someone who hadn\'t been born yet.\n\n"If you\'re reading this," it began, "it means the space between us is no longer empty. It\'s full of everything I couldn\'t say out loud."',
      'Meera read the letter again and again until the paper softened at its folds. She realized that grief wasn\'t a wall — it was a bridge, built quietly, plank by plank, out of everything left unsaid.\n\nThat night, she finally finished the tune her grandmother used to hum, humming it softly into the empty kitchen, and for the first time, the silence didn\'t feel so heavy.'
    ],
    createdAt: new Date(Date.now() - 3600000 * 24),
    updatedAt: new Date(Date.now() - 3600000 * 24)
  },
  {
    _id: 'mock-creation-5',
    creator: 'mock-user-1', // Riya Sen
    title: 'The Colour of Silence',
    caption: 'Every unsent letter carries a part of our healing...',
    category: 'Poem',
    content: 'Silence has its own hue. It is not empty, but heavy with the weight of blue...',
    gradientColors: ['#F0D9CE', '#D8A7A7'],
    likes: ['mock-user-admin'],
    bookmarks: [],
    hashtags: ['poetry', 'silence', 'healing'],
    readTime: '3 min read',
    pages: [
      'Silence has its own hue. It is not empty, but heavy with the weight of blue, soft like the twilight before the stars break through...',
      'Every unsent letter carries a part of our healing, folded neatly in the drawers of our minds. We write what we cannot say, hoping the wind will carry it away.'
    ],
    createdAt: new Date(Date.now() - 3600000 * 3),
    updatedAt: new Date(Date.now() - 3600000 * 3)
  },
  {
    _id: 'mock-creation-6',
    creator: 'mock-user-2', // Arjun Khanna
    title: 'Letters to No One',
    caption: 'Conversations that happen only with the stars...',
    category: 'Story',
    content: 'The mailbox at the edge of the hill had been rusted shut for a decade...',
    gradientColors: ['#8B9A8E', '#4A3F35'],
    likes: [],
    bookmarks: ['mock-user-admin'],
    hashtags: ['story', 'mystery', 'stars'],
    readTime: '4 min read',
    pages: [
      'The mailbox at the edge of the hill had been rusted shut for a decade, yet every Tuesday, a blue envelope appeared inside it...',
      'Who was sending them? No one lived on the hill. The letters contained no addresses, just conversations that seemed to happen only with the stars.'
    ],
    createdAt: new Date(Date.now() - 3600000 * 4),
    updatedAt: new Date(Date.now() - 3600000 * 4)
  },
  {
    _id: 'mock-creation-7',
    creator: 'mock-user-admin',
    title: 'When Stars Forget',
    caption: 'A quiet meditation on memory and distance...',
    category: 'Poem',
    content: 'Do stars remember the light they cast, or do they burn, forgetting their own past?',
    gradientColors: ['#D8A7A7', '#8B5A5A'],
    likes: [],
    bookmarks: [],
    hashtags: ['poetry', 'meditation', 'stars'],
    readTime: '6 min read',
    pages: [
      'Do stars remember the light they cast, or do they burn, forgetting their own past?',
      'We look up, dreaming of distance, while they burn silently, oblivious to our resistance.'
    ],
    createdAt: new Date(Date.now() - 3600000 * 1),
    updatedAt: new Date(Date.now() - 3600000 * 1)
  },
  {
    _id: 'mock-creation-8',
    creator: 'mock-user-admin',
    title: 'Why we overthink things that don\'t matter',
    caption: 'A personal essay exploring why the mind locks onto small uncertainties.',
    category: 'Essay',
    content: 'The human brain is an excellent pattern recognition machine. Too excellent, sometimes...',
    gradientColors: ['#8B9A8E', '#4A3F35'],
    likes: [],
    bookmarks: [],
    hashtags: ['essay', 'philosophy', 'overthinking'],
    readTime: '7 min read',
    pages: [
      'The human brain is an excellent pattern recognition machine. Too excellent, sometimes. We find signals in noise, threat in silence, and complex meaning in simple, brief exchanges.',
      'Overthinking is not about solving problems; it is a manifestation of the illusion of control. By turning a thought over in our heads a thousand times, we convince ourselves that we are doing something about it.'
    ],
    createdAt: new Date(Date.now() - 3600000 * 6),
    updatedAt: new Date(Date.now() - 3600000 * 6)
  }
];

const mockCreationRepo = {
  async find(query = {}) {
    let list = [...mockCreations];

    // Filter by category
    if (query.category) {
      // Allow plural chip forms or single category strings (e.g. Writers / Writer, Artists / Artist)
      const cleanCategory = query.category.toLowerCase().replace('✍️ ', '').replace('🎨 ', '').replace('📷 ', '').replace('📖 ', '').trim();
      list = list.filter(c => {
        const cat = (c.category || '').toLowerCase();
        if (cleanCategory.startsWith('writer') || cleanCategory.startsWith('poem')) {
          return cat === 'poem' || cat === 'story';
        }
        if (cleanCategory.startsWith('artist') || cleanCategory.startsWith('art')) {
          return cat === 'art';
        }
        if (cleanCategory.startsWith('photo')) {
          return cat === 'photo';
        }
        if (cleanCategory.startsWith('story')) {
          return cat === 'story';
        }
        return cat.includes(cleanCategory) || cleanCategory.includes(cat);
      });
    }

    // Filter by search keyword (in title, caption, hashtags, and creator details)
    if (query.search) {
      const s = query.search.toLowerCase();
      list = list.filter(c => {
        const creatorId = c.creator && c.creator._id ? c.creator._id : c.creator;
        const user = mockUsers.find(u => u._id === creatorId);
        const creatorName = user ? user.fullName : 'Meera Iyer';
        const creatorUsername = user ? user.username : 'meera_iyer';

        return (c.title && c.title.toLowerCase().includes(s)) || 
          (c.caption && c.caption.toLowerCase().includes(s)) || 
          (c.hashtags && c.hashtags.some(t => t && t.toLowerCase().includes(s))) ||
          (creatorName && creatorName.toLowerCase().includes(s)) ||
          (creatorUsername && creatorUsername.toLowerCase().includes(s));
      });
    }

    // Filter by creator/userId
    if (query.creator) {
      list = list.filter(c => {
        const creatorId = c.creator && c.creator._id ? c.creator._id : c.creator;
        return creatorId.toString() === query.creator.toString();
      });
    }

    // Filter by isJoint
    if (query.isJoint !== undefined) {
      const isJointBool = query.isJoint === true || query.isJoint === 'true';
      list = list.filter(c => c.isJoint === isJointBool);
    }

    // Filter by isFeatured
    if (query.isFeatured !== undefined) {
      const isFeatBool = query.isFeatured === true || query.isFeatured === 'true';
      list = list.filter(c => (c.isFeatured || false) === isFeatBool);
    }

    // Filter by status
    if (query.status && query.status !== 'all') {
      list = list.filter(c => (c.status || 'published') === query.status);
    } else if (!query.status) {
      list = list.filter(c => (c.status || 'published') === 'published');
    }

    // Sort by createdAt desc
    list.sort((a, b) => b.createdAt - a.createdAt);

    // Populate creator details
    return list.map(c => this._populateCreator(c));
  },

  async findById(id) {
    const creation = mockCreations.find(c => c._id === id);
    if (!creation) return null;
    return this._populateCreator(creation);
  },

  async create({ creator, title, caption, category, content, gradientColors, hashtags, pages, readTime, isJoint, is18Plus, tags, mentions, media, status, visibility }) {
    const newCreation = {
      _id: `mock-creation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      creator,
      title: title || '',
      caption: caption || '',
      category,
      content: content || '',
      gradientColors: gradientColors || ['#A67C6B', '#7A4A38'],
      likes: [],
      bookmarks: [],
      hashtags: hashtags || [],
      pages: pages || [],
      readTime: readTime || '1 min read',
      isJoint: isJoint === true || isJoint === 'true',
      is18Plus: is18Plus === true || is18Plus === 'true',
      tags: tags || [],
      mentions: mentions || [],
      media: media || [],
      status: status || 'published',
      visibility: visibility || 'public',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockCreations.push(newCreation);
    return this._populateCreator(newCreation);
  },

  async findByIdAndDelete(id) {
    const idx = mockCreations.findIndex(c => c._id === id);
    if (idx === -1) return null;
    const deleted = mockCreations[idx];
    mockCreations.splice(idx, 1);
    return this._populateCreator(deleted);
  },

  async findByIdAndUpdate(id, updates) {
    const idx = mockCreations.findIndex(c => c._id === id);
    if (idx === -1) return null;

    mockCreations[idx] = {
      ...mockCreations[idx],
      ...updates,
      updatedAt: new Date()
    };

    return this._populateCreator(mockCreations[idx]);
  },

  _populateCreator(creation) {
    // Find creator user from mockUsers, or fallback to default dummy
    const user = mockUsers.find(u => u._id === creation.creator);
    const creatorObj = user ? {
      _id: user._id,
      fullName: user.fullName,
      username: user.username || 'user',
      category: user.category,
      totalStars: user.totalStars,
      avatarUrl: user.avatarUrl
    } : {
      _id: creation.creator || 'mock-user-admin',
      fullName: 'Meera Iyer',
      username: 'meera_iyer',
      category: 'Writer',
      totalStars: 847,
      avatarUrl: ''
    };

    const populatedMentions = (creation.mentions || []).map(mId => {
      const u = mockUsers.find(userObj => userObj._id === mId.toString());
      return u ? {
        _id: u._id,
        fullName: u.fullName,
        username: u.username || 'user',
        category: u.category || 'Artist',
        totalStars: u.totalStars || 0,
        avatarUrl: u.avatarUrl || ''
      } : { _id: mId, username: mId, fullName: mId };
    });

    return {
      ...creation,
      creator: creatorObj,
      mentions: populatedMentions
    };
  }
};

// ============================================================================
// COLLABORATION & CHAT MOCK DATABASE & REPOSITORIES
// ============================================================================
const mockCollabRequests = [];
const mockCollabChats = [];
const mockConversations = [];
const mockMessages = [];

// Seed some active mock users into mockUsers array to make Discover tab functional
if (!mockUsers.some(u => u._id === 'mock-user-1')) {
  mockUsers.push(
    {
      _id: 'mock-user-1',
      fullName: 'Riya Sen',
      email: 'riya@example.com',
      username: 'riya_sen',
      bio: 'Writes about quiet moments and memory.',
      category: 'Writer',
      avatarUrl: '',
      bannerUrl: '',
      profileImage: '',
      bannerImage: '',
      totalStars: 521,
      walletBalance: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'mock-user-2',
      fullName: 'Arjun Khanna',
      email: 'arjun@example.com',
      username: 'arjun_k',
      bio: 'Digital painter, loves warm color palettes.',
      category: 'Artist',
      avatarUrl: '',
      bannerUrl: '',
      profileImage: '',
      bannerImage: '',
      totalStars: 432,
      walletBalance: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'mock-user-3',
      fullName: 'Dev Malhotra',
      email: 'dev@example.com',
      username: 'dev_m',
      bio: 'Got an idea for a short story collab — interested?',
      category: 'Writer',
      avatarUrl: '',
      bannerUrl: '',
      profileImage: '',
      bannerImage: '',
      totalStars: 198,
      walletBalance: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'mock-user-admin',
      fullName: 'Meera Iyer',
      email: 'meera@example.com',
      username: 'meera_iyer',
      bio: 'Crafts emotional short fiction.',
      category: 'Writer',
      avatarUrl: '',
      bannerUrl: '',
      profileImage: '',
      bannerImage: '',
      totalStars: 847,
      walletBalance: 120,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  );

  // Seed incoming mock requests
  mockCollabRequests.push(
    {
      _id: 'mock-req-seed-1',
      sender: 'mock-user-1', // Riya Sen
      receiver: 'mock-user-admin', // Meera Iyer
      message: 'Would love to collaborate on a poetry + art series!',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'mock-req-seed-2',
      sender: 'mock-user-3', // Dev Malhotra
      receiver: 'mock-user-admin', // Meera Iyer
      message: 'Got an idea for a short story collab — interested?',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  );

  // Seed an active collab chat
  mockCollabChats.push(
    {
      _id: 'mock-chat-seed-1',
      participants: ['mock-user-admin', 'mock-user-2'], // Meera Iyer and Arjun Khanna
      status: 'active',
      messages: [
        {
          _id: 'mock-msg-1',
          sender: 'mock-user-2',
          type: 'text',
          text: 'Hey! Excited to work on this together 🎨',
          createdAt: new Date(Date.now() - 60000)
        },
        {
          _id: 'mock-msg-2',
          sender: 'mock-user-admin',
          type: 'text',
          text: 'Same! I was thinking a poem + illustration pairing.',
          createdAt: new Date(Date.now() - 30000)
        },
        {
          _id: 'mock-msg-3',
          sender: 'mock-user-2',
          type: 'text',
          text: 'Perfect, send over the draft whenever ready.',
          createdAt: new Date(Date.now() - 10000)
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  );

  // Seed some support reports
  mockReports.push(
    {
      _id: 'mock-report-1',
      user: 'mock-user-1', // Reporter: Riya Sen
      targetType: 'creation',
      targetId: 'mock-creation-7', // When Stars Forget
      reason: 'Spam or misleading',
      description: 'This appears to be copy-pasted spam from another website.',
      status: 'open',
      assignedTo: null,
      moderatorNotes: '',
      escalated: false,
      resolvedBy: null,
      history: [],
      createdAt: new Date(Date.now() - 3600000 * 2), // 2 hours ago
      updatedAt: new Date(Date.now() - 3600000 * 2)
    },
    {
      _id: 'mock-report-2',
      user: 'mock-user-2', // Reporter: Arjun Khanna
      targetType: 'user',
      targetId: 'mock-user-3', // Reported: Dev Malhotra
      reason: 'Harassment or bullying',
      description: 'Sending offensive and spammy collaboration requests repeatedly.',
      status: 'open',
      assignedTo: null,
      moderatorNotes: '',
      escalated: false,
      resolvedBy: null,
      history: [],
      createdAt: new Date(Date.now() - 3600000 * 4), // 4 hours ago
      updatedAt: new Date(Date.now() - 3600000 * 4)
    }
  );

  // Seed some creator verification requests
  mockVerificationRequests.push(
    {
      _id: 'mock-vr-1',
      user: 'mock-user-1', // Riya Sen
      portfolioLinks: ['https://riyasen.medium.com', 'https://riyasen.portfolio.com'],
      bio: 'Poet and short story writer since 2018. Published in two anthologies.',
      status: 'pending',
      feedback: '',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date(Date.now() - 3600000 * 24), // 1 day ago
      updatedAt: new Date(Date.now() - 3600000 * 24)
    },
    {
      _id: 'mock-vr-2',
      user: 'mock-user-2', // Arjun Khanna
      portfolioLinks: ['https://artstation.com/arjun_k', 'https://behance.net/arjun_k'],
      bio: 'Digital illustrator specializing in fantasy art and warm color palettes.',
      status: 'pending',
      feedback: '',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date(Date.now() - 3600000 * 12), // 12 hours ago
      updatedAt: new Date(Date.now() - 3600000 * 12)
    }
  );

  // Seed some mock transactions
  mockTransactions.push(
    {
      _id: 'mock-tx-1',
      user: 'mock-user-1', // Riya Sen
      amount: -2,
      currency: 'quill',
      type: 'quill_sent',
      source: 'tip',
      referenceId: 'mock-creation-7', // When Stars Forget
      description: 'Sent 2 quills to support post',
      timestamp: new Date(Date.now() - 3600000 * 5),
      createdAt: new Date(Date.now() - 3600000 * 5),
      updatedAt: new Date(Date.now() - 3600000 * 5)
    },
    {
      _id: 'mock-tx-2',
      user: 'mock-user-2', // Arjun Khanna
      amount: 4,
      currency: 'gem',
      type: 'gems_earned',
      source: 'quill_tip_recipient_solo',
      referenceId: 'mock-creation-7',
      description: 'Gems earned from quill_tip_recipient_solo',
      timestamp: new Date(Date.now() - 3600000 * 5),
      createdAt: new Date(Date.now() - 3600000 * 5),
      updatedAt: new Date(Date.now() - 3600000 * 5)
    },
    {
      _id: 'mock-tx-3',
      user: 'mock-user-3', // Dev Malhotra
      amount: 50,
      currency: 'premium_quill',
      type: 'purchase_completed',
      source: 'shop_pack',
      referenceId: 'mock-order-pp-1',
      description: 'Bought 50 Premium Quills',
      timestamp: new Date(Date.now() - 3600000 * 12),
      createdAt: new Date(Date.now() - 3600000 * 12),
      updatedAt: new Date(Date.now() - 3600000 * 12)
    },
    {
      _id: 'mock-tx-4',
      user: 'mock-user-1', // Riya Sen
      amount: -1,
      currency: 'premium_quill',
      type: 'premium_quill_sent',
      source: 'tip',
      referenceId: 'mock-creation-7',
      description: 'Sent 1 premium quill to support post',
      timestamp: new Date(Date.now() - 3600000 * 1),
      createdAt: new Date(Date.now() - 3600000 * 1),
      updatedAt: new Date(Date.now() - 3600000 * 1)
    },
    {
      _id: 'mock-tx-5',
      user: 'mock-user-2', // Arjun Khanna
      amount: 4,
      currency: 'gem',
      type: 'gems_earned',
      source: 'quill_tip_recipient_solo',
      referenceId: 'mock-creation-7',
      description: 'Gems earned from quill_tip_recipient_solo',
      timestamp: new Date(Date.now() - 3600000 * 1),
      createdAt: new Date(Date.now() - 3600000 * 1),
      updatedAt: new Date(Date.now() - 3600000 * 1)
    }
  );

  // Seed mock premium purchases
  mockPremiumPurchases.push(
    {
      _id: 'mock-pp-1',
      user: 'mock-user-3', // Dev Malhotra
      packId: 'popular',
      amount: 299,
      currency: 'INR',
      premiumQuillsAwarded: 50,
      gemsAwarded: 10,
      paymentProvider: 'razorpay',
      paymentId: 'pay_rzp_mock123',
      orderId: 'mock-order-pp-1',
      status: 'completed',
      createdAt: new Date(Date.now() - 3600000 * 12),
      updatedAt: new Date(Date.now() - 3600000 * 12)
    }
  );

  // Seed some mock audit logs
  mockAuditLogs.push(
    {
      _id: 'mock-audit-1',
      admin: 'mock-user-admin-seed', // System Admin
      actionType: 'suspend_user',
      targetModel: 'User',
      targetId: 'mock-user-3',
      description: 'Suspended user account Dev Malhotra for 7 days. Reason: sending spam requests.',
      previousState: { status: 'active', statusUntil: null },
      newState: { status: 'suspended', statusUntil: new Date(Date.now() + 3600000 * 24 * 7).toISOString() },
      ipAddress: '192.168.1.50',
      createdAt: new Date(Date.now() - 3600000 * 48)
    },
    {
      _id: 'mock-audit-2',
      admin: 'mock-user-admin-seed',
      actionType: 'hide_content',
      targetModel: 'Creation',
      targetId: 'mock-creation-7',
      description: 'Hid creation (marked as draft) following copyright complaint.',
      previousState: { status: 'published' },
      newState: { status: 'draft' },
      ipAddress: '192.168.1.50',
      createdAt: new Date(Date.now() - 3600000 * 2)
    },
    {
      _id: 'mock-audit-3',
      admin: 'mock-user-admin-seed',
      actionType: 'resolve_verification_approved',
      targetModel: 'VerificationRequest',
      targetId: 'mock-vr-1',
      description: 'Creator verification request was approved. Creator badge activated.',
      previousState: { status: 'pending' },
      newState: { status: 'approved' },
      ipAddress: '192.168.1.50',
      createdAt: new Date(Date.now() - 3600000 * 1)
    }
  );
}

const mockCollabRequestRepo = {
  async find(query = {}) {
    let list = [...mockCollabRequests];
    if (query.sender) {
      list = list.filter(r => r.sender === query.sender);
    }
    if (query.receiver) {
      list = list.filter(r => r.receiver === query.receiver);
    }
    if (query.status) {
      list = list.filter(r => r.status === query.status);
    }
    return list.map(r => this._populateRequest(r));
  },

  async findById(id) {
    const req = mockCollabRequests.find(r => r._id === id);
    if (!req) return null;
    return this._populateRequest(req);
  },

  async create({ sender, receiver, message }) {
    const newRequest = {
      _id: `mock-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender,
      receiver,
      message,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockCollabRequests.push(newRequest);
    return this._populateRequest(newRequest);
  },

  async findByIdAndUpdate(id, updates) {
    const idx = mockCollabRequests.findIndex(r => r._id === id);
    if (idx === -1) return null;
    mockCollabRequests[idx] = {
      ...mockCollabRequests[idx],
      ...updates,
      updatedAt: new Date()
    };
    return this._populateRequest(mockCollabRequests[idx]);
  },

  _populateRequest(req) {
    const senderUser = mockUsers.find(u => u._id === req.sender);
    const receiverUser = mockUsers.find(u => u._id === req.receiver);
    
    return {
      ...req,
      sender: senderUser ? {
        _id: senderUser._id,
        fullName: senderUser.fullName,
        username: senderUser.username || 'user',
        category: senderUser.category,
        avatarUrl: senderUser.avatarUrl
      } : { _id: req.sender, fullName: 'Unknown Sender', username: 'sender', category: 'Artist', avatarUrl: '' },
      receiver: receiverUser ? {
        _id: receiverUser._id,
        fullName: receiverUser.fullName,
        username: receiverUser.username || 'user',
        category: receiverUser.category,
        avatarUrl: receiverUser.avatarUrl
      } : { _id: req.receiver, fullName: 'Unknown Receiver', username: 'receiver', category: 'Artist', avatarUrl: '' }
    };
  }
};

const mockCollabChatRepo = {
  async find(query = {}) {
    let list = [...mockCollabChats];
    if (query.participant) {
      list = list.filter(c => c.participants.includes(query.participant));
    }
    if (query.status) {
      list = list.filter(c => c.status === query.status);
    }
    return list.map(c => this._populateChat(c));
  },

  async findById(id) {
    const chat = mockCollabChats.find(c => c._id === id);
    if (!chat) return null;
    return this._populateChat(chat);
  },

  async create({ participants }) {
    const newChat = {
      _id: `mock-chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      participants,
      status: 'active',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockCollabChats.push(newChat);
    return this._populateChat(newChat);
  },

  async findByIdAndUpdate(id, updates) {
    const idx = mockCollabChats.findIndex(c => c._id === id);
    if (idx === -1) return null;
    mockCollabChats[idx] = {
      ...mockCollabChats[idx],
      ...updates,
      updatedAt: new Date()
    };
    return this._populateChat(mockCollabChats[idx]);
  },

  _populateChat(chat) {
    const populatedParticipants = chat.participants.map(pId => {
      const u = mockUsers.find(user => user._id === pId);
      return u ? {
        _id: u._id,
        fullName: u.fullName,
        username: u.username || 'user',
        category: u.category,
        avatarUrl: u.avatarUrl
      } : { _id: pId, fullName: 'Unknown User', username: 'user', category: 'Artist', avatarUrl: '' };
    });

    const populatedMessages = chat.messages.map(m => {
      const u = mockUsers.find(user => user._id === m.sender);
      return {
        ...m,
        sender: u ? {
          _id: u._id,
          fullName: u.fullName,
          username: u.username || 'user',
          category: u.category,
          avatarUrl: u.avatarUrl
        } : { _id: m.sender, fullName: 'Unknown Sender', username: 'sender', category: 'Artist', avatarUrl: '' }
      };
    });

    return {
      ...chat,
      participants: populatedParticipants,
      messages: populatedMessages
    };
  }
};

// ============================================================================
// READING PROGRESS MOCK DATABASE & REPOSITORIES
// ============================================================================
const mockReadingProgress = [
  {
    _id: 'mock-progress-seed-1',
    user: 'mock-user-admin', // Meera Iyer
    creation: 'mock-creation-5', // The Colour of Silence
    progress: 65,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'mock-progress-seed-2',
    user: 'mock-user-admin', // Meera Iyer
    creation: 'mock-creation-6', // Letters to No One
    progress: 30,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

const mockReadingProgressRepo = {
  async find(query = {}) {
    let list = [...mockReadingProgress];
    if (query.user) {
      list = list.filter(p => p.user === query.user);
    }
    if (query.creation) {
      list = list.filter(p => p.creation === query.creation);
    }
    return list.map(p => this._populateProgress(p));
  },

  async findOne(query = {}) {
    const list = await this.find(query);
    return list.length > 0 ? list[0] : null;
  },

  async createOrUpdateProgress({ user, creation, progress }) {
    const idx = mockReadingProgress.findIndex(p => p.user === user && p.creation === creation);
    if (idx !== -1) {
      mockReadingProgress[idx].progress = progress;
      mockReadingProgress[idx].updatedAt = new Date();
      return this._populateProgress(mockReadingProgress[idx]);
    } else {
      const newProgress = {
        _id: `mock-progress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user,
        creation,
        progress,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockReadingProgress.push(newProgress);
      return this._populateProgress(newProgress);
    }
  },

  _populateProgress(p) {
    const creationObj = mockCreations.find(c => c._id === p.creation);
    let populatedCreation = null;
    if (creationObj) {
      const creatorObj = mockUsers.find(u => u._id === creationObj.creator) || {
        _id: creationObj.creator,
        fullName: 'Meera Iyer',
        username: 'meera_iyer',
        category: 'Writer',
        totalStars: 847,
        avatarUrl: ''
      };
      populatedCreation = {
        ...creationObj,
        creator: creatorObj
      };
    }
    return {
      ...p,
      creation: populatedCreation
    };
  }
};

const mockUserSessions = [];

const mockUserSessionRepo = {
  async create(data) {
    const session = {
      _id: `mock-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user: data.user,
      refreshTokenHash: data.refreshTokenHash,
      oldTokenHashes: data.oldTokenHashes || [],
      deviceName: data.deviceName || 'Unknown Device',
      deviceType: data.deviceType || 'Unknown',
      ipAddress: data.ipAddress || '',
      location: data.location || '',
      lastActive: data.lastActive || new Date(),
      isRevoked: data.isRevoked !== undefined ? data.isRevoked : false,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      async save() {
        this.updatedAt = new Date();
        const index = mockUserSessions.findIndex(s => s._id === this._id);
        if (index !== -1) {
          mockUserSessions[index] = { ...this };
        }
        return this;
      }
    };
    mockUserSessions.push(session);
    return session;
  },

  async findOne(query) {
    const session = mockUserSessions.find(s => {
      if (query.refreshTokenHash && s.refreshTokenHash !== query.refreshTokenHash) return false;
      if (query.isRevoked !== undefined && s.isRevoked !== query.isRevoked) return false;
      if (query.oldTokenHashes && !s.oldTokenHashes.includes(query.oldTokenHashes)) return false;
      return true;
    });
    if (!session) return null;
    return this._wrapSession(session);
  },

  async findById(id) {
    const session = mockUserSessions.find(s => s._id === id);
    if (!session) return null;
    return this._wrapSession(session);
  },

  async find(query) {
    const sessions = mockUserSessions.filter(s => {
      if (query.user && s.user.toString() !== query.user.toString()) return false;
      if (query.isRevoked !== undefined && s.isRevoked !== query.isRevoked) return false;
      return true;
    });
    return sessions.map(s => this._wrapSession(s));
  },

  async updateMany(query, update) {
    let count = 0;
    mockUserSessions.forEach(s => {
      let matches = true;
      if (query.user && s.user.toString() !== query.user.toString()) matches = false;
      if (query.isRevoked !== undefined && s.isRevoked !== query.isRevoked) matches = false;
      
      if (matches) {
        if (update.isRevoked !== undefined) s.isRevoked = update.isRevoked;
        s.updatedAt = new Date();
        count++;
      }
    });
    return { modifiedCount: count };
  },

  _wrapSession(session) {
    return {
      ...session,
      async save() {
        this.updatedAt = new Date();
        const index = mockUserSessions.findIndex(s => s._id === this._id);
        if (index !== -1) {
          mockUserSessions[index] = { ...this };
        }
        return this;
      }
    };
  }
};

// In-memory array storage for mock comments
const mockComments = [];

const mockCommentRepo = {
  async find({ creation, skip = 0, limit = 20 }) {
    const creationIdStr = creation ? creation.toString() : '';
    const list = mockComments.filter(c => c.creation && c.creation.toString() === creationIdStr);
    list.sort((a, b) => b.createdAt - a.createdAt);
    const paginated = list.slice(skip, skip + limit);
    return {
      comments: paginated,
      total: list.length
    };
  },
  async findById(id) {
    return mockComments.find(c => c._id === id);
  },
  async create({ creation, user, username, userAvatar, text }) {
    const newComment = {
      _id: `mock-comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      creation,
      user,
      username,
      userAvatar: userAvatar || '',
      text,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockComments.push(newComment);
    return newComment;
  },
  async findByIdAndDelete(id) {
    const idx = mockComments.findIndex(c => c._id === id);
    if (idx === -1) return null;
    const deleted = mockComments[idx];
    mockComments.splice(idx, 1);
    return deleted;
  }
};

// In-memory array storage for mock notifications
const mockNotifications = [];

const mockNotificationRepo = {
  async find({ recipient, skip = 0, limit = 20 }) {
    const recipientIdStr = recipient ? recipient.toString() : '';
    const list = mockNotifications.filter(n => n.recipient && n.recipient.toString() === recipientIdStr);
    list.sort((a, b) => b.createdAt - a.createdAt);
    const paginated = list.slice(skip, skip + limit);
    return paginated.map(n => this._populateFields(n));
  },
  
  async findById(id) {
    const notification = mockNotifications.find(n => n._id === id);
    if (!notification) return null;
    return this._populateFields(notification);
  },
  
  async findByIdAndUpdate(id, updates) {
    const idx = mockNotifications.findIndex(n => n._id === id);
    if (idx === -1) return null;
    mockNotifications[idx] = {
      ...mockNotifications[idx],
      ...updates,
      updatedAt: new Date()
    };
    return this._populateFields(mockNotifications[idx]);
  },
  
  async updateMany(query, updates) {
    let count = 0;
    mockNotifications.forEach(n => {
      let matches = true;
      if (query.recipient && n.recipient.toString() !== query.recipient.toString()) matches = false;
      if (query.isRead !== undefined && n.isRead !== query.isRead) matches = false;
      
      if (matches) {
        if (updates.isRead !== undefined) n.isRead = updates.isRead;
        n.updatedAt = new Date();
        count++;
      }
    });
    return { modifiedCount: count };
  },

  async create({ recipient, actor, type, creation, message }) {
    const newNotification = {
      _id: `mock-notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      recipient: recipient.toString(),
      actor: actor.toString(),
      type,
      creation: creation ? creation.toString() : undefined,
      message: message || undefined,
      isRead: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockNotifications.push(newNotification);
    return this._populateFields(newNotification);
  },
  
  _populateFields(notification) {
    // Find actor user
    const actorUser = mockUsers.find(u => u._id === notification.actor);
    const actorObj = actorUser ? {
      _id: actorUser._id,
      fullName: actorUser.fullName,
      username: actorUser.username || 'user',
      avatarUrl: actorUser.avatarUrl || actorUser.profileImage || ''
    } : {
      _id: notification.actor,
      fullName: 'System User',
      username: 'system',
      avatarUrl: ''
    };
    
    // Find creation
    let creationObj = null;
    if (notification.creation) {
      const creation = mockCreations.find(c => c._id === notification.creation);
      if (creation) {
        creationObj = {
          _id: creation._id,
          title: creation.title,
          category: creation.category
        };
      }
    }
    
    return {
      ...notification,
      actor: actorObj,
      creation: creationObj
    };
  }
};

const mockConversationRepo = {
  async find(query = {}) {
    let list = [...mockConversations];
    if (query.participant) {
      list = list.filter(c => c.participants.map(p => p.toString()).includes(query.participant.toString()));
    }
    list.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    return list.map(c => this._populateConversation(c));
  },

  async findOne(query = {}) {
    let list = [...mockConversations];
    if (query.participants && query.participants.$all) {
      const targets = query.participants.$all.map(t => t.toString());
      list = list.filter(c => 
        c.participants.length === targets.length &&
        targets.every(t => c.participants.map(p => p.toString()).includes(t))
      );
    }
    if (list.length === 0) return null;
    return this._populateConversation(list[0]);
  },

  async findById(id) {
    const conv = mockConversations.find(c => c._id === id);
    if (!conv) return null;
    return this._populateConversation(conv);
  },

  async create(data) {
    const newConv = {
      _id: `mock-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      participants: data.participants.map(p => p.toString()),
      isCollab: data.isCollab || false,
      collabRequest: data.collabRequest || null,
      lastMessage: null,
      lastActivity: new Date(),
      unreadCounts: {},
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockConversations.push(newConv);
    return this._populateConversation(newConv);
  },

  async findByIdAndUpdate(id, updates) {
    const idx = mockConversations.findIndex(c => c._id === id);
    if (idx === -1) return null;
    
    let updatedUnread = mockConversations[idx].unreadCounts || {};
    if (updates.unreadCounts) {
      if (typeof updates.unreadCounts.forEach === 'function') {
        updates.unreadCounts.forEach((val, key) => {
          updatedUnread[key] = val;
        });
      } else {
        updatedUnread = { ...updatedUnread, ...updates.unreadCounts };
      }
    }

    mockConversations[idx] = {
      ...mockConversations[idx],
      ...updates,
      unreadCounts: updatedUnread,
      updatedAt: new Date()
    };
    return this._populateConversation(mockConversations[idx]);
  },

  _populateConversation(conv) {
    const populatedParticipants = conv.participants.map(pId => {
      const u = mockUsers.find(user => user._id === pId.toString());
      return u ? {
        _id: u._id,
        fullName: u.fullName,
        username: u.username || 'user',
        category: u.category,
        avatarUrl: u.avatarUrl,
        profileImage: u.profileImage
      } : { _id: pId, fullName: 'Unknown User', username: 'user', category: 'Artist', avatarUrl: '' };
    });

    let populatedLastMessage = null;
    if (conv.lastMessage) {
      const msg = mockMessages.find(m => m._id === conv.lastMessage.toString());
      if (msg) {
        const senderUser = mockUsers.find(u => u._id === msg.sender.toString());
        populatedLastMessage = {
          ...msg,
          sender: senderUser ? {
            _id: senderUser._id,
            fullName: senderUser.fullName,
            username: senderUser.username || 'user',
            avatarUrl: senderUser.avatarUrl,
            profileImage: senderUser.profileImage
          } : { _id: msg.sender, fullName: 'Unknown Sender' }
        };
      }
    }

    return {
      ...conv,
      participants: populatedParticipants,
      lastMessage: populatedLastMessage
    };
  }
};

const mockMessageRepo = {
  async find(query = {}) {
    let list = [...mockMessages];
    if (query.conversation) {
      list = list.filter(m => m.conversation === query.conversation.toString());
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list.map(m => this._populateMessage(m));
  },

  async findById(id) {
    const msg = mockMessages.find(m => m._id === id);
    if (!msg) return null;
    return this._populateMessage(msg);
  },

  async create(data) {
    const newMsg = {
      _id: `mock-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversation: data.conversation.toString(),
      sender: data.sender.toString(),
      type: data.type || 'text',
      content: data.content,
      imageBytes: data.imageBytes || '',
      status: data.status || 'sent',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockMessages.push(newMsg);
    
    const convIdx = mockConversations.findIndex(c => c._id === newMsg.conversation);
    if (convIdx !== -1) {
      mockConversations[convIdx].lastMessage = newMsg._id;
      mockConversations[convIdx].lastActivity = newMsg.createdAt;
    }

    return this._populateMessage(newMsg);
  },

  async findByIdAndUpdate(id, updates) {
    const idx = mockMessages.findIndex(m => m._id === id);
    if (idx === -1) return null;
    mockMessages[idx] = {
      ...mockMessages[idx],
      ...updates,
      updatedAt: new Date()
    };
    return this._populateMessage(mockMessages[idx]);
  },

  async updateMany(query = {}, updates = {}) {
    let count = 0;
    mockMessages.forEach((m, idx) => {
      let matches = true;
      if (query.conversation && m.conversation !== query.conversation.toString()) {
        matches = false;
      }
      if (query.sender && m.sender !== query.sender.toString()) {
        matches = false;
      }
      if (query.status && m.status !== query.status) {
        matches = false;
      }
      
      if (matches) {
        mockMessages[idx] = {
          ...m,
          ...updates,
          updatedAt: new Date()
        };
        count++;
      }
    });
    return { nModified: count };
  },

  _populateMessage(msg) {
    const senderUser = mockUsers.find(u => u._id === msg.sender.toString());
    return {
      ...msg,
      sender: senderUser ? {
        _id: senderUser._id,
        fullName: senderUser.fullName,
        username: senderUser.username || 'user',
        avatarUrl: senderUser.avatarUrl,
        profileImage: senderUser.profileImage
      } : { _id: msg.sender, fullName: 'Unknown Sender' }
    };
  }
};

// ============================================================================
// ECONOMY SYSTEM MOCK DATABASE & REPOSITORIES
// ============================================================================
const mockQuillWallets = [];
const mockGemWallets = [];
const mockTaskCompletions = [];

const mockQuillWalletRepo = {
  async findOne(query = {}) {
    let wallet = mockQuillWallets.find(w => w.user === query.user);
    if (!wallet && query.user) {
      wallet = {
        _id: `mock-qw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user: query.user,
        quills: 24,
        premiumQuills: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        async save() {
          this.updatedAt = new Date();
          const idx = mockQuillWallets.findIndex(w => w._id === this._id);
          if (idx !== -1) mockQuillWallets[idx] = { ...this };
          return this;
        }
      };
      mockQuillWallets.push(wallet);
    }
    return wallet;
  }
};

const mockGemWalletRepo = {
  async findOne(query = {}) {
    let wallet = mockGemWallets.find(w => w.user === query.user);
    if (!wallet && query.user) {
      wallet = {
        _id: `mock-gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user: query.user,
        gems: 138,
        dailyGemsEarned: 0,
        lastResetDate: null,
        purchasedBadges: [],
        purchasedThemes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        async save() {
          this.updatedAt = new Date();
          const idx = mockGemWallets.findIndex(w => w._id === this._id);
          if (idx !== -1) mockGemWallets[idx] = { ...this };
          return this;
        }
      };
      mockGemWallets.push(wallet);
    }
    return wallet;
  }
};

const mockTransactionRepo = {
  async create(data) {
    const tx = {
      _id: `mock-tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user: data.user,
      amount: data.amount,
      currency: data.currency,
      type: data.type,
      source: data.source,
      referenceId: data.referenceId || '',
      description: data.description || '',
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockTransactions.push(tx);
    return tx;
  },
  async find(query = {}) {
    let list = [...mockTransactions];
    if (query.user) {
      list = list.filter(tx => tx.user === query.user);
    }
    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  },
  async findById(id) {
    return mockTransactions.find(tx => tx._id === id) || null;
  },
  async findOne(query = {}) {
    if (query.referenceId) {
      return mockTransactions.find(tx => tx.referenceId === query.referenceId) || null;
    }
    if (query._id) {
      return mockTransactions.find(tx => tx._id === query._id) || null;
    }
    return null;
  }
};

const mockTaskCompletionRepo = {
  async create(data) {
    const tc = {
      _id: `mock-tc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user: data.user,
      taskId: data.taskId,
      completedAt: new Date(),
      dateString: data.dateString,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockTaskCompletions.push(tc);
    return tc;
  },
  async find(query = {}) {
    let list = [...mockTaskCompletions];
    if (query.user) {
      list = list.filter(tc => tc.user === query.user);
    }
    if (query.taskId) {
      list = list.filter(tc => tc.taskId === query.taskId);
    }
    if (query.dateString) {
      list = list.filter(tc => tc.dateString === query.dateString);
    }
    return list;
  },
  async findOne(query = {}) {
    const list = await this.find(query);
    return list.length > 0 ? list[0] : null;
  }
};

const mockPremiumPurchaseRepo = {
  async create(data) {
    const purchase = {
      _id: `mock-pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user: data.user,
      packId: data.packId,
      amount: data.amount,
      currency: data.currency || 'INR',
      premiumQuillsAwarded: data.premiumQuillsAwarded,
      gemsAwarded: data.gemsAwarded || 0,
      paymentProvider: data.paymentProvider,
      paymentId: data.paymentId || '',
      orderId: data.orderId || `mock-order-${Date.now()}`,
      status: data.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      async save() {
        this.updatedAt = new Date();
        const idx = mockPremiumPurchases.findIndex(p => p._id === this._id);
        if (idx !== -1) mockPremiumPurchases[idx] = { ...this };
        return this;
      }
    };
    mockPremiumPurchases.push(purchase);
    return purchase;
  },
  async findOne(query = {}) {
    let list = [...mockPremiumPurchases];
    if (query.orderId) {
      list = list.filter(p => p.orderId === query.orderId);
    }
    return list.length > 0 ? list[0] : null;
  }
};

// ============================================================================
// ANNOTATION MOCK DATABASE & REPOSITORIES
// ============================================================================
const mockAnnotations = [];

const mockAnnotationRepo = {
  async find(query = {}) {
    let list = [...mockAnnotations];
    if (query.creation) {
      list = list.filter(a => a.creation === query.creation);
    }
    if (query.user) {
      list = list.filter(a => a.user === query.user);
    }
    return list;
  },
  async findById(id) {
    const ann = mockAnnotations.find(a => a._id === id);
    return ann || null;
  },
  async create({ user, creation, type, text, startOffset, endOffset, color }) {
    const newAnn = {
      _id: `mock-ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user,
      creation,
      type,
      text: text || '',
      startOffset,
      endOffset,
      color: color || '#FFFF00',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockAnnotations.push(newAnn);
    return newAnn;
  },
  async findByIdAndDelete(id) {
    const idx = mockAnnotations.findIndex(a => a._id === id);
    if (idx === -1) return null;
    const deleted = mockAnnotations[idx];
    mockAnnotations.splice(idx, 1);
    return deleted;
  }
};

// ============================================================================
// VERIFICATION REQUEST MOCK DATABASE & REPOSITORIES
// ============================================================================

const mockVerificationRequestRepo = {
  async find(query = {}) {
    let list = [...mockVerificationRequests];
    if (query.status) {
      list = list.filter(v => v.status === query.status);
    }
    if (query.user) {
      list = list.filter(v => v.user === query.user);
    }
    return list.map(v => this._populateFields(v));
  },
  async findById(id) {
    const request = mockVerificationRequests.find(v => v._id === id);
    if (!request) return null;
    return this._wrapRequest(request);
  },
  async create(data) {
    const request = {
      _id: `mock-vr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user: data.user,
      portfolioLinks: data.portfolioLinks || [],
      bio: data.bio || '',
      status: data.status || 'pending',
      feedback: data.feedback || '',
      reviewedBy: data.reviewedBy || null,
      reviewedAt: data.reviewedAt || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockVerificationRequests.push(request);
    return this._populateFields(request);
  },
  async findByIdAndUpdate(id, updateData) {
    const idx = mockVerificationRequests.findIndex(v => v._id === id);
    if (idx === -1) return null;
    mockVerificationRequests[idx] = {
      ...mockVerificationRequests[idx],
      ...updateData,
      updatedAt: new Date()
    };
    return this._populateFields(mockVerificationRequests[idx]);
  },
  _populateFields(vr) {
    const populatedUser = mockUsers.find(u => u._id === vr.user.toString()) || { _id: vr.user, fullName: 'Unknown User' };
    const populatedReviewer = vr.reviewedBy ? (mockUsers.find(u => u._id === vr.reviewedBy.toString()) || { _id: vr.reviewedBy, fullName: 'Unknown Admin' }) : null;
    return {
      ...vr,
      user: {
        _id: populatedUser._id,
        fullName: populatedUser.fullName,
        username: populatedUser.username,
        email: populatedUser.email
      },
      reviewedBy: populatedReviewer ? {
        _id: populatedReviewer._id,
        fullName: populatedReviewer.fullName,
        username: populatedReviewer.username,
        email: populatedReviewer.email
      } : null
    };
  },
  _wrapRequest(vr) {
    const self = this;
    return {
      ...vr,
      async save() {
        const idx = mockVerificationRequests.findIndex(v => v._id === this._id);
        if (idx !== -1) {
          mockVerificationRequests[idx] = {
            ...mockVerificationRequests[idx],
            status: this.status,
            feedback: this.feedback,
            reviewedBy: this.reviewedBy,
            reviewedAt: this.reviewedAt,
            updatedAt: new Date()
          };
          return self._populateFields(mockVerificationRequests[idx]);
        }
        return this;
      }
    };
  }
};

// ============================================================================
// AUDIT LOG MOCK DATABASE & REPOSITORIES
// ============================================================================

const mockAuditLogRepo = {
  async find(query = {}) {
    let list = [...mockAuditLogs];
    if (query.admin) {
      list = list.filter(l => l.admin === query.admin);
    }
    if (query.actionType) {
      list = list.filter(l => l.actionType === query.actionType);
    }
    if (query.targetModel) {
      list = list.filter(l => l.targetModel === query.targetModel);
    }
    if (query.targetId) {
      list = list.filter(l => l.targetId === query.targetId);
    }
    // Sort in reverse chronological order
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.map(l => this._populateFields(l));
  },
  async create(data) {
    const log = {
      _id: `mock-audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      admin: data.admin,
      actionType: data.actionType,
      targetModel: data.targetModel,
      targetId: data.targetId,
      description: data.description || '',
      previousState: data.previousState || null,
      newState: data.newState || null,
      ipAddress: data.ipAddress || '',
      createdAt: new Date()
    };
    mockAuditLogs.push(log);
    return this._populateFields(log);
  },
  _populateFields(log) {
    const populatedAdmin = mockUsers.find(u => u._id === log.admin.toString()) || { _id: log.admin, fullName: 'Unknown Admin' };
    return {
      ...log,
      admin: {
        _id: populatedAdmin._id,
        fullName: populatedAdmin.fullName,
        username: populatedAdmin.username,
        email: populatedAdmin.email
      }
    };
  }
};

module.exports = { 
  mockUserRepo, 
  mockUsers, 
  mockReportRepo, 
  mockReports, 
  mockCreations, 
  mockCreationRepo,
  mockCollabRequests,
  mockCollabChats,
  mockCollabRequestRepo,
  mockCollabChatRepo,
  mockReadingProgress,
  mockReadingProgressRepo,
  mockUserSessions,
  mockUserSessionRepo,
  mockComments,
  mockCommentRepo,
  mockNotifications,
  mockNotificationRepo,
  mockConversations,
  mockMessages,
  mockConversationRepo,
  mockMessageRepo,
  mockQuillWalletRepo,
  mockQuillWallets,
  mockGemWalletRepo,
  mockGemWallets,
  mockTransactionRepo,
  mockTransactions,
  mockTaskCompletionRepo,
  mockTaskCompletions,
  mockPremiumPurchaseRepo,
  mockPremiumPurchases,
  mockAnnotations,
  mockAnnotationRepo,
  mockVerificationRequests,
  mockVerificationRequestRepo,
  mockAuditLogs,
  mockAuditLogRepo
};
