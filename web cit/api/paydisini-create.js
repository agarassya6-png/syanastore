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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    orderId, productName, duration, amount,
    buyerName, buyerWa, itemType, downloadUrl,
    apiKey, serviceCode
  } = req.body || {};

  if (!orderId || !amount) {
    return res.status(400).json({ success: false, message: 'orderId and amount required' });
  }

  const API_KEY = apiKey || process.env.PAYDISINI_API_KEY;
  const SERVICE = serviceCode || process.env.PAYDISINI_SERVICE || '11'; // 11 = QRIS Instant Otomatis
  const VALID_TIME = 1800; // 30 minutes in seconds

  if (!API_KEY) {
    return res.status(400).json({
      success: false,
      message: 'PAYDISINI_API_KEY belum dikonfigurasi di Admin atau Environment'
    });
  }

  // Signature = md5(key + unique_code + service + amount + valid_time + 'NewTransaction')
  const rawSig = `${API_KEY}${orderId}${SERVICE}${amount}${VALID_TIME}NewTransaction`;
  const signature = crypto.createHash('md5').update(rawSig).digest('hex');

  const payload = {
    key: API_KEY,
    request: 'new',
    unique_code: orderId,
    service: SERVICE,
    amount: parseInt(amount),
    note: `${productName || 'VIP'} - ${duration || 'Permanent'}`,
    valid_time: VALID_TIME,
    type_fee: '1',
    signature: signature
  };

  try {
    const result = await postForm('https://api.paydisini.co.id/v1/', payload);
    const resp = result.data;

    if (resp && resp.success) {
      const tx = resp.data;

      // Cache order in global store
      global._raxzy_orders.set(orderId, {
        orderId,
        provider: 'paydisini',
        productName: productName || 'VIP Cheat',
        duration: duration || 'Permanent',
        amount: tx.amount || parseInt(amount),
        buyerName: buyerName || 'Pembeli',
        buyerWa: buyerWa || '',
        itemType: itemType || 'key',
        downloadUrl: downloadUrl || '',
        status: 'UNPAID',
        qrUrl: tx.qr_url || tx.qrcode_url || null,
        payUrl: tx.checkout_url || null,
        expiredAt: tx.expired,
        createdAt: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        orderId: orderId,
        amount: tx.amount || parseInt(amount),
        qr_url: tx.qr_url || tx.qrcode_url || null,
        checkout_url: tx.checkout_url || null,
        expired_at: tx.expired,
        message: 'QRIS Paydisini berhasil dibuat'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: (resp && resp.msg) || 'Gagal generate transaksi Paydisini'
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error Paydisini: ' + (err.message || 'Unknown error')
    });
  }
};
