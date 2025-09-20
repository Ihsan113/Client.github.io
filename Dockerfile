# Gunakan image Node.js versi 22
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy semua file aplikasi
COPY . .

# Expose port yang digunakan (Back4App akan menggunakan PORT environment variable)
EXPOSE 1038

# Command untuk menjalankan aplikasi - pastikan package.json punya start script yang benar
CMD ["npm", "start"]