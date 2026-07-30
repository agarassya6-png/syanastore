// Penyimpanan sederhana berbasis file JSON. Cukup untuk toko kecil-menengah.
// Kalau traffic sudah besar, ganti isi modul ini dengan koneksi ke database
// sungguhan (PostgreSQL/MySQL) tanpa perlu ubah bagian server.js lainnya.
// v2: atomic write (tulis ke .tmp dulu lalu rename) agar data tidak korup.

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "data")
  : path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sales.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const DEFAULT_CONFIG = {
  storeName: "SyanaStore.id",
  tagline: "Lightning Fast Trusted Service",
  wa: "62895423096125",
  instagram: "syanastore.id",
  adminPassword: "syanastore2026"
};

function ensureFile(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf-8");
}

function ensureConfigFile(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if(!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
}

function readSales(){
  ensureFile();
  try{
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  }catch(e){
    return [];
  }
}

function writeSales(sales){
  ensureFile();
  // Atomic write: tulis ke file sementara dulu, lalu rename
  // Mencegah data korup kalau server crash saat menulis
  const tmp = DATA_FILE + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(sales, null, 2), "utf-8");
    fs.renameSync(tmp, DATA_FILE);
  } catch(e) {
    console.error("[DB] Gagal menulis sales:", e.message);
    try { if(fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch(_){}
    throw e;
  }
}

function addSale(sale){
  const sales = readSales();
  // Cek duplikat merchantRef sebelum menambah
  if(sale.merchantRef && sales.find(s => s.merchantRef === sale.merchantRef)) {
    console.warn("[DB] addSale: merchantRef sudah ada, skip duplikat:", sale.merchantRef);
    return sale;
  }
  sales.unshift(sale);
  writeSales(sales);
  console.log(`[DB] Sale ditambahkan: ${sale.merchantRef} | ${sale.item} | Rp${sale.price}`);
  return sale;
}

function findByMerchantRef(merchantRef){
  return readSales().find(s => s.merchantRef === merchantRef) || null;
}

function updateStatusByMerchantRef(merchantRef, status, extra = {}){
  const sales = readSales();
  const idx = sales.findIndex(s => s.merchantRef === merchantRef);
  if(idx === -1) {
    console.warn("[DB] updateStatus: merchantRef tidak ditemukan:", merchantRef);
    return null;
  }
  const oldStatus = sales[idx].status;
  sales[idx] = { ...sales[idx], status, ...extra, updatedAt: new Date().toISOString() };
  writeSales(sales);
  console.log(`[DB] Status diupdate: ${merchantRef} | ${oldStatus} → ${status}`);
  return sales[idx];
}

function getAllSales(){
  return readSales();
}

function resetSales(){
  writeSales([]);
}

function getConfig(){
  ensureConfigFile();
  try{
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }catch(e){
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config){
  ensureConfigFile();
  const tmp = CONFIG_FILE + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf-8");
    fs.renameSync(tmp, CONFIG_FILE);
  } catch(e) {
    console.error("[DB] Gagal menyimpan config:", e.message);
    try { if(fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch(_){}
    throw e;
  }
}

module.exports = {
  addSale,
  findByMerchantRef,
  updateStatusByMerchantRef,
  getAllSales,
  resetSales,
  getConfig,
  saveConfig,
};

