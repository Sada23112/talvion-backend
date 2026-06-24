/**
 * Test & Verification Script for Talvion Quill + Gem Economy System.
 * Run using: node src/utils/verify_economy.js
 */

// Set offline mode environment variable
process.env.DB_OFFLINE = 'true';

const EconomyService = require('../services/economy.service');
const { 
  mockUsers, 
  mockQuillWallets, 
  mockGemWallets, 
  mockTransactions, 
  mockTaskCompletions 
} = require('../models/mock.db');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING TALVION ECONOMY INTEGRATION TESTS');
  console.log('====================================================\n');

  // Clear previous runs in mock memory arrays
  mockQuillWallets.length = 0;
  mockGemWallets.length = 0;
  mockTransactions.length = 0;
  mockTaskCompletions.length = 0;

  // Let's ensure mock users are set up with correct stars/wallet
  const meera = mockUsers.find(u => u._id === 'mock-user-admin');
  const riya = mockUsers.find(u => u._id === 'mock-user-1');
  const arjun = mockUsers.find(u => u._id === 'mock-user-2');

  assert(meera && riya && arjun, 'Mock users should exist');

  meera.totalStars = 847; // Diamond tier (stars between 600 and 1000)
  riya.totalStars = 50;   // Bronze tier (stars < 100)
  arjun.totalStars = 320;  // Gold tier (stars between 300 and 600)

  console.log('1. Wallet Initialization & Retrieval...');
  const meeraQWallet = await EconomyService.getQuillWallet(meera._id);
  const meeraGWallet = await EconomyService.getGemWallet(meera._id);

  assert(meeraQWallet.quills === 24, 'Default quills should be 24');
  assert(meeraQWallet.premiumQuills === 0, 'Default premium quills should be 0');
  assert(meeraGWallet.gems === 138, 'Default gems should be 138');
  console.log('✅ Wallets initialized successfully with default balances.\n');

  console.log('2. Star-Based Earning Cap Calculation...');
  assert(EconomyService.getDailyGemsCap(0) === 10, 'Bronze cap should be 10');
  assert(EconomyService.getDailyGemsCap(50) === 10, 'Bronze cap should be 10');
  assert(EconomyService.getDailyGemsCap(150) === 20, 'Silver cap should be 20');
  assert(EconomyService.getDailyGemsCap(350) === 35, 'Gold cap should be 35');
  assert(EconomyService.getDailyGemsCap(750) === 50, 'Diamond cap should be 50');
  assert(EconomyService.getDailyGemsCap(1200) === Infinity, 'Legend cap should be Infinity');
  console.log('✅ Daily caps correctly mapped to star tiers.\n');

  console.log('3. Gem Earning & Cap Enforcement...');
  let riyaGWallet = await EconomyService.getGemWallet(riya._id);
  
  // Reset cap tracker
  EconomyService._checkAndResetDailyCap(riyaGWallet);
  assert(riyaGWallet.dailyGemsEarned === 0, 'dailyGemsEarned should be 0 after reset');

  // Earn 6 gems
  let added = await EconomyService.addGems(riya._id, 6, 'test_source');
  riyaGWallet = await EconomyService.getGemWallet(riya._id);
  console.log('After earning 6 gems: added =', added, 'wallet.gems =', riyaGWallet.gems, 'wallet.dailyGemsEarned =', riyaGWallet.dailyGemsEarned);
  assert(added === 6, 'Should be allowed to earn 6 gems');
  assert(riyaGWallet.gems === 138 + 6, 'Total gems should be 144');
  assert(riyaGWallet.dailyGemsEarned === 6, 'Daily gems earned should be 6');

  // Earn 6 more gems (capped at 10 daily, so only 4 should be added)
  added = await EconomyService.addGems(riya._id, 6, 'test_source');
  riyaGWallet = await EconomyService.getGemWallet(riya._id);
  console.log('After earning 6 more gems: added =', added, 'wallet.gems =', riyaGWallet.gems, 'wallet.dailyGemsEarned =', riyaGWallet.dailyGemsEarned);
  assert(added === 4, 'Should only earn remaining 4 gems due to cap');
  assert(riyaGWallet.gems === 138 + 10, 'Total gems should be 148');
  assert(riyaGWallet.dailyGemsEarned === 10, 'Daily gems earned should be capped at 10');

  // Try to earn 5 more, should add 0
  added = await EconomyService.addGems(riya._id, 5, 'test_source');
  riyaGWallet = await EconomyService.getGemWallet(riya._id);
  assert(added === 0, 'Should earn 0 gems when cap is reached');

  // Earn with bypassCap = true (e.g. premium purchases)
  added = await EconomyService.addGems(riya._id, 15, 'premium_purchase', true);
  riyaGWallet = await EconomyService.getGemWallet(riya._id);
  assert(added === 15, 'Bypass cap should allow earning 15 gems');
  assert(riyaGWallet.gems === 138 + 10 + 15, 'Total gems should be 163');
  assert(riyaGWallet.dailyGemsEarned === 10, 'Daily gems earned should remain 10');
  console.log('✅ Daily cap successfully limits standard earnings and supports bypass logic.\n');

  console.log('4. Quill Sending (Tipping)...');
  let riyaQWallet = await EconomyService.getQuillWallet(riya._id);
  riyaQWallet.quills = 10;
  riyaQWallet.premiumQuills = 5;
  await riyaQWallet.save();

  // Reset Meera's cap so she can earn tipping gems
  let meeraGWalletFresh = await EconomyService.getGemWallet(meera._id);
  meeraGWalletFresh.dailyGemsEarned = 0;
  meeraGWalletFresh.gems = 100;
  await meeraGWalletFresh.save();

  // Clean Riya's wallet gems and reset cap manually
  let riyaGWalletFresh = await EconomyService.getGemWallet(riya._id);
  riyaGWalletFresh.dailyGemsEarned = 0;
  riyaGWalletFresh.gems = 100;
  await riyaGWalletFresh.save();

  // Tip 2 standard quills to Meera's creation 'mock-creation-1' (Meera has 847 stars, cap=50)
  const tipResult = await EconomyService.sendQuill(riya._id, 'mock-creation-1', 2, false);
  assert(tipResult.success === true, 'Tip should succeed');
  
  riyaQWallet = await EconomyService.getQuillWallet(riya._id);
  riyaGWalletFresh = await EconomyService.getGemWallet(riya._id);
  meeraGWalletFresh = await EconomyService.getGemWallet(meera._id);

  // Riya spent 2 quills -> receives 2 gems reward
  assert(riyaQWallet.quills === 8, 'Riya quills should decrement to 8');
  assert(riyaGWalletFresh.gems === 102, 'Riya should receive 2 gems reward');

  // Meera received tip -> 2 quills * 2 gems/quill = 4 gems
  assert(meeraGWalletFresh.gems === 104, 'Meera should receive 4 gems reward');

  // Try to self-tip
  try {
    await EconomyService.sendQuill(meera._id, 'mock-creation-1', 1, false);
    assert(false, 'Should throw error when tipping own post');
  } catch (err) {
    assert(err.message === 'You cannot support your own creation', 'Self-tip error message mismatch');
  }

  // Reset caps before premium tip
  riyaGWalletFresh.dailyGemsEarned = 0;
  await riyaGWalletFresh.save();
  meeraGWalletFresh.dailyGemsEarned = 0;
  await meeraGWalletFresh.save();

  // Premium Quill tip (1 premium quill)
  const premiumTipResult = await EconomyService.sendQuill(riya._id, 'mock-creation-1', 1, true);
  assert(premiumTipResult.success === true, 'Premium tip should succeed');

  riyaQWallet = await EconomyService.getQuillWallet(riya._id);
  riyaGWalletFresh = await EconomyService.getGemWallet(riya._id);
  meeraGWalletFresh = await EconomyService.getGemWallet(meera._id);

  assert(riyaQWallet.premiumQuills === 4, 'Riya premium quills should be 4');
  assert(riyaGWalletFresh.gems === 102 + 2.5, 'Riya should receive 2.5 gems reward for premium tip');
  assert(meeraGWalletFresh.gems === 104 + 4, 'Meera should receive 4 gems reward for premium tip');
  console.log('✅ Quill/Premium Quill tipping works correctly for both sender and receiver.\n');

  console.log('5. Support Ad Watching (Limits & Cooldown)...');
  riyaQWallet = await EconomyService.getQuillWallet(riya._id);
  riyaQWallet.quills = 0;
  await riyaQWallet.save();

  // Reset Meera's cap so she can earn support ad gems
  meeraGWalletFresh = await EconomyService.getGemWallet(meera._id);
  meeraGWalletFresh.dailyGemsEarned = 0;
  await meeraGWalletFresh.save();
  
  // Reset ad transactions in mock database
  mockTransactions.length = 0;

  let adResult = await EconomyService.watchAdSupport(riya._id, 'mock-creation-1');
  riyaQWallet = await EconomyService.getQuillWallet(riya._id);
  assert(adResult.success === true, 'Ad support watch should succeed');
  assert(adResult.quillsEarned === 1, 'Viewer should earn 1 quill');
  assert(adResult.artistGemsEarned === 1, 'Artist should earn 1 gem');
  assert(riyaQWallet.quills === 1, 'Riya quills should be 1');

  // Try to watch again immediately (cooldown check)
  try {
    await EconomyService.watchAdSupport(riya._id, 'mock-creation-1');
    assert(false, 'Should throw cooldown error');
  } catch (err) {
    assert(err.message.includes('wait 30 seconds'), `Expected cooldown error, got: ${err.message}`);
  }

  // Bypass cooldown by modifying mock transaction timestamps in list
  assert(mockTransactions.length === 2, 'Should have 2 transactions logged'); // 1 quill to Riya, 1 gem to Meera
  const viewerAdTx = mockTransactions.find(t => t.user === riya._id && t.type === 'ad_reward');
  assert(viewerAdTx, 'Viewer ad reward transaction should exist');
  viewerAdTx.timestamp = new Date(Date.now() - 40000); // 40 seconds ago
  viewerAdTx.createdAt = new Date(Date.now() - 40000);

  // Watch second ad
  adResult = await EconomyService.watchAdSupport(riya._id, 'mock-creation-1');
  riyaQWallet = await EconomyService.getQuillWallet(riya._id);
  assert(adResult.success === true, 'Second ad watch should succeed after cooldown bypass');
  assert(riyaQWallet.quills === 2, 'Riya quills should be 2');

  // Push 4 more transactions to trigger daily ad limit (total 5)
  viewerAdTx.timestamp = new Date(Date.now() - 40000); // reset cooldown
  viewerAdTx.createdAt = new Date(Date.now() - 40000);
  const secondAdTx = mockTransactions.filter(t => t.user === riya._id && t.type === 'ad_reward')[1];
  secondAdTx.timestamp = new Date(Date.now() - 40000);
  secondAdTx.createdAt = new Date(Date.now() - 40000);

  // Add mock ad rewards to hit limit
  for (let i = 0; i < 3; i++) {
    await mockTransactions.push({
      user: riya._id,
      amount: 1,
      currency: 'quill',
      type: 'ad_reward',
      source: 'ad_support',
      timestamp: new Date(Date.now() - 40000 * (i + 2)),
      createdAt: new Date(Date.now() - 40000 * (i + 2))
    });
  }

  // Try 6th ad
  try {
    await EconomyService.watchAdSupport(riya._id, 'mock-creation-1');
    assert(false, 'Should throw daily limit reached error');
  } catch (err) {
    assert(err.message.includes('ad limits reached'), `Expected limit error, got: ${err.message}`);
  }
  console.log('✅ Cooldown checks and daily reward caps correctly block ad spam.\n');

  console.log('6. Daily Quest Tasks & Single-Claim Lock...');
  riyaQWallet = await EconomyService.getQuillWallet(riya._id);
  riyaQWallet.quills = 0;
  await riyaQWallet.save();

  // Reset Riya's cap so she can earn 0.5 gems
  riyaGWalletFresh = await EconomyService.getGemWallet(riya._id);
  riyaGWalletFresh.dailyGemsEarned = 0;
  await riyaGWalletFresh.save();

  const taskClaimResult = await EconomyService.claimTaskReward(riya._id, 'like_5');
  riyaQWallet = await EconomyService.getQuillWallet(riya._id);
  assert(taskClaimResult.success === true, 'Claiming quest reward should succeed');
  assert(taskClaimResult.quillsEarned === 1, 'Quest should award 1 quill');
  assert(riyaQWallet.quills === 1, 'Riya quills should increment to 1');

  // Try claiming same task again today
  try {
    await EconomyService.claimTaskReward(riya._id, 'like_5');
    assert(false, 'Should block duplicate claims');
  } catch (err) {
    assert(err.message.includes('already been claimed today'), `Expected duplicate block error, got: ${err.message}`);
  }
  console.log('✅ Daily quest rewards successfully credit wallet and block duplicate claims.\n');

  console.log('7. Gem Spending (Badges/Themes/Boosts)...');
  riyaGWallet = await EconomyService.getGemWallet(riya._id);
  riyaGWallet.gems = 100;
  await riyaGWallet.save();

  // Buy a theme costing 30 gems
  const spendResult = await EconomyService.spendGems(riya._id, 'theme', 30, 'pastel_warm_theme');
  riyaGWallet = await EconomyService.getGemWallet(riya._id);
  assert(spendResult.success === true, 'Gems spending should succeed');
  assert(riyaGWallet.gems === 70, 'Gems should reduce to 70');
  assert(riyaGWallet.purchasedThemes.includes('pastel_warm_theme'), 'Theme should be added to purchased themes');

  // Try buying something too expensive (cost=100)
  try {
    await EconomyService.spendGems(riya._id, 'badge', 100, 'elite_creator_badge');
    assert(false, 'Should block purchase due to insufficient gems');
  } catch (err) {
    assert(err.message.includes('Insufficient gems balance'), `Expected balance error, got: ${err.message}`);
  }
  console.log('✅ Gem purchases check balances and track purchased virtual items correctly.\n');

  console.log('8. Extra Post Charger...');
  // Riya hasn't published anything today in the mock creations list
  let chargeResult = await EconomyService.chargeForExtraPost(riya._id);
  assert(chargeResult.charged === false, 'First post today should be free');

  // Let's add a published creation today by Riya
  const mockCreations = require('../models/mock.db').mockCreations;
  mockCreations.push({
    _id: 'mock-creation-today-1',
    creator: riya._id,
    title: 'Post 1',
    status: 'published',
    createdAt: new Date()
  });

  // Verify second post triggers fee (12 gems)
  riyaGWallet = await EconomyService.getGemWallet(riya._id);
  riyaGWallet.gems = 20;
  // Reset cap for extra post spend
  riyaGWallet.dailyGemsEarned = 0;
  await riyaGWallet.save();

  chargeResult = await EconomyService.chargeForExtraPost(riya._id);
  riyaGWallet = await EconomyService.getGemWallet(riya._id);
  assert(chargeResult.charged === true, 'Second post today should charge gems');
  assert(chargeResult.cost === 12, 'Cost should be 12 gems');
  assert(riyaGWallet.gems === 8, 'Riya gems should reduce to 8');
  console.log('✅ Extra Post system detects daily publication rates and levies gem fee.\n');

  console.log('====================================================');
  console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUN ENCOUNTERED AN ERROR:');
  console.error(err.stack || err);
  process.exit(1);
});
