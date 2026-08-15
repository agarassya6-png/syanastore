const crypto = require('crypto');

if (!global._raxzy_orders) global._raxzy_orders = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = req.body || {};
  const { key, unique_code, status, amount, signature } = payload;

  const API_KEY = process.env.PAYDISINI_API_KEY || key;

  // Verify Paydisini signature: md5(key + unique_code + 'Callback')
  if (API_KEY && signature) {
    const expectedSig = crypto.createHash('md5').update(`${API_KEY}${unique_code}Callback`).digest('hex');
    if (signature !== expectedSig) {
      console.warn('[paydisini-callback] Invalid signature mismatch');
    }
  }

  console.log(`[paydisini-callback] unique_code=${unique_code} status=${status} amount=${amount}`);

  if (unique_code) {
    let order = global._raxzy_orders.get(unique_code);
    if (!order) {
      order = {
        orderId: unique_code,
        productName: 'VIP Order',
        amount: parseInt(amount) || 0,
        status: status === 'Success' ? 'PAID' : 'UNPAID',
        createdAt: new Date().toISOString()
      };
    }

    if (status === 'Success') {
      order.status = 'PAID';
      order.paidAt = new Date().toISOString();

      if (!order.key) {
        const pCode = (order.productName || 'VIP').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        const r1 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const r2 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const r3 = Math.random().toString(36).substring(2, 6).toUpperCase();
        order.key = `${pCode || 'RAXZ'}-${r1}-${r2}-${r3}`;
      }
    } else {
      order.status = status;
    }

    global._raxzy_orders.set(unique_code, order);
  }

  return res.status(200).json({ success: true, message: 'Callback received successfully' });
};
