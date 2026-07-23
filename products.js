// Katalog PRODUK BAWAAN (seed). File ini HANYA dipakai untuk mengisi data
// pertama kali server dijalankan, dan sebagai isi "Reset ke default" di
// dashboard admin.

const GAMES = [
  { id: "ml",      name: "Mobile Legends", publisher: "Moonton",          category: "Top Up Game", color: "#7B5CF0", image: "/images/ml.png" },
  { id: "ff",      name: "Free Fire",      publisher: "Garena",           category: "Top Up Game", color: "#FF4D8D", image: "/images/ff.png" },
  { id: "hok",     name: "Honor of Kings", publisher: "Level Infinite",   category: "Top Up Game", color: "#00E5CC", image: "/images/hok.png" },
  { id: "roblox",  name: "Roblox",         publisher: "Roblox Corp (Via Login)", category: "Top Up Game", color: "#FFB800", image: "/images/roblox.png" }
];

const DEFAULT_PRODUCTS = [
  {
    id: "ml",
    name: "Mobile Legends",
    publisher: "Moonton",
    category: "Top Up Game",
    color: "#7B5CF0",
    image: "/images/ml.png",
    products: [
      { id: "ml-5", name: "5 Diamonds", price: 1500 },
      { id: "ml-12", name: "12 Diamonds", price: 3500 },
      { id: "ml-19", name: "19 Diamonds", price: 5500 },
      { id: "ml-28", name: "28 Diamonds", price: 7500 },
      { id: "ml-44", name: "44 Diamonds", price: 11500 },
      { id: "ml-59", name: "59 Diamonds", price: 15000 },
      { id: "ml-85", name: "85 Diamonds", price: 22000 },
      { id: "ml-100", name: "100 Diamonds", price: 26200 },
      { id: "ml-170", name: "170 Diamonds", price: 43500 },
      { id: "ml-296", name: "296 Diamonds", price: 75500 },
      { id: "ml-568", name: "568 Diamonds", price: 142000 },
      { id: "ml-875", name: "875 Diamonds", price: 218000 }
    ]
  },
  {
    id: "ff",
    name: "Free Fire",
    publisher: "Garena",
    category: "Top Up Game",
    color: "#FF4D8D",
    image: "/images/ff.png",
    products: [
      { id: "ff-5", name: "5 Diamond", price: 1000 },
      { id: "ff-12", name: "12 Diamond", price: 2000 },
      { id: "ff-50", name: "50 Diamond", price: 7000 },
      { id: "ff-70", name: "70 Diamond", price: 10000 },
      { id: "ff-140", name: "140 Diamond", price: 18700 },
      { id: "ff-355", name: "355 Diamond", price: 46000 },
      { id: "ff-720", name: "720 Diamond", price: 87000 },
      { id: "ff-1450", name: "1.450 Diamond", price: 175000 }
    ]
  },
  {
    id: "hok",
    name: "Honor of Kings",
    publisher: "Level Infinite",
    category: "Top Up Game",
    color: "#00E5CC",
    image: "/images/hok.png",
    products: [
      { id: "hok-16", name: "16 Tokens", price: 3060 },
      { id: "hok-80", name: "80 Tokens", price: 14565 },
      { id: "hok-240", name: "240 Tokens", price: 42584 },
      { id: "hok-400", name: "400 Tokens", price: 68000 },
      { id: "hok-560", name: "560 Tokens", price: 86800 },
      { id: "hok-800", name: "800 Tokens", price: 119000 },
      { id: "hok-1200", name: "1.200 Tokens", price: 187000 },
      { id: "hok-2400", name: "2.400 Tokens", price: 361000 }
    ]
  },
  {
    id: "roblox",
    name: "Roblox",
    publisher: "Roblox Corp (Via Login)",
    category: "Top Up Game",
    color: "#FFB800",
    image: "/images/roblox.png",
    products: [
      { id: "roblox-80", name: "80 Robux", price: 16000 },
      { id: "roblox-160", name: "160 Robux", price: 31000 },
      { id: "roblox-240", name: "240 Robux", price: 46000 },
      { id: "roblox-320", name: "320 Robux", price: 61000 },
      { id: "roblox-500", name: "500 Robux", price: 74000 },
      { id: "roblox-1000", name: "1.000 Robux", price: 148000 }
    ]
  }
];

function gameName(gameId){
  const g = GAMES.find(g => g.id === gameId);
  return g ? g.name : gameId;
}

module.exports = { GAMES, DEFAULT_PRODUCTS, gameName };

