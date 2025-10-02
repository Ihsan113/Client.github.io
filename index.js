const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const nodemailer = require('nodemailer');
const dayjs = require('dayjs');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// --- KONFIGURASI MONGODB ---
const uri = "mongodb+srv://Sanz:Gombong123@cluster0.elarb3c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

// Fungsi untuk generate UUID
function uuidv4() {
  return crypto.randomUUID();
}

// Variabel global untuk koneksi
let db = null;
let isConnecting = false;
let connectionPromise = null;

// Fungsi koneksi MongoDB dengan retry logic
async function connectToMongo() {
    if (connectionPromise) {
        return connectionPromise;
    }
    
    connectionPromise = (async () => {
        try {
            isConnecting = true;
            console.log("Menghubungkan ke MongoDB Atlas...");
            
            await client.connect();
            const database = client.db("DanzKuStore");
            
            // Test koneksi
            await database.command({ ping: 1 });
            console.log("✅ Berhasil terhubung ke MongoDB Atlas!");
            
            db = database;
            isConnecting = false;
            
            // Mulai layanan pemeliharaan
            startCleanupService(db);
            
            return database;
        } catch (err) {
            console.error("❌ Gagal terhubung ke MongoDB:", err);
            isConnecting = false;
            connectionPromise = null;
            throw err;
        }
    })();
    
    return connectionPromise;
}

