# Gunakan image Node.js versi LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy semua file aplikasi
COPY . .

# Expose port yang digunakan
EXPOSE 3030

# Command untuk menjalankan aplikasi
CMD ["npm", "start"]
