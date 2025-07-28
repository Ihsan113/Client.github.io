const express = require('express');
const cors = require('cors');
const fs = require('fs'); // Tetap gunakan
const path = require('path'); // Tetap gunakan
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// ===============================
// Ambil key_user dan fee dari key.json
// ===============================
const keyPath = path.join(__dirname, 'key.json');
let key_user;
let fee_client;
let feePersen;

try {
  const keyConfig = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  key_user = keyConfig.key_user;
  fee_client = keyConfig.fee; // Asumsi 'fee' di key.json adalah string atau number
  feePersen = parseFloat(fee_client);

  // Validasi sederhana
  if (!key_user || isNaN(feePersen)) {
    console.error("ERROR: key_user atau fee (harus angka) di key.json tidak valid.");
    // Opsional: Anda bisa memutuskan untuk menghentikan aplikasi jika konfigurasi vital tidak ada
    // process.exit(1);
  }
} catch (error) {
  console.error("ERROR: Gagal membaca atau memparsing key.json.");
  console.error(error.message);
  // Opsional: Jika key.json sangat krusial, Anda bisa menghentikan aplikasi di sini
  // process.exit(1);
}

// ============================
// Endpoint Produk + Hitung Fee
// URL akan menjadi /api/produk-client
// ============================
app.post('/api/produk-client', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name wajib diisi' });
  }

  console.log('=== [LOG] Request Produk ===');
  console.log(JSON.stringify({ name }, null, 2));

  try {
    const response = await axios.post('http://139.59.122.34:1054/produk', { name });
    const produkList = response.data;

    const finalProduk = produkList.map(item => {
      const feeNominal = Math.round(item.price * (feePersen / 100));
      const totalPrice = Math.ceil(item.price + feeNominal); // dibulatkan ke atas

      return {
        ...item,
        fee: feeNominal,
        price: totalPrice
      };
    });

    console.log('=== [LOG] Produk Final ===');
    console.log(JSON.stringify(finalProduk, null, 2));

    res.json(finalProduk);
  } catch (err) {
    console.error('=== [ERROR] Gagal ambil produk ===');
    console.error(err.message);
    res.status(500).json({ error: 'Gagal mengambil data produk dari server pusat' });
  }
});

// ==========================
// Endpoint Kirim Transaksi
// URL akan menjadi /api/transaksi
// ==========================
app.post('/api/transaksi', async (req, res) => {
  const data = req.body;

  console.log('=== [LOG] Transaksi Masuk ===');
  console.log(JSON.stringify(data, null, 2));

  try {
    // fee_client diambil langsung dari key.json
    const payload = {
      ...data,
      key_user,
      fee_client,
      fee_by_customer: "false"
    };

    console.log('=== [LOG] Payload ke Server Pusat ===');
    console.log(JSON.stringify(payload, null, 2));

    const response = await axios.post('http://139.59.122.34:1054/api/h2h/deposit/create', payload);

    console.log('=== [LOG] Respon dari Server Pusat ===');
    console.log(JSON.stringify(response.data, null, 2));

    res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('=== [ERROR] Gagal kirim transaksi ===');
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal mengirim ke server pusat',
      error: error?.response?.data || error.message
    });
  }
});

// ==========================
// Default Route untuk Vercel Serverless Function
// ==========================
// Ini adalah cara yang benar untuk mengekspor aplikasi Express agar Vercel bisa menanganinya
module.exports = (req, res) => app(req, res);
