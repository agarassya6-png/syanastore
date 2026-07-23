# Panduan Deployment SYANASTORE di Vercel

Aplikasi backend ini telah disesuaikan agar kompatibel dengan lingkungan **Serverless Vercel** yang menggunakan sistem file *Read-Only* (tidak bisa menulis file permanen di hosting).

---

## 1. Persiapan Menggunakan Git & GitHub

Pastikan Anda sudah menginisialisasi Git di komputer lokal Anda dan mengunggah kode ke GitHub (sebagai repositori **Private**).

```bash
git init
git add .
git commit -m "Configure Vercel Deployment"
```

Hubungkan ke repositori GitHub Anda dan unggah kodenya:
```bash
git remote add origin https://github.com/USERNAME/NAMA_REPOSITORI.git
git branch -M main
git push -u origin main
```

---

## 2. Cara Deploy ke Vercel

1. Buka dashboard [Vercel](https://vercel.com) dan masuk dengan akun Anda.
2. Klik **Add New...** -> **Project**.
3. Import repositori **syanastore-backend** yang telah Anda unggah ke GitHub.
4. Pada bagian **Environment Variables**, tambahkan variabel berikut:
   * `TRIPAY_API_KEY` = *(API Key dari dashboard Tripay Anda)*
   * `TRIPAY_PRIVATE_KEY` = *(Private Key dari dashboard Tripay Anda)*
   * `TRIPAY_MERCHANT_CODE` = *(Merchant Code dari dashboard Tripay Anda)*
   * `TRIPAY_MODE` = `sandbox` (atau `production` jika sudah siap terima uang asli)
   * `ADMIN_PASSWORD` = *(Password rahasia Anda untuk masuk ke dashboard admin)*
   * `BASE_URL` = *(URL domain Vercel Anda, contoh: `https://syanastore.vercel.app`)*
5. Klik tombol **Deploy**.
6. Setelah deploy selesai, pastikan Anda memperbarui nilai `BASE_URL` di pengaturan environment variables Vercel Anda dengan URL asli yang didapatkan dari Vercel, lalu lakukan redeploy agar Webhook Tripay berjalan normal.

---

## 3. Catatan Penting Mengenai Penyimpanan Data (PENTING)

* **Filesystem Ephemeral:** Vercel menggunakan serverless functions, sehingga penulisan data transaksi (`data/sales.json`) dan upload QRIS disimpan di folder sementara `/tmp` yang bersifat ephemeral (sementara).
* **Reset Data:** Data transaksi dan upload gambar QRIS Anda akan **ter-reset atau hilang secara berkala** (biasanya setelah beberapa saat tanpa aktivitas ketika serverless function mengalami *cold start*).
* **Saran Produksi:** Jika Anda ingin aplikasi ini digunakan secara permanen dan menampung banyak data transaksi riil:
  1. Direkomendasikan menggunakan hosting server reguler seperti **Railway.app** atau **VPS** (karena mendukung persistent storage).
  2. Atau Anda dapat memodifikasi file [db.js](file:///Users/rassya16/Downloads/syanastore/db.js) untuk menghubungkan aplikasi ke database online persisten seperti **Supabase (PostgreSQL)** atau **MongoDB Atlas** yang gratis.
