const RazorpayService = require('./razorpay.service');
const CashfreeService = require('./cashfree.service');

class PaymentService {
  /**
   * Initialize a premium quills order
   * @param {string} userId 
   * @param {string} packId - starter, popular, value
   * @param {string} provider - razorpay, cashfree, mock
   */
  static async createOrder(userId, packId, provider = 'mock') {
    const packs = {
      starter: { amount: 99, quills: 10, gems: 0 },
      popular: { amount: 299, quills: 50, gems: 10 },
      value: { amount: 499, quills: 100, gems: 25 }
    };

    const pack = packs[packId];
    if (!pack) {
      throw new Error('Invalid premium quills pack ID');
    }

    if (provider === 'razorpay') {
      return await RazorpayService.createOrder(userId, packId, pack.amount);
    } else if (provider === 'cashfree') {
      return await CashfreeService.createOrder(userId, packId, pack.amount);
    } else {
      // Mock provider
      const orderId = `mock-order-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      return {
        provider: 'mock',
        orderId,
        amount: pack.amount,
        quills: pack.quills,
        gems: pack.gems,
        status: 'pending'
      };
    }
  }

  /**
   * Verify signature and complete purchase
   */
  static async verifyPayment(userId, payload) {
    const { provider, orderId, paymentId, signature, packId } = payload;
    
    let isVerified = false;
    if (provider === 'razorpay') {
      isVerified = await RazorpayService.verifySignature(orderId, paymentId, signature);
    } else if (provider === 'cashfree') {
      isVerified = await CashfreeService.verifySignature(orderId, paymentId);
    } else {
      // Mock payment is always verified successfully
      isVerified = true;
    }

    if (!isVerified) {
      throw new Error('Payment verification failed');
    }

    return {
      success: true,
      orderId,
      paymentId: paymentId || `mock-pay-${Date.now()}`,
      packId
    };
  }
}

module.exports = PaymentService;
