const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// --- KONFIGURASI MONGODB ---
const uri = "mongodb+srv://Sanz:Gombong123@cluster0.elarb3c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

async function connectToMongo() {
    try {
        await client.connect();
        console.log("Berhasil terhubung ke MongoDB Atlas!");
        return client.db("DanzKuStore");
    } catch (err) {
        console.error("Gagal terhubung ke MongoDB:", err);
        process.exit(1);
    }
}

let db;
connectToMongo().then((database) => {
    db = database;
    console.log("Database connection established");
});

// Konfigurasi transporter Gmail
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'ihsanfuadi854@gmail.com',
        pass: 'gsnl zcyw vefn kvce'
    }
});

// --- KONFIGURASI ATLANTIC PEDIA API ---
const ATLANTIC_API_KEY = 'mkbtL4HPQ8Gp0Vw4rezoPXzhzN85y5gf';
const ATLANTIC_BASE_URL = 'http://188.166.182.233:1060/layanan';

// Middleware untuk mencatat semua permintaan dengan body JSON
app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
        console.log('Body:', JSON.stringify(req.body, null, 2));
    } else {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    }
    next();
});

// --- API Endpoints ---

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'DanzKu Store API is running!',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Get products by provider
app.post('/produk', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama provider tidak boleh kosong' });

    try {
        const { data } = await axios.post(
            `${ATLANTIC_BASE_URL}/price_list`,
            { api_key: ATLANTIC_API_KEY, type: 'prabayar' }
        );

        if (!data.status || !Array.isArray(data.data)) {
            return res.status(500).json({ error: 'Gagal mengambil data produk dari Atlantic Pedia' });
        }
        const providerName = name.toLowerCase();

        const filtered = data.data.reduce((acc, item) => {
            if (!item.provider) return acc;
            const provider = item.provider.toLowerCase();
            const status = String(item.status).toLowerCase();
            if (
                provider === providerName &&
                (status === 'true' || status === 'active' || status === 'available')
            ) {
                acc.push({
                    code: item.code,
                    name: item.name,
                    note: item.note,
                    type: item.type,
                    provider: item.provider,
                    price: item.price
                });
            }
            return acc;
        }, []);

        if (filtered.length === 0) {
            return res.status(404).json({ error: `Produk untuk provider "${name}" tidak ditemukan atau tidak tersedia.` });
        }
        res.json(filtered);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengambil data produk', details: err.message });
    }
});

