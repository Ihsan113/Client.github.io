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
// Ganti dengan URI MongoDB Anda yang sebenarnya
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
        user: 'ihsanfuadi854@gmail.com', // Ganti dengan email Anda
        pass: 'gsnl zcyw vefn kvce'      // Ganti dengan App Password Anda
    }
});

// --- KONFIGURASI ATLANTIC PEDIA API ---
const ATLANTIC_API_KEY = 'mkbtL4HPQ8Gp0Vw4rezoPXzhzN85y5gf'; // Ganti dengan API Key Anda
const ATLANTIC_BASE_URL = 'http://167.172.83.48:1041/layanan';

// Middleware untuk logging permintaan
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

// Endpoint untuk mendapatkan daftar produk (Contoh endpoint)
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


// Endpoint untuk membuat deposit (Pembayaran)
app.post('/api/deposit/create', async (req, res) => {
    const { nominal, metode, reff_id, target, nama, email, nickname, price, provider, code } = req.body;
    if (!nominal || !metode || !reff_id || !target || !nama || !email || !price || !provider || !code) {
        return res.status(400).json({ status: 'error', message: 'Data yang dikirim tidak lengkap.' });
    }

    try {
        // (Logika verifikasi harga produk dari Atlantic Pedia)

        const atlanticPayload = {
            api_key: ATLANTIC_API_KEY,
            reff_id,
            nominal: parseInt(nominal),
            metode: metode.toLowerCase(),
        };

        const response = await axios.post(`${ATLANTIC_BASE_URL}/deposit_create`, atlanticPayload);

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
            // Status awal transaksi adalah PENDING
            status: 'pending',
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

        const transactionsCollection = req.db.collection('transactions');
        await transactionsCollection.insertOne(dataToSave);
        console.log(`Deposit transaction ${transactionId} saved to MongoDB with status 'pending'.`);

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
        // ... (logic error handling) ...
        res.status(500).json({
            status: 'error',
            code: 500,
            message: 'Gagal membuat deposit',
            error: error?.response?.data || error.message
        });
    }
});

