# Panduan Hosting SYANASTORE Backend

Aplikasi backend SYANASTORE ini dibuat menggunakan Express.js (Node.js) dan sudah siap dideploy ke berbagai platform hosting.

Berikut adalah langkah-langkah persiapan dan panduan deployment ke beberapa platform populer.

---

## 1. Persiapan Menggunakan Git & GitHub

Sebelum mengunggah kode ke platform hosting, pastikan Anda telah menginisialisasi Git di komputer Anda. File [.gitignore](file:///Users/rassya16/Downloads/syanastore/.gitignore) sudah dibuat secara otomatis untuk mencegah terunggahnya file sensitif seperti `.env` dan folder `node_modules`.

### Langkah-langkah:
1. Buka terminal di folder project ini.
2. Inisialisasi git dan lakukan commit pertama:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
3. Buat repositori baru di akun [GitHub](https://github.com) Anda (buat dalam mode **Private** untuk menjaga keamanan kode Anda).
4. Hubungkan repositori lokal Anda ke GitHub dan push kodenya:
   ```bash
   git remote add origin https://github.com/USERNAME/NAMA_REPOSITORI.git
   git branch -M main
   git push -u origin main
   ```

---

## 2. Pilihan Hosting 1: Railway (Sangat Direkomendasikan)

Railway adalah platform hosting cloud yang sangat mudah digunakan untuk aplikasi Node.js dan mendukung penyimpanan data persisten melalui Volume.

### Langkah Deployment:
1. Daftar atau masuk ke [Railway.app](https://railway.app).
2. Buat project baru: Klik **New Project** -> **Deploy from GitHub repo** -> Pilih repositori **syanastore-backend** Anda.
3. Railway akan mendeteksi Node.js secara otomatis dan melakukan deploy.

### Konfigurasi Variabel Lingkungan (Environment Variables):
Masuk ke tab **Variables** di Railway project Anda, lalu tambahkan variabel berikut:
* `PORT` = `3000` (atau biarkan kosong karena Railway mengaturnya secara otomatis)
* `TRIPAY_API_KEY` = *(API Key dari dashboard Tripay Anda)*
* `TRIPAY_PRIVATE_KEY` = *(Private Key dari dashboard Tripay Anda)*
* `TRIPAY_MERCHANT_CODE` = *(Merchant Code dari dashboard Tripay Anda)*
* `TRIPAY_MODE` = `sandbox` (ubah ke `production` jika sudah siap menggunakan uang asli)
* `ADMIN_PASSWORD` = *(Password rahasia Anda untuk login ke dashboard admin)*
* `BASE_URL` = *(URL publik dari Railway Anda, misalnya: `https://syanastore-production.up.railway.app`)*

### Mengaktifkan Penyimpanan Persisten (Volume):
Karena aplikasi ini menyimpan data transaksi di file lokal `data/sales.json`, Anda harus menambahkan **Volume** agar data transaksi tidak terhapus ketika server restart.
1. Di halaman project Railway Anda, klik **+ Add** -> **Volume**.
2. Hubungkan Volume tersebut ke service backend Anda.
3. Di pengaturan Volume, atur **Mount Path** ke: `/app/data`
4. Lakukan redeploy. Sekarang data transaksi Anda akan tetap aman meskipun server dimulai ulang.

---

## 3. Pilihan Hosting 2: Render (Gratis)

Render menyediakan opsi hosting gratis yang sangat populer untuk aplikasi web Node.js.

### Langkah Deployment:
1. Masuk ke [Render.com](https://render.com).
2. Klik **New** -> **Web Service**.
3. Hubungkan akun GitHub Anda dan pilih repositori **syanastore-backend**.
4. Atur konfigurasi berikut:
   * **Name**: `syanastore-backend`
   * **Region**: Pilih yang terdekat (misal Singapore / `Singapore (sg)`)
   * **Branch**: `main`
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
   * **Instance Type**: `Free` (Gratis)

### Konfigurasi Environment Variables:
Klik tombol **Advanced** saat pembuatan service (atau ke tab **Environment** setelah dibuat), lalu tambahkan variabel lingkungan berikut:
* `TRIPAY_API_KEY` = *(API Key Anda)*
* `TRIPAY_PRIVATE_KEY` = *(Private Key Anda)*
* `TRIPAY_MERCHANT_CODE` = *(Merchant Code Anda)*
* `TRIPAY_MODE` = `sandbox` atau `production`
* `ADMIN_PASSWORD` = *(Password Admin Anda)*
* `BASE_URL` = *(URL Web Service Render Anda, contoh: `https://syanastore.onrender.com`)*

### Mengaktifkan Penyimpanan Persisten (Render Disk):
Untuk mencegah data transaksi hilang di Render Free Tier:
1. Masuk ke tab **Disks** di halaman Web Service Anda.
2. Klik **Add Disk**.
3. Isi kolom dengan:
   * **Name**: `syanastore-data`
   * **Mount Path**: `/opt/render/project/src/data`
   * **Size**: `1 GiB`
4. Klik **Save**. Render akan me-restart server Anda dengan penyimpanan persisten aktif di folder `data`.

---

## 4. Pilihan Hosting 3: VPS (Virtual Private Server)

Jika Anda menggunakan VPS sendiri (seperti Ubuntu di Hostinger, Niagahoster, DigitalOcean, dsb.):

### Langkah Deployment:
1. Hubungkan ke VPS Anda via SSH.
2. Install Node.js v18+ dan git di VPS Anda.
3. Clone repositori Anda:
   ```bash
   git clone https://github.com/USERNAME/NAMA_REPOSITORI.git syanastore
   cd syanastore
   ```
4. Install dependensi:
   ```bash
   npm install
   ```
5. Buat dan isi file `.env` di VPS:
   ```bash
   nano .env
   ```
   *(Salin dan isi nilai-nilai seperti di file `.env.example` lokal).*
6. Install dan jalankan aplikasi menggunakan **PM2** agar server tetap berjalan di latar belakang secara permanen:
   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name "syanastore"
   pm2 startup
   pm2 save
   ```
7. Konfigurasikan **Nginx** sebagai reverse proxy untuk mengarahkan port internal `3000`/`3001` ke port HTTP `80` atau HTTPS `443` menggunakan SSL gratis dari Let's Encrypt.
