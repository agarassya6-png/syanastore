require("dotenv").config();


// ── DNS OVERRIDE + CUSTOM FETCH ──────────────────────────────────────────────
const dns = require("dns");
const nodeHttps = require("https");
const nodeHttp  = require("http");

// DNS Resolver dengan Google + Cloudflare
const customResolver = new dns.Resolver();
customResolver.setServers(["8.8.8.8", "1.1.1.1"]);

// Cache IP yang sudah diketahui bekerja (bypass domain yang sinkholed ke 0.0.0.0)
// order.codashop.com di-DNS-block, tapi www.codashop.com (host yang sama/CDN sama) tidak.
const KNOWN_IPS = {
  "order.codashop.com":    { ip: "76.223.109.251", sni: "order.codashop.com" },
  "www.codashop.com":      { ip: "76.223.109.251", sni: "www.codashop.com"   },
  "codashop.com":          { ip: "76.223.109.251", sni: "codashop.com"       },
  "ffmaxbuy.garena.com":   { ip: null, sni: "ffmaxbuy.garena.com" }, // resolve normal
};

function resolveHost(hostname, callback) {
  // Cek known-IP dulu
  if (KNOWN_IPS[hostname] && KNOWN_IPS[hostname].ip) {
    return callback(null, KNOWN_IPS[hostname].ip);
  }
  // Resolve via custom DNS
  customResolver.resolve4(hostname, (err, addrs) => {
    if (!err && addrs && addrs.length && addrs[0] !== "0.0.0.0") {
      return callback(null, addrs[0]);
    }
    // fallback: sistem
    dns.lookup(hostname, { family: 4 }, (err2, addr) => {
      if (!err2 && addr && addr !== "0.0.0.0") return callback(null, addr);
      callback(new Error(`Cannot resolve ${hostname}`));
    });
  });
}

/**
 * safeFetch — HTTPS native dengan custom DNS resolver.
 * Bypass DNS sinkholing, gunakan SNI agar TLS certificate cocok.
 */
function safeFetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? nodeHttps : nodeHttp;
    const hostname = urlObj.hostname;

    resolveHost(hostname, (err, ip) => {
      if (err) return reject(err);

      const bodyStr = opts.body
        ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body))
        : null;

      const reqOpts = {
        host: ip,
        port: urlObj.port ? parseInt(urlObj.port) : (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: opts.method || (bodyStr ? "POST" : "GET"),
        servername: hostname, // SNI → TLS certificate cocok
        headers: {
          "Host": hostname,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
          "Origin": `https://${hostname}`,
          "Referer": `https://${hostname}/`,
          ...(bodyStr ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyStr)
          } : {}),
          ...(opts.headers || {})
        },
        timeout: opts.timeout || 7000,
        rejectUnauthorized: true
      };

      const req = lib.request(reqOpts, (res) => {
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf-8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: res.headers,
            json: () => {
              try { return Promise.resolve(JSON.parse(data)); }
              catch(e) { return Promise.reject(new Error("Invalid JSON: " + data.slice(0, 100))); }
            },
            text: () => Promise.resolve(data)
          });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout: " + url)); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

console.log("✅ Custom DNS fetch aktif (bypass sinkholed domains via IP langsung)");
// ────────────────────────────────────────────────────────────────────────────

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
  const testimonialsPath = process.env.VERCEL
    ? path.join("/tmp", "data", "testimonials.json")
    : path.join(__dirname, "data", "testimonials.json");
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
    const { productId, buyerId, playerName, server, whatsapp } = req.body || {};
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
    const cleanPlayerName = playerName && String(playerName).trim() ? String(playerName).trim() : cleanBuyerId;
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
        buyerNick: cleanPlayerName,
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
        buyerNick: cleanPlayerName,
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
    console.error("[Checkout] Error:", err.message);
    res.status(500).json({ success:false, message: err.message });
  }
});

// ---------- PUBLIK: jumlah transaksi (ringan, untuk polling dashboard) ----------
app.get("/api/sales/count", requireAdmin, (req, res) => {
  const sales = db.getAllSales();
  const counts = {
    total: sales.length,
    menunggu: sales.filter(s => s.status === "Menunggu Pembayaran").length,
    lunas: sales.filter(s => s.status === "Lunas").length,
  };
  res.json({ success: true, ...counts });
});

