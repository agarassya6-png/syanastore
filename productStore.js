// Penyimpanan KATALOG PRODUK yang bisa diubah kapan saja lewat dashboard admin
// (harga, nama item, bonus, produk baru, hapus produk) — tanpa perlu edit kode
// atau restart server. Datanya disimpan di data/products.json.
//
// Kalau file data/products.json belum ada (pertama kali server dijalankan),
// modul ini otomatis mengisinya dari DEFAULT_PRODUCTS di products.js.

const fs = require("fs");
const path = require("path");
const { GAMES, DEFAULT_PRODUCTS, gameName } = require("./products");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "products.json");

function ensureFile(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if(!fs.existsSync(DATA_FILE)){
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_PRODUCTS, null, 2), "utf-8");
  }
}

function readProducts(){
  ensureFile();
  try{
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  }catch(e){
    return DEFAULT_PRODUCTS;
  }
}

function writeProducts(products){
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2), "utf-8");
}

function getAllProducts(){
  return readProducts();
}

function getProduct(id){
  const catalog = readProducts();
  for (const game of catalog) {
    if (game.products && Array.isArray(game.products)) {
      const prod = game.products.find(p => p.id === id);
      if (prod) {
        return {
          id: prod.id,
          title: prod.name,
          price: prod.price,
          game: game.id,
          sub: game.name
        };
      }
    }
  }
  return null;
}

function saveCatalog(catalog){
  writeProducts(catalog);
}

function resetToDefault(){
  writeProducts(DEFAULT_PRODUCTS);
  return DEFAULT_PRODUCTS;
}

module.exports = {
  GAMES,
  gameName,
  getAllProducts,
  getProduct,
  saveCatalog,
  resetToDefault,
};

