/**
 * Test & Verification Script for Talvion Google OAuth authentication logic.
 * Run using: node src/utils/verify_google_auth.js
 */

// Set offline mode environment variable
process.env.DB_OFFLINE = 'true';
process.env.JWT_SECRET = 'test_secret_for_google_auth_verification';

const { googleSignIn } = require('../controllers/auth.controller');
const { mockUsers } = require('../models/mock.db');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING TALVION GOOGLE AUTH VERIFICATION TESTS');
  console.log('====================================================\n');

  // Helper to construct mock Express request, response, and next
  const createMockReqRes = (body, headers = {}) => {
    const req = {
      body,
      headers: {
        'user-agent': 'Dart/3.0 (dart:io) Flutter',
        ...headers
      },
      socket: {
        remoteAddress: '127.0.0.1'
      },
      ip: '127.0.0.1'
    };
    
    let statusCode = 200;
    let jsonPayload = null;
    let nextError = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonPayload = payload;
        return this;
      }
    };

    const next = (err) => {
      nextError = err;
    };

    return {
      req,
      res,
      next,
      getResult: () => ({ statusCode, jsonPayload, nextError })
    };
  };

  console.log('1. Testing existing user Google sign-in (Meera)...');
  const meeraTest = createMockReqRes({ idToken: 'mock_google_id_token_meera' });
  await googleSignIn(meeraTest.req, meeraTest.res, meeraTest.next);
  const meeraResult = meeraTest.getResult();
  
  assert(!meeraResult.nextError, `Should not error: ${meeraResult.nextError?.message}`);
  assert(meeraResult.statusCode === 200, `Expected 200, got ${meeraResult.statusCode}`);
  assert(meeraResult.jsonPayload.status === 'success', 'Status should be success');
  assert(meeraResult.jsonPayload.user.email === 'meera@example.com', 'Email should be meera@example.com');
  assert(meeraResult.jsonPayload.user.authProvider === 'google', 'authProvider should be updated to google');
  console.log('✅ Existing user signed in and linked successfully.\n');

  console.log('2. Testing existing user Google sign-in (Riya)...');
  const riyaTest = createMockReqRes({ idToken: 'mock_google_id_token_riya' });
  await googleSignIn(riyaTest.req, riyaTest.res, riyaTest.next);
  const riyaResult = riyaTest.getResult();

  assert(!riyaResult.nextError, `Should not error: ${riyaResult.nextError?.message}`);
  assert(riyaResult.statusCode === 200, 'Expected 200');
  assert(riyaResult.jsonPayload.user.email === 'riya@example.com', 'Email should be riya@example.com');
  assert(riyaResult.jsonPayload.user.authProvider === 'google', 'authProvider should be updated to google');
  console.log('✅ Second existing user signed in and linked successfully.\n');

  console.log('3. Testing new user Google registration...');
  const newTest = createMockReqRes({ idToken: 'mock_google_id_token_new' });
  await googleSignIn(newTest.req, newTest.res, newTest.next);
  const newResult = newTest.getResult();

  assert(!newResult.nextError, `Should not error: ${newResult.nextError?.message}`);
  assert(newResult.statusCode === 200, 'Expected 200');
  assert(newResult.jsonPayload.user.email === 'new_google_user@gmail.com', 'Email should match');
  assert(newResult.jsonPayload.user.username.startsWith('new_google_user') || newResult.jsonPayload.user.username.startsWith('new_user'), 'Username should be generated from email prefix');
  assert(newResult.jsonPayload.user.authProvider === 'google', 'authProvider should be google');
  console.log('✅ New Google user registered and generated unique username: ' + newResult.jsonPayload.user.username + '\n');

  console.log('4. Testing error cases - missing token...');
  const failTest = createMockReqRes({});
  await googleSignIn(failTest.req, failTest.res, failTest.next);
  const failResult = failTest.getResult();
  
  assert(failResult.nextError, 'Should error when token is missing');
  assert(failResult.nextError.statusCode === 400, 'Status code should be 400');
  assert(failResult.nextError.message === 'Google ID token is required', 'Correct error message');
  console.log('✅ Missing token rejected successfully.\n');

  console.log('====================================================');
  console.log('🎉 ALL TALVION GOOGLE AUTH VERIFICATION TESTS PASSED');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