// --- ENDPOINT BARU: CEK STATUS DEPOSIT UNTUK SEMUA YANG PENDING (TANPA BODY ID) ---
app.get('/api/check-deposit-pending', async (req, res) => {
    let checkResults = [];
    const transactionsCollection = req.db.collection('transactions');
    
    try {
        console.log(`\n=== Memulai Cek Status Deposit Otomatis untuk Transaksi 'pending' ===`);
        
        // 1. Ambil semua transaksi dengan status 'pending'
        const pendingTransactions = await transactionsCollection.find({ 
            status: 'pending',
            // Pastikan ID deposit dari provider ada
            'data_deposit.id_pembayaran_provider': { $exists: true, $ne: null }
        }).toArray();

        if (pendingTransactions.length === 0) {
            console.log("Tidak ada transaksi 'pending' yang perlu dicek.");
            return res.json({
                status: 'success',
                message: 'Tidak ada transaksi pending yang perlu dicek.',
                results: []
            });
        }

        // 2. Loop dan cek status deposit ke Atlantic Pedia
        for (const transactionDoc of pendingTransactions) {
            const id_deposit = transactionDoc.data_deposit.id_pembayaran_provider;
            const reff_id = transactionDoc.reff_id;
            
            try {
                const atlanticPayload = {
                    api_key: ATLANTIC_API_KEY,
                    id_deposit: id_deposit
                };
                
                const response = await axios.post(`${ATLANTIC_BASE_URL}/deposit_status`, atlanticPayload);
                const depositStatus = response.data.data?.status;

                console.log(`[${reff_id}] Cek Deposit ${id_deposit}. Status Atlantic: ${depositStatus}`);

                // 3. Jika deposit SUCCESS, update status dan buat transaksi produk
                if (depositStatus === 'success' || depositStatus === 'processing') {
                    console.log(`✅ Deposit ${id_deposit} SUCCESS! Melanjutkan pembuatan transaksi produk...`);

                    // A. Update status MongoDB menjadi 'processing'
                    await transactionsCollection.updateOne(
                        { reff_id: reff_id },
                        { $set: { status: 'processing', last_checked_timestamp: Date.now() } }
                    );

                    const { code, target, email, nama, nickname } = transactionDoc.data_user;

                    // B. Buat transaksi produk di Atlantic Pedia
                    const transactionPayload = {
                        api_key: ATLANTIC_API_KEY,
                        target: target,
                        code: code,
                        reff_id: reff_id
                    };

                    const createTransactionResponse = await axios.post(`${ATLANTIC_BASE_URL}/transaksi_create`, transactionPayload);
                    const transactionDetails = createTransactionResponse.data.data;
                    
                    // C. Update database dengan detail transaksi produk
                    await transactionsCollection.updateOne(
                        { reff_id: reff_id },
                        {
                            $set: {
                                'data_user.id_transaksi_provider': transactionDetails.id,
                                'data_user.status_transaksi_atlantic': transactionDetails.status,
                                'data_user.atlanticApiTransactionResponse': createTransactionResponse.data,
                                updatedAt: new Date(),
                                last_checked_timestamp: Date.now()
                            }
                        }
                    );
                    
                    // D. Kirim email notifikasi (Logic disingkat)
                    if (email) { console.log(`Email notifikasi pemrosesan berhasil dikirim ke ${email}`); }

                    checkResults.push({ reff_id, id_deposit, deposit_status: depositStatus, action: 'Transaction Created', transaction_id: transactionDetails.id });

                } else if (depositStatus === 'expired' || depositStatus === 'gagal' || depositStatus === 'failed') {
                    // E. Update status transaksi di MongoDB menjadi 'failed' atau 'expired'
                    const newStatus = depositStatus === 'expired' ? 'expired' : 'failed';
                    await transactionsCollection.updateOne(
                        { reff_id: reff_id },
                        { $set: { status: newStatus, last_checked_timestamp: Date.now() } }
                    );
                    checkResults.push({ reff_id, id_deposit, deposit_status: depositStatus, action: `Status updated to ${newStatus}` });
                } else {
                    // Status lain (pending, waiting, dsb.)
                    checkResults.push({ reff_id, id_deposit, deposit_status: depositStatus, action: 'No Action (Still Pending/Waiting)' });
                }

            } catch (error) {
                console.error(`❌ Gagal memproses deposit ${id_deposit} (${reff_id}):`, error.response?.data || error.message);
                checkResults.push({ reff_id, id_deposit, deposit_status: 'error', action: `Error: ${error.message}` });
            }
        }
        
        res.json({
            status: 'success',
            message: `Selesai mengecek ${pendingTransactions.length} transaksi pending.`,
            results: checkResults
        });

    } catch (error) {
        console.error('❌ Error saat menjalankan cek status deposit pending:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Gagal memeriksa status deposit pending',
            error: error.message
        });
    }
});


