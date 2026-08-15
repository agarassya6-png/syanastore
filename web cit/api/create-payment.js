const globalTransactions = global._raxzy_orders || (global._raxzy_orders = new Map());

// Official Nana's Shop Static QRIS String
const BASE_STATIC_QRIS = "00020101021126570011ID.DANA.WWW011893600915394184075202099418407520303UMI51440014ID.CO.QRIS.WWW0215ID10254153468460303UMI5204481453033605802ID5911Nana's Shop6012Kota Bandung6105402346304021F";

function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}

function makeDynamicQris(staticQris, amount) {
  let qris = staticQris.slice(0, -4);
  qris = qris.replace("010211", "010212");

  const amountStr = amount.toString();
  const tag54 = `54${String(amountStr.length).padStart(2, "0")}${amountStr}`;
  
  const parts = qris.split("5802ID");
  qris = parts[0] + tag54 + "5802ID" + parts[1];

  const newCrc = crc16(qris);
  return qris + newCrc;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { productId, productName, duration, price, amount, buyerName, buyerWa, itemType, downloadUrl } = req.body || req.query || {};

  const cleanBase = parseInt((amount || price || '25000').toString().replace(/[^0-9]/g, '')) || 25000;
  
  // Generate random 3-digit unique code between 101 and 899
  const uniqueCode = Math.floor(101 + Math.random() * 798);
  const finalAmount = cleanBase + uniqueCode;

  const orderId = 'RXZ-' + Date.now().toString(36).toUpperCase() + '-' + uniqueCode;

  // Convert to Dynamic QRIS string with exact nominal prefilled!
  const dynamicQrisString = makeDynamicQris(BASE_STATIC_QRIS, finalAmount);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(dynamicQrisString)}`;

  const orderData = {
    orderId,
    productId,
    productName: productName || 'VIP Cheat',
    duration: duration || '1 Hari',
    baseAmount: cleanBase,
    uniqueCode: uniqueCode,
    amount: finalAmount,
    formattedAmount: 'Rp ' + finalAmount.toLocaleString('id-ID'),
    buyerName: buyerName || 'raxzy',
    buyerWa: buyerWa || '',
    itemType: itemType || 'key',
    downloadUrl: downloadUrl || 'https://www.mediafire.com/',
    status: 'UNPAID',
    merchant: "Nana's Shop",
    nmid: "ID1025415346846",
    qrisString: dynamicQrisString,
    qrImageUrl: qrImageUrl,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };

  globalTransactions.set(orderId, orderData);

  return res.status(200).json({
    success: true,
    ...orderData,
    instruction: `Scan kode QR di atas dengan BCA, DANA, GoPay, OVO, ShopeePay, atau m-Banking. Nominal Rp ${finalAmount.toLocaleString('id-ID')} akan otomatis terisi!`
  });
};