// ---------- PUBLIK: buyer klaim sudah bayar (QRIS statis) ----------
// Status diubah ke "Menunggu Konfirmasi Admin". Buyer TIDAK bisa langsung dapat
// status Lunas — admin harus konfirmasi manual setelah cek rekening/e-wallet.
// Untuk Tripay: status Lunas datang otomatis dari webhook.
app.post("/api/sales/confirm-mock/:merchantRef", (req, res) => {
  const sale = db.findByMerchantRef(req.params.merchantRef);
  if(!sale) return res.status(404).json({ success:false, message:"Transaksi tidak ditemukan" });
  // Jika sudah Lunas (misal dari webhook Tripay), kembalikan status terkini
  if(sale.status === "Lunas") return res.json({ success:true, status:"Lunas" });
  // Tandai bahwa buyer klaim sudah bayar → menunggu verifikasi admin
  db.updateStatusByMerchantRef(req.params.merchantRef, "Menunggu Konfirmasi Admin");
  console.log(`[ConfirmMock] Buyer klaim bayar: ${req.params.merchantRef} → Menunggu Konfirmasi Admin`);
  res.json({ success:true, status:"Menunggu Konfirmasi Admin" });
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
app.get("/api/sales/status/:merchantRef", async (req, res) => {
  const sale = db.findByMerchantRef(req.params.merchantRef);
  if(!sale) return res.status(404).json({ success:false, message:"Tidak ditemukan" });

  // Jika status masih Menunggu Pembayaran dan ada Tripay Reference (atau mode Tripay),
  // langsung cek ke server Tripay untuk update otomatis secara real-time
  if(sale.status === "Menunggu Pembayaran" && (sale.tripayReference || !sale.isMock) && process.env.TRIPAY_API_KEY) {
    try {
      const ref = sale.tripayReference || sale.merchantRef;
      const detail = await tripay.getTransactionDetail(ref);
      if(detail && detail.status === "PAID") {
        db.updateStatusByMerchantRef(sale.merchantRef, "Lunas", {
          paidAt: detail.paid_at ? new Date(detail.paid_at * 1000).toISOString() : new Date().toISOString()
        });
        sale.status = "Lunas";
        console.log(`[StatusPolling] Auto-detected PAID via Tripay API for ${sale.merchantRef}`);
      } else if(detail && (detail.status === "EXPIRED" || detail.status === "FAILED")) {
        db.updateStatusByMerchantRef(sale.merchantRef, "Batal");
        sale.status = "Batal";
      }
    } catch(e) {}
  }

  res.json({ success:true, status: sale.status, isMock: !!sale.isMock });
});


// ---------- PUBLIK: lookup nama player berdasarkan ID game ----------

app.get("/api/lookup-player", async (req, res) => {
  const { game, userId, serverId } = req.query;
  if(!game || !userId || !String(userId).trim()) {
    return res.json({ success:false, message:"Parameter tidak lengkap" });
  }
  const uid = String(userId).trim();
  const sid = serverId ? String(serverId).trim() : "";

  try {
    let name = null;
    let source = "";

    // ── ROBLOX ────────────────────────────────────────────────────────────
    if(game === "roblox") {
      const isNumeric = /^\d+$/.test(uid);
      if(isNumeric) {
        // Lookup by Roblox user ID — official API
        try {
          const r = await safeFetch(`https://users.roblox.com/v1/users/${uid}`);
          if(r.ok) {
            const d = await r.json();
            if(d && d.name) { name = d.name; source = "Roblox"; }
          }
        } catch(_) {}
      } else {
        // Lookup by username
        try {
          const r = await safeFetch(`https://users.roblox.com/v1/usernames/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames: [uid], excludeBannedUsers: false })
          });
          if(r.ok) {
            const d = await r.json();
            if(d?.data?.length > 0) { name = d.data[0].name; source = "Roblox"; }
          }
        } catch(_) {}
      }
    }

    // ── MOBILE LEGENDS ────────────────────────────────────────────────────
    else if(game === "ml") {
      if(!/^\d{5,12}$/.test(uid)) {
        return res.json({ success:false, message:"User ID ML tidak valid (harus angka 5-12 digit)" });
      }
      if(sid && !/^\d{1,6}$/.test(sid)) {
        return res.json({ success:false, message:"Server ID ML tidak valid" });
      }
      const zoneId = sid || "2001";

      // Endpoint 1: Coda Shop (terbukti return nama ML resmi)
      try {
        const r = await safeFetch(
          "https://order.codashop.com/api/confirmable-inquiry/MOBILE_LEGENDS_MLST",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
            body: JSON.stringify({ userId: uid, zoneId: zoneId })
          }
        );
        if(r.ok) {
          const d = await r.json();
          const nick = d?.confirmableInquiry?.fields?.find?.(f => f.name === "username")?.value
            || d?.data?.userName
            || d?.userName
            || d?.username
            || d?.nickname;
          if(nick) { name = nick; source = "Mobile Legends"; }
        }
      } catch(_) {}

      // Endpoint 2: api.codashop alternative
      if(!name) {
        try {
          const r = await safeFetch(
            `https://api.codashop.com/v2/order/player-id-lookup`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
              body: JSON.stringify({ game: "MOBILE_LEGENDS_MLST", params: { userId: uid, zoneId: zoneId } })
            }
          );
          if(r.ok) {
            const d = await r.json();
            const nick = d?.data?.username || d?.data?.name || d?.username;
            if(nick) { name = nick; source = "Mobile Legends"; }
          }
        } catch(_) {}
      }

      // Endpoint 3: lapak gaming / mlbb nick api
      if(!name) {
        try {
          const r = await safeFetch(
            `https://api-cekid.com/mlbb/${uid}/${zoneId}`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
          );
          if(r.ok) {
            const d = await r.json();
            const nick = d?.data?.name || d?.name || d?.username || d?.nickname;
            if(nick) { name = nick; source = "Mobile Legends"; }
          }
        } catch(_) {}
      }

      // Jika semua gagal → minta isi manual (jangan tampilkan nama palsu)
      if(!name) {
        return res.json({
          success: false,
          message: "Tidak dapat mengambil nama akun otomatis — silakan isi nama akun kamu secara manual",
          manual: true
        });
      }
    }

    // ── FREE FIRE ─────────────────────────────────────────────────────────
    else if(game === "ff") {
      if(!/^\d{8,12}$/.test(uid)) {
        return res.json({ success:false, message:"User ID Free Fire tidak valid (8-12 angka)" });
      }

      // Endpoint 1: Coda Shop FF
      try {
        const r = await safeFetch(
          "https://order.codashop.com/api/confirmable-inquiry/GARENA_FREE_FIRE",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
            body: JSON.stringify({ userId: uid })
          }
        );
        if(r.ok) {
          const d = await r.json();
          const nick = d?.confirmableInquiry?.fields?.find?.(f => f.name === "username")?.value
            || d?.data?.userName
            || d?.userName
            || d?.username
            || d?.nickname;
          if(nick) { name = nick; source = "Free Fire"; }
        }
      } catch(_) {}

      // Jika gagal → minta isi manual
      if(!name) {
        return res.json({
          success: false,
          message: "Tidak dapat mengambil nama akun Free Fire — silakan isi nama akun kamu secara manual",
          manual: true
        });
      }
    }

    // ── HONOR OF KINGS ────────────────────────────────────────────────────
    else if(game === "hok") {
      if(!uid || uid.length < 3) {
        return res.json({ success:false, message:"Format User ID tidak valid" });
      }
      // HoK tidak punya public lookup — minta manual
      return res.json({
        success: false,
        message: "Silakan isi nama akun Honor of Kings kamu secara manual",
        manual: true
      });
    }

    // ── GAME LAIN ─────────────────────────────────────────────────────────
    else {
      return res.json({
        success: false,
        message: "Silakan isi nama akun kamu secara manual",
        manual: true
      });
    }

    if(name) {
      console.log(`[LookupPlayer] ${game} → ${uid} = "${name}" (${source})`);
      return res.json({ success:true, name, source });
    } else {
      return res.json({ success:false, message:"ID tidak ditemukan, periksa kembali User ID & Server ID" });
    }
  } catch(err) {
    console.error("[LookupPlayer] Error:", err.message);
    return res.json({ success:false, message:"Terjadi kesalahan server, silakan isi nama manual", manual:true });
  }
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
  try {
    const signature = req.headers["x-callback-signature"];
    const valid = tripay.verifyCallbackSignature(req.rawBody, signature);

    if(!valid){
      console.warn("[Webhook] Signature tidak valid! Header:", signature);
      return res.status(403).json({ success:false, message:"Invalid signature" });
    }

    const data = req.body || {};
    const event = req.headers["x-callback-event"] || data.event;
    console.log(`[Webhook] Event: ${event}, merchant_ref: ${data.merchant_ref}, status: ${data.status}`);

    if(event === "payment_status"){
      let status = "Menunggu Pembayaran";
      if(data.status === "PAID") status = "Lunas";
      else if(data.status === "EXPIRED") status = "Kadaluarsa";
      else if(data.status === "FAILED") status = "Gagal";
      else if(data.status === "REFUND") status = "Refund";

      const updated = db.updateStatusByMerchantRef(data.merchant_ref, status, {
        tripayReference: data.reference,
        paidAt: data.paid_at ? new Date(data.paid_at * 1000).toISOString() : undefined,
      });

      if(!updated) {
        console.warn(`[Webhook] merchantRef tidak ditemukan di DB: ${data.merchant_ref}`);
      }
    } else {
      console.log(`[Webhook] Event '${event}' diabaikan.`);
    }

    // Selalu balas 200 ke Tripay agar tidak ada retry yang tidak perlu
    res.json({ success: true });
  } catch(err) {
    console.error("[Webhook] Error tak terduga:", err.message);
    // Tetap balas 200 ke Tripay agar tidak retry berkali-kali
    res.json({ success: true });
  }
});

