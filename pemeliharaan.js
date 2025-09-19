const { MongoClient } = require('mongodb');

// --- KONFIGURASI MONGODB ---
const uri = "mongodb+srv://Sanz:Gombong123@cluster0.elarb3c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

// Status yang dianggap final dan dapat dihapus
const finalStatuses = ['completed', 'failed', 'canceled', 'expired'];

async function cleanUpTransactions() {
  try {
    await client.connect();
    console.log("Berhasil terhubung ke MongoDB Atlas.");
    const db = client.db("DanzKuStore");
    const transactionsCollection = db.collection('transactions');

    // Buat filter untuk mencari transaksi dengan status final
    const filter = {
      $or: [
        { status: { $in: finalStatuses } },
        {
          status: 'pending',
          'data_deposit.expired_at': { $lte: new Date() }
        }
      ]
    };

    // Hapus dokumen yang cocok dengan filter
    const result = await transactionsCollection.deleteMany(filter);

    console.log(`\n✅ Berhasil menghapus ${result.deletedCount} transaksi dengan status final atau kedaluwarsa.`);
  } catch (err) {
    console.error("❌ Gagal melakukan pemeliharaan database:", err);
  } finally {
    // Pastikan koneksi ditutup di setiap akhir pembersihan
    await client.close();
    console.log("Koneksi MongoDB ditutup.");
  }
}

// Jalankan fungsi pembersihan setiap 10 detik
// setInterval(cleanUpTransactions, 10000);

// Catatan:
// Menjalankan koneksi dan pembersihan setiap 10 detik mungkin kurang efisien.
// Koneksi database cukup memakan sumber daya.
// Cara terbaik adalah menjaga koneksi tetap terbuka dan hanya menjalankan pembersihan.

async function startCleanupService() {
  try {
    await client.connect();
    console.log("Layanan pembersihan dimulai, koneksi ke MongoDB Atlas berhasil.");
    const db = client.db("DanzKuStore");
    const transactionsCollection = db.collection('transactions');

    const runCleanup = async () => {
      try {
        console.log("Mulai pembersihan data transaksi...");
        
        // Filter baru: hapus jika statusnya final ATAU statusnya pending dan sudah expired
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
        console.log(`✅ Berhasil menghapus ${result.deletedCount} transaksi dengan status final atau kedaluwarsa.`);
      } catch (err) {
        console.error("❌ Gagal menjalankan pembersihan:", err);
      }
    };

    // Jalankan pembersihan pertama kali
    runCleanup();

    // Jalankan pembersihan setiap 10 detik
    setInterval(runCleanup, 10000);

  } catch (err) {
    console.error("❌ Gagal terhubung ke database:", err);
  }
}

startCleanupService();