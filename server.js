require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const store = require("./productStore");
const db = require("./db");
const tripay = require("./tripay");

const app = express();
const PORT = process.env.PORT || 3000;

// Simpan body mentah juga, dibutuhkan untuk verifikasi signature webhook Tripay.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf.toString("utf-8"); }
}));

function genMerchantRef(){
  return "NX" + Date.now().toString(36).toUpperCase() + Math.floor(100 + Math.random() * 900);
}

// CRC16 CCITT Calculation
function crc16(str) {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    let code = str.charCodeAt(c);
    crc ^= (code << 8);
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// Generate Dynamic QRIS payload from static QRIS Naaa Store
function generateDynamicQris(amount) {
  // Base payload QRIS Naaa Store dari DANA (dikirim via gambar oleh user)
  const basePart1 = '00020101021126570011ID.DANA.WWW011893600915395040937702099504093770303UMI51440014ID.CO.QRIS.WWW0215ID10254181215010303UMI520448145303360';
  const basePart2 = '5802ID5910Naaa Store6012Kota Bandung6105402346304';
  
  const amtStr = String(amount);
  const tag54 = '54' + String(amtStr.length).padStart(2, '0') + amtStr;
  
  const payloadWithoutCrc = basePart1 + tag54 + basePart2;
  const crc = crc16(payloadWithoutCrc);
  return payloadWithoutCrc + crc;
}

function hasTripayEnv(){
  const missing = ["TRIPAY_API_KEY", "TRIPAY_PRIVATE_KEY", "TRIPAY_MERCHANT_CODE"]
    .filter(k => !process.env[k] || process.env[k].startsWith("isi_") || !process.env[k].trim());
  return missing.length === 0;
}

// ---------- PUBLIK: config toko ----------
app.get("/api/config", (req, res) => {
  const config = db.getConfig();
  const publicConfig = {
    storeName: config.storeName || "SYANA STORE",
    tagline: config.tagline || "Top Up Game & Dompet Digital Tercepat",
    wa: config.wa || "6281234567890",
    instagram: config.instagram || "syanastore.id"
  };
  res.json({ success: true, config: publicConfig });
});

// ---------- PUBLIK: katalog produk ----------
app.get("/api/catalog", (req, res) => {
  res.json({ success: true, catalog: store.getAllProducts() });
});

// ---------- PUBLIK: customer testimonials ----------
app.get("/api/testimonials", (req, res) => {
  const testimonialsPath = path.join(__dirname, "data", "testimonials.json");
  const DEFAULT_TESTIMONIALS = [
    {name:'Aditya P.', game:'Mobile Legends', text:'Diamond masuk kurang dari 3 menit, mantap!', rating:5},
    {name:'Nabila R.', game:'Free Fire', text:'Harga paling bersahabat dibanding tempat lain.', rating:5},
    {name:'Farhan S.', game:'Genshin Impact', text:'Proses gampang, admin fast response 24 jam.', rating:5},
    {name:'Clarissa W.', game:'Valorant', text:'VP langsung nambah, checkout-nya simpel.', rating:4},
  ];
  let list = DEFAULT_TESTIMONIALS;
  try {
    if (fs.existsSync(testimonialsPath)) {
      list = JSON.parse(fs.readFileSync(testimonialsPath, "utf-8"));
    } else {
      fs.mkdirSync(path.dirname(testimonialsPath), { recursive: true });
      fs.writeFileSync(testimonialsPath, JSON.stringify(DEFAULT_TESTIMONIALS, null, 2), "utf-8");
    }
  } catch(e) {}
  res.json({ success: true, testimonials: list });
});

// ---------- PUBLIK: masked recent transactions for ticker ----------
app.get("/api/sales/recent", (req, res) => {
  const sales = db.getAllSales();
  const lunasSales = sales.filter(s => s.status === "Lunas");
  const recent = lunasSales.length ? lunasSales.slice(0, 10).map(s => {
    let buyer = s.buyerId || "Pelanggan";
    if (buyer.length > 4) {
      buyer = buyer.slice(0, 4) + "***";
    } else {
      buyer = buyer.slice(0, 2) + "**";
    }
    return { buyer, product: s.item, game: s.game };
  }) : [
    {buyer:'Rian_88', product:'172 Diamonds', game:'Mobile Legends'},
    {buyer:'Wulan_02', product:'140 Diamond', game:'Free Fire'},
    {buyer:'Doni_X', product:'300 Genesis Crystal', game:'Genshin Impact'},
  ];
  res.json({ success: true, recent });
});

// ---------- PUBLIK: buat transaksi QRIS (Tripay / Mock fallback) ----------
app.post("/api/checkout", async (req, res) => {
  try{
    const { productId, buyerId, server, whatsapp } = req.body || {};
    const product = store.getProduct(productId);
    if(!product) return res.status(400).json({ success:false, message:"Produk tidak ditemukan" });
    if(!buyerId || !String(buyerId).trim()) {
      const isRoblox = product.game === 'roblox';
      return res.status(400).json({ success:false, message: isRoblox ? "Username Roblox wajib diisi" : "ID game wajib diisi" });
    }
    if(!whatsapp || !String(whatsapp).trim()) {
      return res.status(400).json({ success:false, message:"Nomor WhatsApp CS wajib diisi" });
    }

    const merchantRef = genMerchantRef();
    const cleanBuyerId = String(buyerId).trim();
    const cleanServer = server && String(server).trim() ? String(server).trim() : "-";
    const cleanWhatsapp = String(whatsapp).trim();

    if (hasTripayEnv()) {
      const base = process.env.BASE_URL || `http://localhost:${PORT}`;
      const trx = await tripay.createQrisTransaction({
        merchantRef,
        product,
        buyerId: cleanBuyerId,
        callbackUrl: `${base}/api/webhook/tripay`,
        returnUrl: `${base}/`,
      });

      db.addSale({
        merchantRef,
        reference: trx.reference,
        game: product.sub, // sub contains the Game name
        item: product.title,
        price: product.price,
        buyerId: cleanBuyerId,
        server: cleanServer,
        whatsapp: cleanWhatsapp,
        status: "Menunggu Pembayaran",
        createdAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        merchantRef,
        reference: trx.reference,
        qrUrl: trx.qr_url,
        expiredTime: trx.expired_time,
        isMock: false
      });
    } else {
      // Mock mode fallback
      const reference = "MOCK-" + Math.floor(100000 + Math.random() * 900000);
      const expiredTime = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour

      db.addSale({
        merchantRef,
        reference,
        game: product.sub,
        item: product.title,
        price: product.price,
        buyerId: cleanBuyerId,
        server: cleanServer,
        whatsapp: cleanWhatsapp,
        status: "Menunggu Pembayaran",
        createdAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        merchantRef,
        reference,
        qrUrl: "",
        qrText: generateDynamicQris(product.price),
        expiredTime,
        isMock: true
      });
    }
  }catch(err){
    console.error("checkout error:", err.message);
    res.status(500).json({ success:false, message: err.message });
  }
});

// ---------- PUBLIK: konfirmasi transaksi mock / QRIS statis ----------
app.post("/api/sales/confirm-mock/:merchantRef", (req, res) => {
  const sale = db.findByMerchantRef(req.params.merchantRef);
  if(!sale) return res.status(404).json({ success:false, message:"Transaksi tidak ditemukan" });
  db.updateStatusByMerchantRef(req.params.merchantRef, "Lunas");
  res.json({ success:true });
});

// ---------- ADMIN: konfirmasi lunas secara manual ----------
app.post("/api/admin/sales/confirm/:merchantRef", requireAdmin, (req, res) => {
  const sale = db.findByMerchantRef(req.params.merchantRef);
  if(!sale) return res.status(404).json({ success:false, message:"Transaksi tidak ditemukan" });
  db.updateStatusByMerchantRef(req.params.merchantRef, "Lunas");
  res.json({ success:true });
});

// ---------- ADMIN: batalkan transaksi secara manual ----------
app.post("/api/admin/sales/cancel/:merchantRef", requireAdmin, (req, res) => {
  const sale = db.findByMerchantRef(req.params.merchantRef);
  if(!sale) return res.status(404).json({ success:false, message:"Transaksi tidak ditemukan" });
  db.updateStatusByMerchantRef(req.params.merchantRef, "Batal");
  res.json({ success:true });
});

// ---------- PUBLIK: cek status transaksi ----------
app.get("/api/sales/status/:merchantRef", (req, res) => {
  const sale = db.findByMerchantRef(req.params.merchantRef);
  if(!sale) return res.status(404).json({ success:false, message:"Tidak ditemukan" });
  res.json({ success:true, status: sale.status });
});

// ---------- PUBLIK: lacak pesanan buyer via WhatsApp / Order ID ----------
app.get("/api/sales/track", (req, res) => {
  const { q } = req.query;
  if(!q || !String(q).trim()) return res.json({ success:false, message:"Masukkan nomor WhatsApp atau Order ID" });
  const query = String(q).trim().toLowerCase();
  const all = db.getAllSales();
  const results = all.filter(s => {
    const matchWa = s.whatsapp && s.whatsapp.toLowerCase().includes(query);
    const matchRef = s.reference && s.reference.toLowerCase().includes(query);
    const matchMerchant = s.merchantRef && s.merchantRef.toLowerCase().includes(query);
    const matchBuyer = s.buyerId && s.buyerId.toLowerCase().includes(query);
    return matchWa || matchRef || matchMerchant || matchBuyer;
  }).slice(0, 20).map(s => ({
    reference: s.reference,
    game: s.game,
    item: s.item,
    price: s.price,
    status: s.status,
    createdAt: s.createdAt
  }));
  res.json({ success:true, results });
});

// ---------- WEBHOOK: dipanggil oleh server Tripay ----------
app.post("/api/webhook/tripay", (req, res) => {
  const signature = req.headers["x-callback-signature"];
  const valid = tripay.verifyCallbackSignature(req.rawBody, signature);

  if(!valid){
    return res.status(403).json({ success:false, message:"Invalid signature" });
  }

  const data = req.body || {};
  if(data.event === "payment_status"){
    let status = "Menunggu Pembayaran";
    if(data.status === "PAID") status = "Lunas";
    else if(data.status === "EXPIRED") status = "Kadaluarsa";
    else if(data.status === "FAILED") status = "Gagal";
    db.updateStatusByMerchantRef(data.merchant_ref, status);
  }

  res.json({ success: true });
});

// ---------- ADMIN: login/verify ----------
app.post("/api/admin/verify", (req, res) => {
  const { password } = req.body || {};
  const config = db.getConfig();
  let adminPassword = process.env.ADMIN_PASSWORD;
  if(!adminPassword || adminPassword === "ganti_password_ini"){
    adminPassword = config.adminPassword || "admin123";
  }
  res.json({ success: password === adminPassword });
});

function requireAdmin(req, res, next){
  const config = db.getConfig();
  let adminPassword = process.env.ADMIN_PASSWORD;
  if(!adminPassword || adminPassword === "ganti_password_ini"){
    adminPassword = config.adminPassword || "admin123";
  }

  if(req.headers["x-admin-password"] !== adminPassword){
    return res.status(401).json({ success:false, message:"Password salah / sesi habis" });
  }
  next();
}

// ---------- ADMIN: data penjualan ----------
app.get("/api/sales", requireAdmin, (req, res) => {
  res.json({ success: true, sales: db.getAllSales() });
});

app.post("/api/sales/reset", requireAdmin, (req, res) => {
  db.resetSales();
  res.json({ success: true });
});

// ---------- ADMIN: kelola catalog & harga ----------
app.post("/api/admin/catalog", requireAdmin, (req, res) => {
  const { catalog } = req.body || {};
  if(!catalog || !Array.isArray(catalog)){
    return res.status(400).json({ success: false, message: "Katalog tidak valid" });
  }
  store.saveCatalog(catalog);
  res.json({ success: true, catalog });
});

app.post("/api/admin/catalog/reset", requireAdmin, (req, res) => {
  const catalog = store.resetToDefault();
  res.json({ success: true, catalog });
});

// ---------- ADMIN: kelola config toko ----------
app.post("/api/admin/config", requireAdmin, (req, res) => {
  const { storeName, tagline, wa, instagram } = req.body || {};
  const config = db.getConfig();

  if(storeName) config.storeName = String(storeName).trim();
  if(tagline !== undefined) config.tagline = String(tagline).trim();
  if(wa !== undefined) config.wa = String(wa).trim();
  if(instagram !== undefined) config.instagram = String(instagram).trim();

  db.saveConfig(config);
  res.json({ success: true, config });
});

// ---------- ADMIN: ubah password ----------
app.post("/api/admin/change-password", requireAdmin, (req, res) => {
  const { newPassword } = req.body || {};
  if(!newPassword || String(newPassword).length < 4){
    return res.status(400).json({ success: false, message: "Password minimal 4 karakter" });
  }

  const config = db.getConfig();
  config.adminPassword = String(newPassword);
  db.saveConfig(config);
  res.json({ success: true });
});

// ---------- ADMIN: upload gambar QRIS ----------
app.post("/api/admin/upload-qris", requireAdmin, (req, res) => {
  const { image } = req.body || {};
  if(!image) return res.status(400).json({ success:false, message:"Tidak ada gambar" });

  // image = "data:image/png;base64,..." atau "data:image/jpeg;base64,..."
  const match = image.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if(!match) return res.status(400).json({ success:false, message:"Format gambar tidak valid" });

  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const buf = Buffer.from(match[2], "base64");

  const imgDir = path.join(__dirname, "public", "images");
  if(!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  // Simpan sebagai qris.png (selalu overwrite)
  const destPath = path.join(imgDir, "qris.png");
  fs.writeFileSync(destPath, buf);

  console.log(`QRIS image disimpan: ${destPath} (${buf.length} bytes)`);
  res.json({ success:true, path: "/images/qris.png" });
});

// ---------- ADMIN: cek apakah QRIS sudah diupload ----------
app.get("/api/admin/qris-status", (req, res) => {
  const qrisPath = path.join(__dirname, "public", "images", "qris.png");
  res.json({ success:true, exists: fs.existsSync(qrisPath) });
});

// ---------- Serve frontend statis ----------
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`SYANASTORE backend jalan di http://localhost:${PORT}`);
  console.log(`Mode Tripay: ${process.env.TRIPAY_MODE || "(belum diset, default sandbox)"}`);
});

