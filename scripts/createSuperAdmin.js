require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (str) => new Promise((resolve) => rl.question(str, resolve));

async function run() {
  console.log('\n======================================');
  console.log('TALVION - CREATE INITIAL SUPER ADMIN');
  console.log('======================================\n');

  const name = await question('Enter Full Name: ');
  const email = await question('Enter Email Address: ');
  const password = await question('Enter Password (min 6 chars): ');

  if (!name.trim() || !email.trim() || !password.trim()) {
    console.error('\n❌ Error: All fields are required.');
    rl.close();
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('\n❌ Error: Password must be at least 6 characters.');
    rl.close();
    process.exit(1);
  }

  const isOffline = process.env.DB_OFFLINE === 'true';

  if (isOffline) {
    // Offline Mock DB mode
    const mockAdminPath = path.resolve(__dirname, '../mock-admin.json');
    let mockUsers = [];

    if (fs.existsSync(mockAdminPath)) {
      try {
        const fileContent = fs.readFileSync(mockAdminPath, 'utf8');
        mockUsers = JSON.parse(fileContent);
        if (!Array.isArray(mockUsers)) {
          mockUsers = mockUsers ? [mockUsers] : [];
        }
      } catch (err) {
        mockUsers = [];
      }
    }

    // Check if duplicate exists
    const adminExists = mockUsers.some(u => u.email.toLowerCase() === email.toLowerCase().trim() || u.role === 'super_admin');
    if (adminExists) {
      console.error('\n❌ Error: A Super Admin already exists in mock mode.');
      rl.close();
      process.exit(1);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newAdmin = {
      _id: `mock-user-admin-${Date.now()}`,
      fullName: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      username: 'admin',
      role: 'super_admin',
      status: 'active',
      statusReason: '',
      statusUntil: null,
      isVerified: true,
      moderationNotes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    mockUsers.push(newAdmin);
    fs.writeFileSync(mockAdminPath, JSON.stringify(mockUsers, null, 2));

    console.log('\n======================================');
    console.log('✅ Success: Super Admin created in mock mode.');
    console.log(`Saved to: ${mockAdminPath}`);
    console.log(`Email: ${email.toLowerCase().trim()}`);
    console.log('======================================\n');
    rl.close();
  } else {
    // MongoDB Live mode
    const mongoose = require('mongoose');
    const User = require('../src/models/user.model');
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/talvion';

    try {
      console.log('Connecting to MongoDB...');
      await mongoose.connect(mongoURI);
      console.log('Connected.');

      // Check if super_admin exists
      const existingAdmin = await User.findOne({ role: 'super_admin' });
      if (existingAdmin) {
        console.error('\n❌ Error: A Super Admin already exists in the database.');
        mongoose.connection.close();
        rl.close();
        process.exit(1);
      }

      // Check if email already used
      const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingEmail) {
        console.error('\n❌ Error: Email is already registered.');
        mongoose.connection.close();
        rl.close();
        process.exit(1);
      }

      // Create new Super Admin
      const newAdmin = new User({
        fullName: name.trim(),
        email: email.toLowerCase().trim(),
        password: password, // Hashes automatically via mongoose pre-save hook
        username: 'admin',
        role: 'super_admin',
        status: 'active',
        isVerified: true
      });

      await newAdmin.save();

      console.log('\n======================================');
      console.log('✅ Success: Super Admin created in database.');
      console.log(`Email: ${email.toLowerCase().trim()}`);
      console.log('======================================\n');
    } catch (err) {
      console.error('\n❌ MongoDB Error:', err.message);
    } finally {
      await mongoose.connection.close();
      rl.close();
    }
  }
}

run();
