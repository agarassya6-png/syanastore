const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

if (!global._raxzy_orders) global._raxzy_orders = new Map();

function postForm(url, data) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify(data);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
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
    req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const { orderId, apiKey } = params;

  if (!orderId) {
    return res.status(400).json({ success: false, message: 'orderId is required' });
  }

  const API_KEY = apiKey || process.env.PAYDISINI_API_KEY;
  let order = global._raxzy_orders.get(orderId);

  // If order is already PAID locally in memory, return immediately
  if (order && order.status === 'PAID') {
    return res.status(200).json({
      success: true,
      status: 'PAID',
      orderId: order.orderId,
      productName: order.productName,
      amount: order.amount,
      itemType: order.itemType,
      downloadUrl: order.downloadUrl,
      key: order.key || 'RAXZ-PAID-SUCCESS',
      paidAt: order.paidAt
    });
  }

  if (!API_KEY) {
    return res.status(200).json({
      success: true,
      status: order ? order.status : 'UNPAID',
      message: 'Pending API Key configuration'
    });
  }

  // Signature = md5(key + unique_code + 'StatusTransaction')
  const rawSig = `${API_KEY}${orderId}StatusTransaction`;
  const signature = crypto.createHash('md5').update(rawSig).digest('hex');

  const payload = {
    key: API_KEY,
    request: 'status',
    unique_code: orderId,
    signature: signature
  };

  try {
    const result = await postForm('https://api.paydisini.co.id/v1/', payload);
    const resp = result.data;

    if (resp && resp.success) {
      const tx = resp.data;
      const status = tx.status; // 'Success', 'Pending', 'Canceled'

      if (status === 'Success') {
        if (!order) {
          order = {
            orderId,
            productName: 'VIP Cheat',
            amount: tx.amount || 0,
            status: 'PAID',
            createdAt: new Date().toISOString()
          };
        }
        order.status = 'PAID';
        order.paidAt = new Date().toISOString();

        if (!order.key) {
          const pCode = (order.productName || 'VIP').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
          const r1 = Math.random().toString(36).substring(2, 6).toUpperCase();
          const r2 = Math.random().toString(36).substring(2, 6).toUpperCase();
          const r3 = Math.random().toString(36).substring(2, 6).toUpperCase();
          order.key = `${pCode || 'RAXZ'}-${r1}-${r2}-${r3}`;
        }
        global._raxzy_orders.set(orderId, order);

        return res.status(200).json({
          success: true,
          status: 'PAID',
          orderId: order.orderId,
          productName: order.productName,
          amount: order.amount,
          itemType: order.itemType || 'key',
          downloadUrl: order.downloadUrl || '',
          key: order.key,
          paidAt: order.paidAt
        });
      }

      return res.status(200).json({
        success: true,
        status: status === 'Pending' ? 'UNPAID' : status,
        orderId: orderId
      });
    } else {
      return res.status(200).json({
        success: true,
        status: order ? order.status : 'UNPAID',
        message: resp ? resp.msg : 'Checking...'
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error checking Paydisini: ' + (err.message || 'Unknown error')
    });
  }
};
