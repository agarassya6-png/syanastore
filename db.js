// Penyimpanan sederhana berbasis file JSON. Cukup untuk toko kecil-menengah.
// Kalau traffic sudah besar, ganti isi modul ini dengan koneksi ke database
// sungguhan (PostgreSQL/MySQL) tanpa perlu ubah bagian server.js lainnya.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sales.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const DEFAULT_CONFIG = {
  storeName: "SyanaStore.id",
  tagline: "Lightning Fast Trusted Service",
  wa: "62895423096125",
  instagram: "syanastore.id",
  adminPassword: "admin123"
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
  fs.writeFileSync(DATA_FILE, JSON.stringify(sales, null, 2), "utf-8");
}

function addSale(sale){
  const sales = readSales();
  sales.unshift(sale);
  writeSales(sales);
  return sale;
}

function findByMerchantRef(merchantRef){
  return readSales().find(s => s.merchantRef === merchantRef) || null;
}

function updateStatusByMerchantRef(merchantRef, status, extra = {}){
  const sales = readSales();
  const idx = sales.findIndex(s => s.merchantRef === merchantRef);
  if(idx === -1) return null;
  sales[idx] = { ...sales[idx], status, ...extra, updatedAt: new Date().toISOString() };
  writeSales(sales);
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
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
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