// Get deposit methods
app.get('/deposit-methods', async (req, res) => {
    try {
        const response = await axios.post(`${ATLANTIC_BASE_URL}/deposit_metode`, {
            api_key: ATLANTIC_API_KEY,
            type: 'ewallet'
        });

        if (response.data.status === true) {
            const filtered = response.data.data
                .filter(item => item.status === "aktif")
                .map(item => {
                    return {
                        metode: item.metode,
                        fee_persen: item.fee_persen,
                        fee: item.fee,
                        minimum: item.min,
                        status: item.status,
                        type: item.type,
                        img_url: item.img_url,
                    };
                });

            res.json({ status: true, data: filtered });
        } else {
            res.status(500).json({ status: false, message: 'Gagal mengambil data dari API Atlantic' });
        }
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// Create deposit
app.post('/api/deposit/create', async (req, res) => {
    const { nominal, metode, reff_id, key_user, target, nama, email, nickname, price, provider, code } = req.body;
    if (!nominal || !metode || !reff_id || !target || !nama || !email || !price || !provider || !code) {
        return res.status(400).json({ status: 'error', message: 'Data yang dikirim tidak lengkap.' });
    }

    try {
        const { data: priceListData } = await axios.post(
            `${ATLANTIC_BASE_URL}/price_list`,
            { api_key: ATLANTIC_API_KEY, type: 'prabayar' }
        );

        if (!priceListData.status || !Array.isArray(priceListData.data)) {
            return res.status(500).json({ status: 'error', message: 'Gagal mengambil data harga produk dari Atlantic Pedia' });
        }
        const matchedProduct = priceListData.data.find(p => p.code === code);
        if (!matchedProduct) {
            return res.status(404).json({ status: 'error', message: 'Kode produk tidak valid.' });
        }

        const clientPrice = parseFloat(price);
        const atlanticPrice = parseFloat(matchedProduct.price);
        if (clientPrice !== atlanticPrice) {
            console.warn(`[VALIDATION FAILED] Harga dari klien (${clientPrice}) tidak cocok dengan harga dari API (${atlanticPrice}).`);
            return res.status(400).json({ status: 'error', message: 'Harga tidak valid. Mohon segarkan halaman dan coba lagi.' });
        }

        const atlanticPayload = {
            api_key: ATLANTIC_API_KEY,
            reff_id,
            nominal: parseInt(nominal),
            metode: metode.toLowerCase(),
        };

        console.log('\n=== Payload ke Atlantic Pedia untuk Deposit ===');
        console.log(JSON.stringify(atlanticPayload, null, 2));

        const response = await axios.post(`${ATLANTIC_BASE_URL}/deposit_create`, atlanticPayload);
        console.log('\n=== Respons Atlantic Pedia untuk Deposit ===');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.status !== true) {
            return res.status(500).json({ status: 'error', message: 'Gagal membuat deposit di Atlantic Pedia', details: response.data.message });
        }

        const atlanticData = response.data.data;
        const transactionId = uuidv4();

        const dataToSave = {
            _id: transactionId,
            reff_id: reff_id,
            id_pembayaran_provider: atlanticData.id,
            status: atlanticData.status || 'unpaid',
            data_user: {
                target,
                nama,
                email,
                nickname,
                price,
                provider,
                code
            },
            data_deposit: {
                nominal: atlanticData.nominal_final,
                harga_asli: atlanticData.harga_asli,
                metode: metode,
                url_pembayaran: atlanticData.url || null,
                qr_image: atlanticData.qr_image || null,
                expired_at: atlanticData.expired_at ? new Date(atlanticData.expired_at) : null,
            },
            createdAt: new Date(),
            lastCheckedAt: new Date(),
        };

        const transactionsCollection = db.collection('transactions');
        await transactionsCollection.insertOne(dataToSave);
        console.log(`Deposit transaction ${transactionId} saved to MongoDB.`);

        res.json({
            status: 'success',
            message: 'Deposit berhasil dibuat. Silahkan lanjutkan pembayaran.',
            data: {
                reff_id: dataToSave.reff_id,
                url_pembayaran: atlanticData.url || null,
                qr_image: atlanticData.qr_image || null,
            }
        });

    } catch (error) {
        console.error('\n=== Gagal Menghubungi Atlantic Pedia untuk Deposit ===');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }

        res.status(500).json({
            status: 'error',
            code: 500,
            message: 'Gagal membuat deposit',
            error: error?.response?.data || error.message
        });
    }
});

// Get transaction by reff_id
app.get('/api/transaction/:reff_id', async (req, res) => {
    const { reff_id } = req.params;
    try {
        const transactionsCollection = db.collection('transactions');
        const transactionData = await transactionsCollection.findOne({ reff_id });
        if (!transactionData) {
            console.log(`[GET /api/transaction/${reff_id}] Transaksi tidak ditemukan di MongoDB.`);
            return res.status(404).json({
                status: 'error',
                code: 404,
                message: 'Transaksi tidak ditemukan. Pastikan reff_id sudah benar.'
            });
        }
        const { _id, ...filteredData } = transactionData;
        res.json({
            status: 'success',
            data: filteredData
        });
    } catch (error) {
        console.error('Gagal mengambil transaksi dari MongoDB:', error);
        res.status(500).json({
            status: 'error',
            code: 500,
            message: 'Terjadi kesalahan saat mengambil transaksi',
            error: error.message
        });
    }
});

// Webhook Atlantic
app.post('/webhook/atlantic', async (req, res) => {
    const { event, data } = req.body;
    console.log(`\n=== Menerima Webhook untuk Event: ${event} ===`);
    console.log(JSON.stringify(req.body, null, 2));

    try {
        const transactionsCollection = db.collection('transactions');
        const { reff_id } = data;

        // Cari transaksi berdasarkan reff_id
        const transactionDoc = await transactionsCollection.findOne({ reff_id });
        if (!transactionDoc) {
            console.warn(`[WEBHOOK] Transaksi dengan reff_id ${reff_id} tidak ditemukan.`);
            return res.status(404).json({ message: 'Transaksi tidak ditemukan.' });
        }

        if (event === 'deposit' && data.status === 'processing') {
            await transactionsCollection.updateOne(
                { reff_id },
                { $set: { status: 'processing', updatedAt: new Date() } }
            );

            const { code, target, email, nama, nickname } = transactionDoc.data_user;
            console.log(`[WEBHOOK] Deposit berhasil. Melanjutkan pembuatan transaksi untuk code: ${code}, target: ${target}`);

            const transactionPayload = {
                api_key: ATLANTIC_API_KEY,
                target: target,
                code: code,
                reff_id: reff_id
            };

            const createTransactionResponse = await axios.post(`${ATLANTIC_BASE_URL}/transaksi_create`, transactionPayload);
            const transactionDetails = createTransactionResponse.data.data;

            await transactionsCollection.updateOne(
                { reff_id },
                {
                    $set: {
                        'data_user.id_transaksi_provider': transactionDetails.id,
                        'data_user.status_transaksi_atlantic': transactionDetails.status,
                        'data_user.atlanticApiTransactionResponse': createTransactionResponse.data,
                        updatedAt: new Date()
                    }
                }
            );

            // Kirim email notifikasi pesanan diproses
            if (email) {
                const mailOptions = {
                    from: '"DanzKu Store" <ihsanfuadi854@gmail.com>',
                    to: email,
                    subject: '🚀 Pesananmu Sedang Diproses di DanzKu Store!',
                    html: `
                        <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
                            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); overflow: hidden;">
                                <div style="background-color: #007bff; color: #ffffff; padding: 20px; text-align: center;">
                                    <h1 style="margin: 0;">Pesanan Sedang Diproses!</h1>
                                </div>
                                <div style="padding: 20px;">
                                    <p>Halo **${nickname || 'Pelanggan'}**, 👋</p>
                                    <p>Terima kasih telah berbelanja di DanzKu Store. Pembayaranmu telah berhasil kami terima. Pesanan dengan detail berikut sedang kami proses:</p>
                                    <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; background-color: #fafafa;">
                                        <h3 style="margin-top: 0; color: #333;">Detail Pesanan</h3>
                                        <ul style="list-style-type: none; padding: 0; margin: 0;">
                                            <li style="margin-bottom: 10px;"><strong>Produk:</strong> ${nama}</li>
                                            <li style="margin-bottom: 10px;"><strong>ID Transaksi:</strong> ${reff_id}</li>
                                            <li style="margin-bottom: 10px;"><strong>Status Pembayaran:</strong> Berhasil ✔️</li>
                                            <li style="margin-bottom: 0;"><strong>Status Pesanan:</strong> Sedang Diproses ⏳</li>
                                        </ul>
                                    </div>
                                    <p style="text-align: center; margin-top: 20px;">Kami akan mengirimkan notifikasi lagi setelah pesananmu selesai diproses. Mohon ditunggu ya! 😊</p>
                                </div>
                                <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                                    <p style="margin: 0;">DanzKu Store. Terima kasih telah mempercayakan kami.</p>
                                </div>
                            </div>
                        </div>
                    `
                };
                transporter.sendMail(mailOptions)
                    .then(() => console.log('Email notifikasi pemrosesan berhasil dikirim ke', email))
                    .catch((err) => console.error('Gagal kirim email notifikasi:', err.message));
            }

        } else if (event === 'transaksi' && data.status === 'success') {
            const { reff_id, sn } = data;
            
            await transactionsCollection.updateOne(
                { reff_id },
                {
                    $set: {
                        status: 'completed',
                        'data_user.status_transaksi_atlantic': 'success',
                        'data_user.sn': sn,
                        completedAt: new Date(),
                        updatedAt: new Date()
                    }
                }
            );

            // Kirim email notifikasi sukses
            if (transactionDoc.data_user.email) {
                const mailOptions = {
                    from: '"DanzKu Store" <ihsanfuadi854@gmail.com>',
                    to: transactionDoc.data_user.email,
                    subject: '🎉 Pesananmu Telah Selesai di DanzKu Store!',
                    html: `
                        <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
                            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); overflow: hidden;">
                                <div style="background-color: #28a745; color: #ffffff; padding: 20px; text-align: center;">
                                    <h1 style="margin: 0;">Pesanan Selesai!</h1>
                                </div>
                                <div style="padding: 20px;">
                                    <p>Halo **${transactionDoc.data_user.nickname || 'Pelanggan'}**, 🎉</p>
                                    <p>Selamat! Pesananmu telah berhasil diproses dan selesai. Berikut adalah detail pesananmu:</p>
                                    <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; background-color: #fafafa;">
                                        <h3 style="margin-top: 0; color: #333;">Detail Pesanan</h3>
                                        <ul style="list-style-type: none; padding: 0; margin: 0;">
                                            <li style="margin-bottom: 10px;"><strong>Produk:</strong> ${transactionDoc.data_user.nama}</li>
                                            <li style="margin-bottom: 10px;"><strong>ID Transaksi:</strong> ${reff_id}</li>
                                            ${sn ? `<li style="margin-bottom: 10px;"><strong>Serial Number / SN:</strong> <code>${sn}</code></li>` : ''}
                                            <li style="margin-bottom: 0;"><strong>Status Pesanan:</strong> Selesai ✅</li>
                                        </ul>
                                    </div>
                                    <p style="text-align: center; margin-top: 20px;">Terima kasih telah berbelanja di DanzKu Store. Kami tunggu pesanan berikutnya! 😊</p>
                                </div>
                                <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                                    <p style="margin: 0;">DanzKu Store. Terima kasih telah mempercayakan kami.</p>
                                </div>
                            </div>
                        </div>
                    `
                };
                transporter.sendMail(mailOptions)
                    .then(() => console.log('Email notifikasi sukses berhasil dikirim ke', transactionDoc.data_user.email))
                    .catch((err) => console.error('Gagal kirim email notifikasi:', err.message));
            }
        }
        
        res.status(200).json({ status: 'success', message: 'Webhook diterima.' });

    } catch (error) {
        console.error('Terjadi kesalahan saat memproses webhook:', error?.response?.data || error.message);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan internal.' });
    }
});

// ===== BAGIAN PEMELIHARAAN =====
const finalStatuses = ['completed', 'failed', 'canceled', 'expired'];

async function cleanUpTransactions() {
  try {
    console.log("🔄 Memulai pembersihan data transaksi...");
    const transactionsCollection = db.collection('transactions');

    // Filter: hapus jika status final ATAU pending yang expired
    const filter = {
      $or: [
        { status: { $in: finalStatuses } },
        {
          status: 'pending',
          'data_deposit.expired_at': { $lte: new Date() }
        }
      ]
    };
    
    const result = await transactionsCollection.deleteMany(filter);
    console.log(`✅ Berhasil menghapus ${result.deletedCount} transaksi`);
    return result.deletedCount;
  } catch (err) {
    console.error("❌ Gagal menjalankan pembersihan:", err);
    throw err;
  }
}

// ===== CRON JOBS UNTUK PEMELIHARAAN =====
// Jalankan setiap jam (pada menit ke-0)
cron.schedule('0 * * * *', () => {
  console.log('⏰ Trigger cron job - Pemeliharaan rutin');
  cleanUpTransactions().catch(console.error);
});

// ===== MANUAL TRIGGER VIA API =====
app.get('/api/maintenance', async (req, res) => {
  try {
    console.log('🔧 Manual trigger maintenance');
    const deletedCount = await cleanUpTransactions();
    res.json({ 
      status: 'success', 
      message: 'Maintenance dijalankan secara manual!',
      deletedCount 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Gagal menjalankan maintenance',
      error: error.message 
    });
  }
});

// ===== HEALTH CHECK =====
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await db.command({ ping: 1 });
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'DanzKu Store API',
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      service: 'DanzKu Store API',
      database: 'disconnected',
      error: error.message 
    });
  }
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    status: 'error', 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    status: 'error', 
    message: 'Endpoint not found' 
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3030;

// Export untuk Vercel
module.exports = app;

// Jalankan server hanya jika tidak di environment Vercel
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server DanzKu Store berjalan di port ${PORT}`);
    console.log('⏰ Cron jobs aktif:');
    console.log('   - Setiap jam: pembersihan transaksi');
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📍 Maintenance: http://localhost:${PORT}/api/maintenance`);
  });
}