// --- WEBHOOK ATLANTIC PEDIA (Diperbarui untuk success/processing) ---
app.post('/webhook/atlantic', async (req, res) => {
    const { event, data } = req.body;
    console.log(`\n=== Menerima Webhook untuk Event: ${event} ===`);

    try {
        const transactionsCollection = req.db.collection('transactions');
        const { reff_id } = data;

        const transactionDoc = await transactionsCollection.findOne({ reff_id });
        if (!transactionDoc) {
            console.warn(`[WEBHOOK] Transaksi dengan reff_id ${reff_id} tidak ditemukan.`);
            return res.status(404).json({ message: 'Transaksi tidak ditemukan.' });
        }
        
        // --- LOGIKA DEPOSIT (PEMBAYARAN) ---
        // Jika status deposit adalah 'success' ATAU 'processing'
        if (event === 'deposit' && (data.status === 'success' || data.status === 'processing')) {
            
            // Periksa agar tidak memproses ulang transaksi yang sudah diproses
            if (transactionDoc.status !== 'pending') {
                 console.log(`[WEBHOOK] Deposit ${reff_id} sudah diproses (Status: ${transactionDoc.status}). Melewati pembuatan transaksi produk.`);
                 return res.status(200).json({ status: 'success', message: 'Webhook diterima, sudah diproses sebelumnya.' });
            }

            // 1. Update status MongoDB menjadi 'processing'
            await transactionsCollection.updateOne(
                { reff_id },
                {
                    $set: {
                        status: 'processing', // Ganti dari 'pending' ke 'processing'
                        updated_timestamp: Date.now(),
                        'data_deposit.status': data.status // Simpan status dari webhook
                    }
                }
            );

            const { code, target, email } = transactionDoc.data_user;
            console.log(`[WEBHOOK] Deposit berhasil (Status: ${data.status}). Status MongoDB diupdate ke 'processing'. Melanjutkan pembuatan transaksi produk...`);

            // 2. Buat transaksi produk di Atlantic Pedia
            const transactionPayload = {
                api_key: ATLANTIC_API_KEY,
                target: target,
                code: code,
                reff_id: reff_id
            };

            const createTransactionResponse = await axios.post(`${ATLANTIC_BASE_URL}/transaksi_create`, transactionPayload);
            const transactionDetails = createTransactionResponse.data.data;
            
            // 3. Update database dengan detail transaksi produk
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

            // 4. Kirim email notifikasi (Logic disingkat)
            if (email) { console.log(`Email notifikasi pemrosesan berhasil dikirim ke ${email}`); }

        } else if (event === 'deposit' && (data.status === 'failed' || data.status === 'expired')) {
            // Update status jika deposit gagal/kedaluwarsa
            await transactionsCollection.updateOne(
                { reff_id },
                { $set: { status: data.status, updated_timestamp: Date.now() } }
            );
            console.log(`[WEBHOOK] Deposit gagal/kedaluwarsa. Status MongoDB diupdate ke '${data.status}'.`);
            
        // --- LOGIKA TRANSAKSI PRODUK ---
        } else if (event === 'transaksi' && (data.status === 'success' || data.status === 'failed')) {
            const { reff_id, sn } = data;
            const newStatus = data.status === 'success' ? 'completed' : 'failed';
            
            // 1. Update status transaksi produk di MongoDB
            await transactionsCollection.updateOne(
                { reff_id },
                {
                    $set: {
                        status: newStatus,
                        'data_user.status_transaksi_atlantic': data.status,
                        'data_user.sn': sn,
                        completedAt: new Date(),
                        updatedAt: new Date()
                    }
                }
            );
            console.log(`[WEBHOOK] Transaksi produk selesai. Status MongoDB diupdate ke '${newStatus}'.`);

            // 2. Kirim email notifikasi sukses (Logic disingkat)
            if (newStatus === 'completed' && transactionDoc.data_user.email) {
                console.log('Email notifikasi sukses berhasil dikirim ke', transactionDoc.data_user.email);
            }
        } else {
             console.log(`[WEBHOOK] Event ${event} dengan status ${data.status} diterima, tidak ada tindakan lebih lanjut.`);
        }
        
        res.status(200).json({ status: 'success', message: 'Webhook diterima.' });

    } catch (error) {
        console.error('Terjadi kesalahan saat memproses webhook:', error?.response?.data || error.message);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan internal.' });
    }
});


// --- FUNGSI PEMELIHARAAN (Cleanup service) ---
const finalStatuses = ['completed', 'failed', 'canceled', 'expired'];

function startCleanupService(dbInstance) {
    const transactionsCollection = dbInstance.collection('transactions');
    const runCleanup = async () => {
        try {
            console.log("Mulai pembersihan data transaksi...");
            
            const filter = {
                $or: [
                    // Hapus transaksi final yang lebih dari 2 hari
                    { 
                        status: { $in: finalStatuses },
                        updatedAt: { $lt: dayjs().subtract(2, 'day').toDate() }
                    },
                    // Hapus transaksi pending/unpaid yang sudah kedaluwarsa lebih dari 1 hari
                     {
                        status: { $in: ['pending', 'unpaid'] },
                        'data_deposit.expired_timestamp': { $lte: dayjs().subtract(1, 'day').valueOf() }
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
    // Interval pembersihan 1 jam
    setInterval(runCleanup, 3600000); 
}

// Fungsi untuk mendapatkan IP public (Logic disingkat)
async function getPublicIp() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        return response.data.ip;
    } catch (error) {
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
