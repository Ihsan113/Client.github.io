const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();


app.use(cors());
app.use(express.json());

// ===============================
// Ambil key_user dan fee dari key.json (Harus ada di direktori yang sama)
// ===============================
const keyPath = path.join(__dirname, 'key.json');
const { key_user, fee: fee_client } = JSON.parse(fs.readFileSync(keyPath));

// URL server utama (index.js) Anda. Pastikan IP dan Port sudah benar.
const MAIN_SERVER_URL = 'http://139.59.122.34:1054'; 

// ============================
// Endpoint Produk (Proxy ke Server Utama)
// ============================
app.post('/api/produk-client', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name wajib diisi' });
  }

  console.log('=== [LOG client.js] Request Produk dari Frontend ===');
  console.log(JSON.stringify({ name }, null, 2));

  try {
    // Memanggil endpoint /produk di server utama (index.js)
    const response = await axios.post(`${MAIN_SERVER_URL}/produk`, { name });
    const produkList = response.data; // ProdukList ini sudah memiliki harga yang sudah dimarkup oleh index.js

    console.log('=== [LOG client.js] Produk Final dari Server Utama ===');
    console.log(JSON.stringify(produkList, null, 2));

    res.json(produkList);
  } catch (err) {
    console.error('=== [ERROR client.js] Gagal ambil produk dari server utama ===');
    console.error(err.message);
    res.status(500).json({ error: 'Gagal mengambil data produk dari server pusat' });
  }
});

// ============================
// Endpoint Deposit Methods (Proxy ke Server Utama)
// ============================
app.get('/api/deposit-methods-client', async (req, res) => {
  console.log('=== [LOG client.js] Request Deposit Methods dari Frontend ===');
  try {
    // Memanggil endpoint /deposit-methods di server utama (index.js)
    const response = await axios.get(`${MAIN_SERVER_URL}/deposit-methods`);
    
    console.log('=== [LOG client.js] Deposit Methods dari Server Utama ===');
    console.log(JSON.stringify(response.data, null, 2));

    res.json(response.data);
  } catch (err) {
    console.error('=== [ERROR client.js] Gagal ambil deposit methods dari server utama ===');
    console.error(err.message);
    res.status(500).json({ error: 'Gagal mengambil metode deposit dari server pusat' });
  }
});


// ==========================
// Endpoint Kirim Transaksi (Proxy ke Server Utama)
// ==========================
app.post('/api/transaksi', async (req, res) => {
  const data = req.body; // Data yang dikirim dari frontend/mobile Anda

  console.log('=== [LOG client.js] Transaksi Masuk dari Frontend ===');
  console.log(JSON.stringify(data, null, 2));

  // Pastikan semua data yang dibutuhkan oleh server utama (index.js) ada
  const {
    target,
    nama,
    price,    // Harga produk setelah markup 1% Anda
    fee,      // Fee manual yang dimasukkan klien
    nominal,  // Total nominal yang dihitung di frontend (harga + fee + biaya deposit ForestAPI)
    email,
    nickname,
    metode,
    note,
    reff_id,
    provider,
    code,
  } = data;

  try {
    // Payload yang akan dikirim ke server utama (index.js)
    const payloadToMainServer = {
      target,
      nama,
      price: parseFloat(price), 
      fee: parseFloat(fee || 0), 
      nominal: parseFloat(nominal),
      email,
      nickname,
      metode,
      note,
      reff_id,
      key_user, // key_user dari key.json (global di client.js)
      fee_client, // fee_client dari key.json (global di client.js)
      fee_by_customer: "false", // Sesuaikan jika ingin ForestAPI membebankan fee ke customer mereka
      provider,
      code,
    };

    console.log('=== [LOG client.js] Payload ke Server Utama ===');
    console.log(JSON.stringify(payloadToMainServer, null, 2));

    // Memanggil endpoint /api/h2h/deposit/create di server utama (index.js)
    const response = await axios.post(`${MAIN_SERVER_URL}/api/h2h/deposit/create`, payloadToMainServer);

    console.log('=== [LOG client.js] Respon dari Server Utama ===');
    console.log(JSON.stringify(response.data, null, 2));

    res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('=== [ERROR client.js] Gagal kirim transaksi ke server utama ===');
    console.error(error.message);
    // Teruskan error dari server utama jika ada, agar frontend bisa tahu
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Gagal mengirim ke server pusat',
      error: error.response?.data || error.message
    });
  }
});

// ==========================
// Default Route
// ==========================
app.get('/', (req, res) => {
  res.send('Server client (proxy) berjalan');
});


// Export app untuk Vercel/similar environments
module.exports = app;

// Jika Anda menjalankan client.js ini secara lokal dengan `node client.js`,
// Anda bisa uncomment baris di bawah ini dan sesuaikan PORT jika perlu.
// const CLIENT_PORT = process.env.PORT || 3000; 
// app.listen(CLIENT_PORT, () => console.log(`Client server berjalan di port ${CLIENT_PORT}`));