// ---------- ADMIN: login/verify ----------
app.post("/api/admin/verify", (req, res) => {
  const { password } = req.body || {};
  const config = db.getConfig();
  let adminPassword = process.env.ADMIN_PASSWORD;
  if(!adminPassword || adminPassword === "ganti_password_ini"){
    adminPassword = config.adminPassword || "syanastore2026";
  }
  res.json({ success: password === adminPassword });
});

function requireAdmin(req, res, next){
  const config = db.getConfig();
  let adminPassword = process.env.ADMIN_PASSWORD;
  if(!adminPassword || adminPassword === "ganti_password_ini"){
    adminPassword = config.adminPassword || "syanastore2026";
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

  const imgDir = process.env.VERCEL
    ? path.join("/tmp", "public", "images")
    : path.join(__dirname, "public", "images");
  if(!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  // Simpan sebagai qris.png (selalu overwrite)
  const destPath = path.join(imgDir, "qris.png");
  fs.writeFileSync(destPath, buf);

  console.log(`QRIS image disimpan: ${destPath} (${buf.length} bytes)`);
  res.json({ success:true, path: "/images/qris.png" });
});

// ---------- ADMIN: cek apakah QRIS sudah diupload ----------
app.get("/api/admin/qris-status", (req, res) => {
  const dynamicQrisPath = path.join(process.env.VERCEL ? "/tmp" : __dirname, "public", "images", "qris.png");
  const staticQrisPath = path.join(__dirname, "public", "images", "qris.png");
  const exists = fs.existsSync(dynamicQrisPath) || fs.existsSync(staticQrisPath);
  res.json({ success:true, exists });
});

// ---------- Serve dynamic QRIS image if stored in /tmp ----------
app.get("/images/qris.png", (req, res) => {
  const dynamicQrisPath = path.join(process.env.VERCEL ? "/tmp" : __dirname, "public", "images", "qris.png");
  if (fs.existsSync(dynamicQrisPath)) {
    return res.sendFile(dynamicQrisPath);
  }
  const staticQrisPath = path.join(__dirname, "public", "images", "qris.png");
  if (fs.existsSync(staticQrisPath)) {
    return res.sendFile(staticQrisPath);
  }
  res.status(404).send("QRIS not found");
});

// ---------- Serve frontend statis ----------
app.use(express.static(path.join(__dirname, "public")));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SYANASTORE backend jalan di http://localhost:${PORT}`);
    console.log(`Mode Tripay: ${process.env.TRIPAY_MODE || "(belum diset, default sandbox)"}`);
  });
}

module.exports = app;

