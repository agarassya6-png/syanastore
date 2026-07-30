// Integrasi Tripay (https://tripay.co.id) — payment gateway populer untuk toko
// digital/top up di Indonesia, mendukung QRIS.
//
// Dokumentasi resmi: https://tripay.co.id/developer
// Kalau suatu saat Tripay mengubah struktur API mereka, cek ulang dokumentasi
// di atas dan sesuaikan fungsi createQrisTransaction() di bawah ini.

const crypto = require("crypto");

function baseUrl(){
  return process.env.TRIPAY_MODE === "production"
    ? "https://tripay.co.id/api"
    : "https://tripay.co.id/api-sandbox";
}

function signClosedTransaction(merchantRef, amount){
  const raw = `${process.env.TRIPAY_MERCHANT_CODE}${merchantRef}${amount}`;
  return crypto.createHmac("sha256", process.env.TRIPAY_PRIVATE_KEY).update(raw).digest("hex");
}

/**
 * Membuat transaksi QRIS di Tripay.
 * product: { id, title, sub, price }
 */
async function createQrisTransaction({ merchantRef, product, buyerId, callbackUrl, returnUrl }){
  const amount = product.price;
  const payload = {
    method: "QRIS2", // kode channel QRIS umum di Tripay. Cek /api/merchant/payment-channel kalau kode ini berbeda di akunmu.
    merchant_ref: merchantRef,
    amount,
    customer_name: `Player ${buyerId}`,
    customer_email: "pembeli@nusatop.local",
    customer_phone: "081234567890",
    order_items: [
      { sku: product.id, name: `${product.title} - ${product.sub}`, price: amount, quantity: 1 },
    ],
    callback_url: callbackUrl,
    return_url: returnUrl,
    expired_time: Math.floor(Date.now() / 1000) + 60 * 60, // 1 jam
    signature: signClosedTransaction(merchantRef, amount),
  };

  const res = await fetch(`${baseUrl()}/transaction/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TRIPAY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if(!json.success){
    throw new Error(json.message || "Gagal membuat transaksi di Tripay");
  }
  return json.data; // { reference, qr_url, checkout_url, status, expired_time, ... }
}

/**
 * Verifikasi bahwa webhook benar-benar dari Tripay, bukan pihak lain yang menyamar.
 * rawBody harus berupa string mentah body request (belum di-parse ke object).
 */
/**
 * Verifikasi bahwa webhook benar-benar dari Tripay, bukan pihak lain yang menyamar.
 * rawBody harus berupa string mentah body request (belum di-parse ke object).
 */
function verifyCallbackSignature(rawBody, signatureHeader){
  if(!signatureHeader) return false;
  const expected = crypto
    .createHmac("sha256", process.env.TRIPAY_PRIVATE_KEY)
    .update(rawBody)
    .digest("hex");
  return expected === signatureHeader;
}

/**
 * Cek detail/status transaksi secara langsung ke Tripay API
 */
async function getTransactionDetail(reference){
  if(!process.env.TRIPAY_API_KEY || !reference) return null;
  try {
    const res = await fetch(`${baseUrl()}/transaction/detail?reference=${reference}`, {
      headers: {
        Authorization: `Bearer ${process.env.TRIPAY_API_KEY}`
      }
    });
    const json = await res.json();
    if(json.success && json.data) {
      return json.data; // { reference, merchant_ref, status, paid_at, ... }
    }
  } catch(e) {
    console.error("[Tripay] Error getTransactionDetail:", e.message);
  }
  return null;
}

module.exports = { createQrisTransaction, verifyCallbackSignature, getTransactionDetail };