// Middleware untuk memastikan koneksi MongoDB tersedia
app.use(async (req, res, next) => {
    try {
        if (!db && !isConnecting) {
            await connectToMongo();
        } else if (isConnecting) {
            // Tunggu jika sedang connecting
            await connectionPromise;
        }
        
        // Tambahkan db ke request object untuk akses yang lebih aman
        req.db = db;
        next();
    } catch (error) {
        console.error('Error koneksi MongoDB:', error);
        res.status(503).json({ 
            status: 'error', 
            message: 'Database sedang tidak tersedia. Silakan coba lagi.' 
        });
    }
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
const ATLANTIC_BASE_URL = 'http://167.172.83.48:1041/layanan';

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

// --- Middleware untuk Menyajikan Folder Public ---
app.use(express.static(path.join(__dirname, 'public')));

// --- API Endpoints ---
// Modifikasi semua endpoint untuk menggunakan req.db bukan variabel global db

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

        const now = Date.now();
        const expiredTimestamp = atlanticData.expired_at ? 
            new Date(atlanticData.expired_at.replace(' ', 'T') + '+07:00').getTime() : 
            now + (60 * 60 * 1000);

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
                expired_timestamp: expiredTimestamp,
            },
            created_timestamp: now,
            last_checked_timestamp: now,
        };

        // Gunakan req.db dari middleware
        const transactionsCollection = req.db.collection('transactions');
        await transactionsCollection.insertOne(dataToSave);
        console.log(`Deposit transaction ${transactionId} saved to MongoDB.`);

        res.json({
            status: 'success',
            message: 'Deposit berhasil dibuat. Silahkan lanjutkan pembayaran.',
            data: {
                reff_id: dataToSave.reff_id,
                url_pembayaran: atlanticData.url || null,
                qr_image: atlanticData.qr_image || null,
                expired_timestamp: expiredTimestamp
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

app.get('/api/transaction/:reff_id', async (req, res) => {
    const { reff_id } = req.params;
    try {
        // Gunakan req.db dari middleware
        const transactionsCollection = req.db.collection('transactions');
        const transactionData = await transactionsCollection.findOne({ reff_id });
        
        if (!transactionData) {
            console.log(`[GET /api/transaction/${reff_id}] Transaksi tidak ditemukan di MongoDB.`);
            return res.status(404).json({
                status: 'error',
                code: 404,
                message: 'Transaksi tidak ditemukan. Pastikan reff_id sudah benar.'
            });
        }

        const enhancedData = {
            ...transactionData,
            createdAt: transactionData.created_timestamp ? 
                new Date(transactionData.created_timestamp) : null,
            data_deposit: {
                ...transactionData.data_deposit,
                expired_at: transactionData.data_deposit.expired_timestamp ? 
                    new Date(transactionData.data_deposit.expired_timestamp) : null,
                expired_timestamp: transactionData.data_deposit.expired_timestamp
            }
        };

        const { _id, ...filteredData } = enhancedData;
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

app.post('/webhook/atlantic', async (req, res) => {
    const { event, data } = req.body;
    console.log(`\n=== Menerima Webhook untuk Event: ${event} ===`);
    console.log(JSON.stringify(req.body, null, 2));

    try {
        // Gunakan req.db dari middleware
        const transactionsCollection = req.db.collection('transactions');
        const { reff_id } = data;

        const transactionDoc = await transactionsCollection.findOne({ reff_id });
        if (!transactionDoc) {
            console.warn(`[WEBHOOK] Transaksi dengan reff_id ${reff_id} tidak ditemukan.`);
            return res.status(404).json({ message: 'Transaksi tidak ditemukan.' });
        }

        if (event === 'deposit' && data.status === 'processing') {
            await transactionsCollection.updateOne(
                { reff_id },
                {
                    $set: {
                        status: 'processing', 
                        updated_timestamp: Date.now()
                    }
                }
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

            // Kirim email notifikasi
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

// --- ENDPOINT CEK STATUS DEPOSIT (Manual Check) ---
app.post('/api/check-deposit-status', async (req, res) => {
    const { id_deposit } = req.body;
    
    if (!id_deposit) {
        return res.status(400).json({
            status: 'error',
            message: 'id_deposit tidak boleh kosong'
        });
    }

    try {
        console.log(`\n=== Manual Check Deposit Status: ${id_deposit} ===`);
        
        // 1. Cek ke Atlantic Pedia API
        const atlanticPayload = {
            api_key: ATLANTIC_API_KEY,
            id_deposit: id_deposit
        };

        console.log('Payload ke Atlantic Pedia:');
        console.log(JSON.stringify(atlanticPayload, null, 2));

        const response = await axios.post(`${ATLANTIC_BASE_URL}/deposit_status`, atlanticPayload);
        
        console.log('Response dari Atlantic Pedia:');
        console.log(JSON.stringify(response.data, null, 2));

        // 2. Jika deposit SUCCESS, buat transaksi otomatis
        if (response.data.status === true && response.data.data.status === 'success') {
            const depositData = response.data.data;
            
            console.log(`✅ Deposit ${id_deposit} SUCCESS! Melanjutkan pembuatan transaksi...`);

            // 3. Cari data transaksi di database berdasarkan reff_id
            const transactionsCollection = req.db.collection('transactions');
            const transactionDoc = await transactionsCollection.findOne({ 
                'data_deposit.id_pembayaran_provider': id_deposit 
            });

            if (!transactionDoc) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Data transaksi tidak ditemukan untuk deposit ini'
                });
            }

            const { code, target, email, nama, nickname, reff_id } = transactionDoc.data_user;

            // 4. Buat transaksi di Atlantic Pedia
            const transactionPayload = {
                api_key: ATLANTIC_API_KEY,
                target: target,
                code: code,
                reff_id: reff_id
            };

            console.log('Membuat transaksi di Atlantic Pedia:');
            console.log(JSON.stringify(transactionPayload, null, 2));

            const createTransactionResponse = await axios.post(`${ATLANTIC_BASE_URL}/transaksi_create`, transactionPayload);
            const transactionDetails = createTransactionResponse.data.data;

            // 5. Update database
            await transactionsCollection.updateOne(
                { 'data_deposit.id_pembayaran_provider': id_deposit },
                {
                    $set: {
                        status: 'processing',
                        'data_user.id_transaksi_provider': transactionDetails.id,
                        'data_user.status_transaksi_atlantic': transactionDetails.status,
                        'data_user.atlanticApiTransactionResponse': createTransactionResponse.data,
                        updatedAt: new Date(),
                        last_checked_timestamp: Date.now()
                    }
                }
            );

            // 6. Kirim email notifikasi
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
                                    <p>Halo <strong>${nickname || 'Pelanggan'}</strong>, 👋</p>
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
                    .then(() => console.log('✅ Email notifikasi pemrosesan berhasil dikirim ke', email))
                    .catch((err) => console.error('❌ Gagal kirim email notifikasi:', err.message));
            }

            return res.json({
                status: 'success',
                message: 'Deposit berhasil dan transaksi sedang diproses',
                data: {
                    deposit_status: 'success',
                    transaction_created: true,
                    transaction_id: transactionDetails.id,
                    reff_id: reff_id
                }
            });

        } else {
            // Deposit belum success
            return res.json({
                status: 'success',
                message: 'Status deposit berhasil dicek',
                data: {
                    deposit_status: response.data.data?.status || 'unknown',
                    transaction_created: false
                }
            });
        }

    } catch (error) {
        console.error('❌ Error saat cek status deposit:', error.response?.data || error.message);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                status: 'error',
                message: 'Data deposit tidak ditemukan'
            });
        }
        
        res.status(500).json({
            status: 'error',
            message: 'Gagal memeriksa status deposit',
            error: error.response?.data || error.message
        });
    }
});

// --- FUNGSI PEMELIHARAAN ---
const finalStatuses = ['completed', 'failed', 'canceled', 'expired'];

function startCleanupService(dbInstance) {
    const transactionsCollection = dbInstance.collection('transactions');
    const runCleanup = async () => {
        try {
            console.log("Mulai pembersihan data transaksi...");
            
            const filter = {
                $or: [
                    { status: { $in: finalStatuses } },
                    {
                        status: 'pending',
                        'data_deposit.expired_timestamp': { 
                            $lte: Date.now()
                        }
                    }
                ]
            };
            
            const result = await transactionsCollection.deleteMany(filter);
            console.log(`✅ Berhasil menghapus ${result.deletedCount} transaksi dengan status final atau kedaluwarsa.`);
        } catch (err) {
            console.error("❌ Gagal menjalankan pembersihan:", err);
        }
    };

    runCleanup();
    setInterval(runCleanup, 10000);
}

// Fungsi untuk mendapatkan IP public
async function getPublicIp() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        return response.data.ip;
    } catch (error) {
        console.error('Gagal mendapatkan IP public:', error.message);
        return '127.0.0.1';
    }
}

// Modifikasi startup server
const internalPort = process.env.PORT || 1038;

// Coba koneksi MongoDB terlebih dahulu sebelum start server
connectToMongo().then(() => {
    getPublicIp().then(async (publicIp) => {
        app.listen(internalPort, '0.0.0.0', async () => {
            console.log(`Server Express Anda berjalan di port internal: ${internalPort}`);
            console.log(`IP Public Server: ${publicIp}`);
            console.log(`**Untuk mengakses aplikasi dari luar, gunakan IP publik server Anda (${publicIp}) dan port ${internalPort}.**`);
            console.log(`Contoh URL akses: http://${publicIp}:${internalPort}`);
            console.log(`Pastikan Anda mendaftarkan URL webhook ini di Atlantic Pedia: http://${publicIp}:${internalPort}/webhook/atlantic`);
        });
    }).catch(error => {
        console.error('Gagal memulai server:', error);
        process.exit(1);
    });
}).catch(error => {
    console.error('Gagal terhubung ke MongoDB, server tidak dapat dijalankan:', error);
    process.exit(1);
});
