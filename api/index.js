const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();


app.use(cors());
app.use(express.json());

// ===============================
// Ambil key_user dan fee dari key.json
// ===============================
const keyPath = path.join(__dirname, 'key.json');
const { key_user, fee: fee_client } = JSON.parse(fs.readFileSync(keyPath));
const feePersen = parseFloat(fee_client); // tetap digunakan untuk produk-client

// ============================
// Endpoint Produk + Hitung Fee
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
// Default Route
// ==========================
app.get('/', (req, res) => {
  res.send('Server berjalan');
});


// ==========================
// Default Route
// ==========================
module.exports = app;
module.exports = (req, res) => app(req, res);
