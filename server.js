const { spawn } = require('child_process');

console.log('Memulai server utama (index.js)...');
const mainServer = spawn('node', ['index.js'], {
  stdio: 'inherit'
});

console.log('Memulai skrip pemeliharaan (pemeliharaan.js)...');
const cleanupScript = spawn('node', ['pemeliharaan.js'], {
  stdio: 'inherit'
});

mainServer.on('close', (code) => {
  console.log(`Server utama keluar dengan kode: ${code}`);
});

cleanupScript.on('close', (code) => {
  console.log(`Skrip pemeliharaan keluar dengan kode: ${code}`);
});