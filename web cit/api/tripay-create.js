const crypto = require('crypto');
const https = require('https');

// In-memory order store (shared across warm instances)
if (!global._tripay_orders) global._tripay_orders = new Map();

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const data = JSON.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    orderId, productName, duration, amount,
    buyerName, buyerWa, itemType, downloadUrl
  } = req.body || {};

  if (!orderId || !amount) {
    return res.status(400).json({ success: false, message: 'orderId and amount required' });
  }

  const API_KEY      = process.env.TRIPAY_API_KEY      || 'DEV-PutYourApiKeyHere';
  const PRIVATE_KEY  = process.env.TRIPAY_PRIVATE_KEY  || 'PutYourPrivateKeyHere';
  const MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE || 'T0000';
  const IS_SANDBOX   = (process.env.TRIPAY_MODE || 'sandbox') !== 'production';
  const BASE_URL     = IS_SANDBOX
    ? 'https://tripay.co.id/api-sandbox'
    : 'https://tripay.co.id/api';

  // Signature: HMAC-SHA256(merchantCode + merchant_ref + amount, private_key)
  const signature = crypto
    .createHmac('sha256', PRIVATE_KEY)
    .update(MERCHANT_CODE + orderId + amount)
    .digest('hex');

  const expiredTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  const payload = {
    method: 'QRIS',
    merchant_ref: orderId,
    amount: parseInt(amount),
    customer_name: (buyerName || 'Pembeli').substring(0, 50),
    customer_email: `buyer${Date.now()}@raxzy.store`,
    customer_phone: (buyerWa || '081234567890').replace(/[^0-9]/g, '').substring(0, 15) || '081234567890',
    order_items: [{
      name: `${(productName || 'Produk').substring(0, 50)} — ${duration || 'Permanent'}`,
      price: parseInt(amount),
      quantity: 1
    }],
    return_url: 'https://raxzy.vercel.app/',
    expired_time: expiredTime,
    signature
  };

  try {
    const result = await httpsPost(`${BASE_URL}/transaction/create`, {
      'Authorization': `Bearer ${API_KEY}`
    }, payload);

    const respData = result.data;

    if (respData && respData.success) {
      const tx = respData.data;

      // Cache order in memory
      global._tripay_orders.set(orderId, {
        orderId,
        reference: tx.reference,
        productName: productName || 'Produk',
        duration: duration || 'Permanent',
        amount: parseInt(amount),
        buyerName: buyerName || 'Pembeli',
        buyerWa: buyerWa || '',
        itemType: itemType || 'key',
        downloadUrl: downloadUrl || '',
        status: 'UNPAID',
        createdAt: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        reference: tx.reference,
        qr_url: tx.qr_url || null,
        pay_url: tx.pay_url || null,
        pay_code: tx.pay_code || null,
        expired_time: tx.expired_time,
        amount: tx.total_amount || parseInt(amount)
      });
    } else {
      return res.status(400).json({
        success: false,
        message: (respData && respData.message) || 'Gagal membuat transaksi Tripay'
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + (err.message || 'Unknown error')
    });
  }
};
