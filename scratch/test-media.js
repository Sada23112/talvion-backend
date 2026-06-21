const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Force offline/mock mode for local test
process.env.DB_OFFLINE = 'true';
process.env.JWT_SECRET = 'test_secret_key_12345';
process.env.PORT = '5002';

const app = require('../src/app');

const server = app.listen(5002, async () => {
  console.log('Test server started on port 5002 in mock mode.');
  try {
    await runTests();
    console.log('\n=============================================');
    console.log('✅ ALL PROFILE MEDIA TESTS PASSED SUCCESSFULLY!');
    console.log('=============================================');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ PROFILE MEDIA TESTS FAILED:');
    console.error(err);
    server.close();
    process.exit(1);
  }
});

async function runTests() {
  const authUrl = 'http://localhost:5002/api/v1/auth';
  const usersUrl = 'http://localhost:5002/api/v1/users';
  const testEmail = `media_${Date.now()}@example.com`;
  const testUsername = `mediauser_${Date.now()}`;
  const testPassword = 'Password123';

  // 1. Signup user to get token
  console.log('\n--- 1. Signing up test user ---');
  const signupRes = await fetch(`${authUrl}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Media Tester',
      email: testEmail,
      username: testUsername,
      password: testPassword
    })
  });
  const signupData = await signupRes.json();
  if (signupRes.status !== 201) {
    throw new Error(`Signup failed: ${JSON.stringify(signupData)}`);
  }
  const token = signupData.accessToken;
  console.log('Signup success. JWT token obtained.');

  // 2. Test profile upload authentication required
  console.log('\n--- 2. Testing unauthenticated upload ---');
  const unauthRes = await fetch(`${usersUrl}/me/avatar`, {
    method: 'POST'
  });
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated upload, got ${unauthRes.status}`);
  }
  console.log('Pass: Unauthenticated upload blocked with 401.');

  // 3. Test Avatar Upload (Success)
  console.log('\n--- 3. Testing avatar image upload (PNG) ---');
  const avatarBlob = new Blob(['fake png data'], { type: 'image/png' });
  const avatarForm = new FormData();
  avatarForm.append('avatar', avatarBlob, 'avatar.png');

  const avatarRes = await fetch(`${usersUrl}/me/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: avatarForm
  });
  const avatarData = await avatarRes.json();
  if (avatarRes.status !== 200) {
    throw new Error(`Avatar upload failed: ${JSON.stringify(avatarData)}`);
  }
  console.log('Avatar upload success. Returned user data:');
  console.log(`- profileImage: ${avatarData.user.profileImage}`);
  console.log(`- avatarUrl: ${avatarData.user.avatarUrl}`);
  if (!avatarData.user.profileImage.startsWith('/uploads/avatar-')) {
    throw new Error(`Invalid profileImage path returned: ${avatarData.user.profileImage}`);
  }

  // 4. Test Banner Upload (Success)
  console.log('\n--- 4. Testing banner image upload (JPEG) ---');
  const bannerBlob = new Blob(['fake jpeg data'], { type: 'image/jpeg' });
  const bannerForm = new FormData();
  bannerForm.append('banner', bannerBlob, 'banner.jpg');

  const bannerRes = await fetch(`${usersUrl}/me/banner`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: bannerForm
  });
  const bannerData = await bannerRes.json();
  if (bannerRes.status !== 200) {
    throw new Error(`Banner upload failed: ${JSON.stringify(bannerData)}`);
  }
  console.log('Banner upload success. Returned user data:');
  console.log(`- bannerImage: ${bannerData.user.bannerImage}`);
  console.log(`- bannerUrl: ${bannerData.user.bannerUrl}`);
  if (!bannerData.user.bannerImage.startsWith('/uploads/banner-')) {
    throw new Error(`Invalid bannerImage path returned: ${bannerData.user.bannerImage}`);
  }

  // 5. Test Fetching User Profile
  console.log('\n--- 5. Testing user profile query fields ---');
  const profileRes = await fetch(`${usersUrl}/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const profileData = await profileRes.json();
  if (profileRes.status !== 200) {
    throw new Error(`Profile fetch failed: ${JSON.stringify(profileData)}`);
  }
  if (!profileData.user.profileImage || !profileData.user.bannerImage) {
    throw new Error('Profile image fields missing in profile query response');
  }
  console.log('Pass: Profile fields persisted and returned correctly.');

  // 6. Test Fetching Images Directly
  console.log('\n--- 6. Testing direct avatar fetch ---');
  const fetchAvatarRes = await fetch(`${usersUrl}/me/avatar`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (fetchAvatarRes.status !== 200) {
    throw new Error(`Expected 200 when fetching avatar, got ${fetchAvatarRes.status}`);
  }
  console.log('Pass: Direct avatar fetch successful.');

  console.log('\n--- 7. Testing direct banner fetch ---');
  const fetchBannerRes = await fetch(`${usersUrl}/me/banner`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (fetchBannerRes.status !== 200) {
    throw new Error(`Expected 200 when fetching banner, got ${fetchBannerRes.status}`);
  }
  console.log('Pass: Direct banner fetch successful.');

  // 7a. Test application/octet-stream with valid extension (.png)
  console.log('\n--- 7a. Testing upload with application/octet-stream and valid extension (.png) ---');
  const octetPngBlob = new Blob(['fake png data'], { type: 'application/octet-stream' });
  const octetPngForm = new FormData();
  octetPngForm.append('avatar', octetPngBlob, 'avatar.png');

  const octetPngRes = await fetch(`${usersUrl}/me/avatar`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: octetPngForm
  });
  const octetPngData = await octetPngRes.json();
  if (octetPngRes.status !== 200) {
    throw new Error(`Octet PNG upload failed: ${JSON.stringify(octetPngData)}`);
  }
  console.log('Pass: Successfully resolved application/octet-stream with .png extension.');

  // 7b. Test application/octet-stream with invalid extension (.txt)
  console.log('\n--- 7b. Testing upload with application/octet-stream and invalid extension (.txt) ---');
  const octetTxtBlob = new Blob(['fake txt data'], { type: 'application/octet-stream' });
  const octetTxtForm = new FormData();
  octetTxtForm.append('avatar', octetTxtBlob, 'test.txt');

  const octetTxtRes = await fetch(`${usersUrl}/me/avatar`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: octetTxtForm
  });
  const octetTxtData = await octetTxtRes.json();
  if (octetTxtRes.status !== 400) {
    throw new Error(`Expected 400 for invalid octet-stream extension, got ${octetTxtRes.status}. Data: ${JSON.stringify(octetTxtData)}`);
  }
  console.log('Pass: Successfully blocked application/octet-stream with .txt extension.');

  // 7. Test Mime-Type validation
  console.log('\n--- 8. Testing invalid file type validation (text/plain) ---');
  const invalidBlob = new Blob(['invalid text'], { type: 'text/plain' });
  const invalidForm = new FormData();
  invalidForm.append('avatar', invalidBlob, 'test.txt');

  const invalidRes = await fetch(`${usersUrl}/me/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: invalidForm
  });
  const invalidData = await invalidRes.json();
  if (invalidRes.status !== 400) {
    throw new Error(`Expected 400 for invalid file type, got ${invalidRes.status}. Data: ${JSON.stringify(invalidData)}`);
  }
  console.log('Pass: Blocked invalid mime-type with 400.');

  // 8. Test File Size validation (6MB > 5MB limit)
  console.log('\n--- 9. Testing file size validation (6MB > 5MB limit) ---');
  const largeBlob = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' });
  const largeForm = new FormData();
  largeForm.append('avatar', largeBlob, 'large.png');

  const largeRes = await fetch(`${usersUrl}/me/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: largeForm
  });
  const largeData = await largeRes.json();
  if (largeRes.status !== 400 && largeRes.status !== 500) {
    // Multer size limits trigger either a size limit error (400) or error handler catches it (500)
    throw new Error(`Expected size limit failure, got status ${largeRes.status}. Data: ${JSON.stringify(largeData)}`);
  }
  console.log(`Pass: Size limit check successfully rejected the file. Response Status: ${largeRes.status}`);
}
