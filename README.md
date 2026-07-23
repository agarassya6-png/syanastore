# SYANASTORE — Backend Toko Top Up dengan QRIS Otomatis (Tripay)

Backend ini menghubungkan toko top up SYANASTORE ke pembayaran **QRIS asli** lewat
[Tripay](https://tripay.co.id), dan mencatat setiap transaksi ke **dashboard
penjualan** secara otomatis.

Alur singkatnya:

```
Pembeli klik "Beli" di web
        │
        ▼
Backend minta kode QRIS ke Tripay  ──► Tripay balikin QR code asli
        │
        ▼
Pembeli scan & bayar pakai e-wallet / m-banking
        │
        ▼
Tripay kirim notifikasi ("webhook") ke backend kalau uang sudah masuk
        │
        ▼
Backend update status jadi "Lunas" → otomatis muncul di dashboard
```

## 1. Daftar akun Tripay

1. Buka https://tripay.co.id lalu daftar sebagai merchant.
2. Untuk uji coba dulu (transaksi tidak beneran), pakai mode **Sandbox**:
   daftar & ambil kredensial di https://tripay.co.id/simulator
3. Setelah akun disetujui, buka menu **Merchant** di dashboard Tripay, catat 3 hal ini:
   - `Merchant Code`
   - `API Key`
   - `Private Key`
4. Pastikan channel **QRIS** aktif di akun kamu (Sandbox biasanya sudah aktif otomatis).

## 2. Install & jalankan di komputer sendiri

Pastikan sudah install [Node.js](https://nodejs.org) versi 18 ke atas.

```bash
cd syanastore-backend
npm install
cp .env.example .env
```

Buka file `.env`, isi:
- `TRIPAY_API_KEY`, `TRIPAY_PRIVATE_KEY`, `TRIPAY_MERCHANT_CODE` → dari langkah 1
- `TRIPAY_MODE=sandbox` (ganti ke `production` kalau sudah siap terima uang asli)
- `ADMIN_PASSWORD` → password buat masuk dashboard

Jalankan:

```bash
npm start
```

Buka `http://localhost:3000` untuk toko, dan `http://localhost:3000/dashboard.html` untuk dashboard admin.

### Supaya webhook Tripay bisa nyampe ke komputer sendiri (testing lokal)

Tripay perlu mengirim notifikasi pembayaran ke server kamu lewat internet — kalau
kamu masih testing di `localhost`, Tripay tidak bisa menjangkaunya. Solusinya
pakai [ngrok](https://ngrok.com) untuk sementara membuka `localhost` ke internet:

```bash
ngrok http 3000
```

Salin URL yang muncul (misal `https://abcd1234.ngrok-free.app`), isi ke `BASE_URL`
di file `.env`, lalu restart server (`npm start`).

### Cara tes transaksi di mode Sandbox

1. Belanja seperti biasa di web sampai muncul QR code.
2. Buka https://tripay.co.id/simulator/transaction, cari transaksi dengan nomor
   referensi yang sama seperti di web kamu.
3. Klik referensinya → scroll ke bawah → klik **UBAH STATUS** → pilih **DIBAYAR**
   → pastikan "Kirim Callback?" = **YA** → **Simpan**.
4. Dalam beberapa detik, halaman checkout di web kamu akan otomatis pindah ke
   "Pembayaran diterima", dan transaksinya langsung muncul di dashboard.

## 3. Deploy ke internet (biar bisa diakses publik & terima uang beneran)

Backend ini adalah aplikasi Node.js biasa, bisa di-deploy ke hosting Node
manapun, misalnya:

- **Railway** / **Render** — paling gampang, tinggal hubungkan repo lalu isi
  Environment Variables sesuai isi `.env.example`.
- **VPS** (misal DigitalOcean, Niagahoster VPS, dll) — install Node.js,
  `git clone` project ini, `npm install`, lalu jalankan dengan
  [pm2](https://pm2.keymetrics.io/) supaya tetap hidup:
  ```bash
  npm install -g pm2
  pm2 start server.js --name syanastore
  ```
  Lalu arahkan domain kamu ke server ini (bisa pakai Nginx sebagai reverse proxy).

Setelah live, ganti `BASE_URL` di `.env` server produksi jadi domain asli kamu
(misal `https://tokokamu.com`), dan ganti `TRIPAY_MODE=production` setelah akun
Tripay kamu disetujui untuk mode produksi.

## 4. Struktur project

```
syanastore-backend/
├── server.js          ← semua endpoint API (checkout, webhook, dashboard, kelola produk)
├── tripay.js          ← komunikasi ke API Tripay + verifikasi webhook
├── db.js              ← penyimpanan data transaksi (file JSON di data/sales.json)
├── products.js        ← katalog produk BAWAAN (seed) — hanya dipakai saat pertama
│                          kali server jalan, dan untuk tombol "Reset ke default"
├── productStore.js     ← penyimpanan katalog produk yang AKTIF (file JSON di
│                          data/products.json) — inilah yang dibaca toko & bisa
│                          diubah kapan saja lewat dashboard
├── public/
│   ├── index.html        ← halaman toko
│   └── dashboard.html    ← dashboard penjualan + kelola produk & harga
├── data/sales.json      (dibuat otomatis saat server pertama jalan)
├── data/products.json   (dibuat otomatis saat server pertama jalan)
└── .env                  ← kredensial kamu (jangan pernah di-share/upload publik)
```

## 5. Hal-hal penting

- **Ganti harga/produk kapan saja**: buka dashboard admin
  (`/dashboard.html`) → menu **"Kelola Produk & Harga"`.
  - Ubah harga, nama item, atau bonus langsung di tabel, lalu klik **Simpan**
    per baris.
  - Tombol **"+ Tambah produk"** untuk menambah item baru (mis. paket diamond
    baru), dan **"Hapus"** di tiap baris untuk menghapus produk.
  - Perubahan langsung tersimpan di `data/products.json` dan langsung tampil
    di toko — **tidak perlu edit kode atau restart server**.
  - Tombol **"Reset ke default"** mengembalikan katalog ke isi awal di
    `products.js` kalau suatu saat perlu mulai ulang.
- **Ganti password dashboard**: ubah `ADMIN_PASSWORD` di `.env`.
- **Data transaksi tersimpan di** `data/sales.json`. Untuk toko dengan traffic
  tinggi, sebaiknya ganti `db.js` supaya pakai database sungguhan (PostgreSQL/MySQL)
  — struktur kode sudah dipisah supaya gampang diganti tanpa mengubah `server.js`.
- **Kode channel pembayaran**: kode `"QRIS2"` di `tripay.js` dipakai untuk QRIS
  umum di Tripay. Kalau ternyata beda di akunmu, cek daftar channel aktif lewat
  endpoint `GET /api/merchant/payment-channel` di dokumentasi Tripay
  (https://tripay.co.id/developer) dan sesuaikan.
- **Jangan upload file `.env` ke GitHub / tempat publik** — isinya kredensial
  yang bisa dipakai orang lain untuk membuat transaksi atas nama tokomu.
