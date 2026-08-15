const axios = require('axios');

const globalTransactions = global._raxzy_orders || (global._raxzy_orders = new Map());

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { orderId, amount, productName, duration, buyerName, buyerWa, markPaid, action } = req.body || req.query || {};

  // Admin action: list pending orders or manual mark
  if (action === 'list_orders') {
    const list = Array.from(globalTransactions.values()).slice(-20).reverse();
    return res.status(200).json({ success: true, orders: list });
  }

  let order = globalTransactions.get(orderId);
  if (!order && orderId) {
    order = {
      orderId,
      amount: parseInt(amount) || 25000,
      productName: productName || 'VIP Cheat',
      duration: duration || '1 Hari',
      buyerName: buyerName || 'raxzy',
      status: 'UNPAID',
      createdAt: new Date().toISOString()
    };
    globalTransactions.set(orderId, order);
  }

  // If admin manually marks paid or webhook marks paid:
  if (markPaid && order) {
    order.status = 'PAID';
    order.paidAt = new Date().toISOString();
  }

  // Check if status is PAID
  if (order && order.status === 'PAID') {
    if (!order.key) {
      // Generate / Fetch license key
      const pCode = (order.productName || 'VIP').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      const r1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const r2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const r3 = Math.random().toString(36).substring(2, 6).toUpperCase();
      order.key = `${pCode || 'RAXZ'}-${r1}-${r2}-${r3}`;
    }

    return res.status(200).json({
      success: true,
      orderId: order.orderId,
      status: 'PAID',
      productName: order.productName,
      duration: order.duration,
      buyerName: order.buyerName,
      key: order.key,
      itemType: order.itemType || 'key',
      downloadUrl: order.downloadUrl || 'https://www.mediafire.com/',
      paidAt: order.paidAt || new Date().toISOString(),
      message: '✅ Pembayaran mutasi terverifikasi cocok!'
    });
  }

  return res.status(200).json({
    success: true,
    orderId: order ? order.orderId : orderId,
    status: 'UNPAID',
    amount: order ? order.amount : amount,
    message: '⏳ Menunggu transfer mutasi masuk...'
  });
};
