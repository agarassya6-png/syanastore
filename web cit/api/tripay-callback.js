const crypto = require('crypto');

if (!global._tripay_orders) global._tripay_orders = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PRIVATE_KEY   = process.env.TRIPAY_PRIVATE_KEY   || 'PutYourPrivateKeyHere';
  const MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE || 'T0000';

  // Verify Tripay callback signature
  const receivedSignature = req.headers['x-callback-signature'];
  const bodyRaw = req.rawBody || JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', PRIVATE_KEY)
    .update(MERCHANT_CODE + bodyRaw)
    .digest('hex');

  if (receivedSignature && receivedSignature !== expectedSignature) {
    return res.status(403).json({ success: false, message: 'Invalid callback signature' });
  }

  const { reference, merchant_ref, status, total_amount } = req.body || {};

  console.log(`[tripay-callback] ref=${reference} merchant_ref=${merchant_ref} status=${status}`);

  if (merchant_ref) {
    let order = global._tripay_orders.get(merchant_ref);
    if (!order) {
      // Create a stub order so check endpoint still works
      order = {
        orderId: merchant_ref,
        reference: reference || merchant_ref,
        productName: merchant_ref,
        amount: total_amount || 0,
        status: status || 'UNPAID',
        createdAt: new Date().toISOString()
      };
    }
    order.status = status || order.status;
    order.reference = reference || order.reference;
    if (status === 'PAID') {
      order.paidAt = new Date().toISOString();
    }
    global._tripay_orders.set(merchant_ref, order);
  }

  // Tripay requires this exact response
  return res.status(200).json({ success: true });
};
