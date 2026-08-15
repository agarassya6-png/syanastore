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

  // Payload from Moota / CekMutasi / Android Bank SMS Notifier
  const payload = req.body || req.query || {};
  const creditAmount = parseInt((payload.amount || payload.nominal || payload.total || '0').toString().replace(/[^0-9]/g, ''));
  const description = payload.description || payload.keterangan || payload.note || '';

  if (!creditAmount || creditAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid nominal' });
  }

  // Find any pending transaction matching this exact unique amount
  let matchedOrder = null;
  for (const [id, order] of globalTransactions.entries()) {
    if (order.status === 'UNPAID' && order.amount === creditAmount) {
      matchedOrder = order;
      break;
    }
  }

  if (matchedOrder) {
    matchedOrder.status = 'PAID';
    matchedOrder.paidAt = new Date().toISOString();
    matchedOrder.bankNote = description;

    // Generate license key
    const pCode = (matchedOrder.productName || 'VIP').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const r1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const r2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const r3 = Math.random().toString(36).substring(2, 6).toUpperCase();
    matchedOrder.key = `${pCode || 'RAXZ'}-${r1}-${r2}-${r3}`;

    return res.status(200).json({
      success: true,
      matched: true,
      orderId: matchedOrder.orderId,
      amount: matchedOrder.amount,
      message: `✅ Mutasi Rp ${creditAmount.toLocaleString('id-ID')} cocok dengan Order ${matchedOrder.orderId}. Key berhasil diterbitkan!`
    });
  }

  return res.status(200).json({
    success: true,
    matched: false,
    creditAmount,
    message: `Mutasi Rp ${creditAmount.toLocaleString('id-ID')} diterima, namun tidak ada order pending dengan nominal tersebut.`
  });
};
