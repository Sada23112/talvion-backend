const bcrypt = require('bcryptjs');

// In-memory array storage for mock users
const mockUsers = [];

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

  async create({ fullName, email, password, username }) {
    // Hash password just like the mongoose schema hook
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
      _id: `mock-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fullName,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      username: username ? username.trim().toLowerCase() : undefined,
      bio: '',
      location: '',
      category: 'Artist',
      avatarUrl: '',
      bannerUrl: '',
      profileImage: '',
      bannerImage: '',
      totalStars: 0,
      walletBalance: 0,
      emailVerified: false,
      emailVerifiedAt: null,
      emailVerificationToken: undefined,
      emailVerificationExpires: undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockUsers.push(newUser);

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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Chainable query helpers
      select(fields) {
        return this;
      },
      // Password comparison method
      async comparePassword(candidatePassword) {
        return await bcrypt.compare(candidatePassword, this.password);
      },
      async save() {
        const rawUser = mockUsers.find(u => u._id === this._id);
        if (rawUser) {
          if (this.password !== rawUser.password) {
            const salt = await bcrypt.genSalt(10);
            rawUser.password = await bcrypt.hash(this.password, salt);
          }
          rawUser.fullName = this.fullName;
          rawUser.username = this.username;
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
          rawUser.updatedAt = new Date();
          
          this.password = rawUser.password;
          this.updatedAt = rawUser.updatedAt;
        }
        return this;
      }
    };
  }
};

// In-memory array storage for support reports
const mockReports = [];

const mockReportRepo = {
  async create({ user, description }) {
    const newReport = {
      _id: `mock-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user,
      description,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    mockReports.push(newReport);
    console.log(`[Offline Support] New report registered: "${description}" by user ID ${user}`);
    return newReport;
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

    // Filter by search keyword (in title, caption, hashtags)
    if (query.search) {
      const s = query.search.toLowerCase();
      list = list.filter(c => 
        (c.title && c.title.toLowerCase().includes(s)) || 
        (c.caption && c.caption.toLowerCase().includes(s)) || 
        (c.hashtags && c.hashtags.some(t => t && t.toLowerCase().includes(s)))
      );
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

  async create({ creator, title, caption, category, content, gradientColors, hashtags, pages, readTime, isJoint, is18Plus, tags, mentions, media }) {
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

    return {
      ...creation,
      creator: creatorObj
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
if (mockUsers.length === 0) {
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

  async create({ recipient, actor, type, creation }) {
    const newNotification = {
      _id: `mock-notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      recipient: recipient.toString(),
      actor: actor.toString(),
      type,
      creation: creation ? creation.toString() : undefined,
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
  mockMessageRepo
};
