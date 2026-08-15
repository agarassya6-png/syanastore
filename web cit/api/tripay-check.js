const https = require('https');

if (!global._tripay_orders) global._tripay_orders = new Map();

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers
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
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Support both GET (?reference=...) and POST ({reference, orderId})
  const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const { reference, orderId } = params;

  const API_KEY = process.env.TRIPAY_API_KEY || 'DEV-PutYourApiKeyHere';
  const IS_SANDBOX = (process.env.TRIPAY_MODE || 'sandbox') !== 'production';
  const BASE_URL = IS_SANDBOX
    ? 'https://tripay.co.id/api-sandbox'
    : 'https://tripay.co.id/api';

  // Find cached order by orderId or reference
  let order = null;
  if (orderId) {
    order = global._tripay_orders.get(orderId);
  }
  if (!order && reference) {
    for (const [, val] of global._tripay_orders.entries()) {
      if (val.reference === reference) { order = val; break; }
    }
  }

  const ref = reference || (order && order.reference);

  if (!ref) {
    return res.status(400).json({ success: false, message: 'reference or orderId required' });
  }

  try {
    const result = await httpsGet(
      `${BASE_URL}/transaction/detail?reference=${encodeURIComponent(ref)}`,
      { 'Authorization': `Bearer ${API_KEY}` }
    );

    const respData = result.data;

    if (respData && respData.success) {
      const tx = respData.data;
      const status = tx.status; // UNPAID | PAID | EXPIRED | FAILED | REFUND

      // Update cache if PAID
      if (status === 'PAID' && order) {
        order.status = 'PAID';
        order.paidAt = new Date().toISOString();
        global._tripay_orders.set(order.orderId, order);
      }

      return res.status(200).json({
        success: true,
        status,
        reference: ref,
        orderId: order ? order.orderId : tx.merchant_ref,
        productName: order ? order.productName : tx.merchant_ref,
        amount: tx.total_amount || (order ? order.amount : 0),
        itemType: order ? order.itemType : 'key',
        downloadUrl: order ? order.downloadUrl : '',
        key: order ? (order.key || null) : null,
        buyerWa: order ? order.buyerWa : ''
      });
    } else {
      return res.status(400).json({
        success: false,
        message: (respData && respData.message) || 'Gagal cek status transaksi'
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + (err.message || 'Unknown error')
    });
  }
};
