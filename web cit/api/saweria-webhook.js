const crypto = require('crypto');

if (!global._raxzy_orders) global._raxzy_orders = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = req.body || {};
  console.log('[saweria-webhook] Received payload:', JSON.stringify(payload));

  // Saweria webhook payload fields:
  // { version, created_at, id, type: 'donation', amount_raw: 25000, donator_name, donator_email, message }
  const amount = parseInt(payload.amount_raw || payload.amount || payload.nominal || 0);
  const message = (payload.message || payload.pesan || '').toString();
  const donator = payload.donator_name || payload.nama || 'Pembeli';

  if (!amount || amount <= 0) {
    return res.status(200).json({ success: true, message: 'Ping / invalid amount received' });
  }

  // 1. Search by Order ID inside the message (e.g. "RXZ-XXXXX")
  let matchedOrder = null;
  const orderIdMatch = message.match(/RXZ-[A-Z0-9]+/i);
  
  if (orderIdMatch) {
    const extractedId = orderIdMatch[0].toUpperCase();
    matchedOrder = global._raxzy_orders.get(extractedId);
  }

  // 2. If not found by message text, match by pending UNPAID order with matching amount
  if (!matchedOrder) {
    for (const [id, order] of global._raxzy_orders.entries()) {
      if (order.status === 'UNPAID' && (order.amount === amount || Math.abs(order.amount - amount) <= 100)) {
        matchedOrder = order;
        break;
      }
    }
  }

  // 3. Mark as PAID and generate key / mod link
  if (matchedOrder) {
    matchedOrder.status = 'PAID';
    matchedOrder.paidAt = new Date().toISOString();
    matchedOrder.saweriaDonator = donator;

    if (!matchedOrder.key) {
      const pCode = (matchedOrder.productName || 'VIP').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      const r1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const r2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const r3 = Math.random().toString(36).substring(2, 6).toUpperCase();
      matchedOrder.key = `${pCode || 'RAXZ'}-${r1}-${r2}-${r3}`;
    }

    global._raxzy_orders.set(matchedOrder.orderId, matchedOrder);
    console.log(`[saweria-webhook] Successfully unlocked Order ${matchedOrder.orderId} for Rp ${amount}`);

    return res.status(200).json({
      success: true,
      matched: true,
      orderId: matchedOrder.orderId,
      key: matchedOrder.key,
      message: `Order ${matchedOrder.orderId} verified and unlocked!`
    });
  }

  // If no order exists yet, create stub so polling picks it up
  if (orderIdMatch) {
    const extractedId = orderIdMatch[0].toUpperCase();
    const newOrder = {
      orderId: extractedId,
      amount: amount,
      productName: 'VIP Cheat',
      buyerName: donator,
      status: 'PAID',
      paidAt: new Date().toISOString(),
      key: `RAXZ-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    };
    global._raxzy_orders.set(extractedId, newOrder);
  }

  return res.status(200).json({
    success: true,
    matched: false,
    amount,
    message: 'Webhook processed'
  });
};
