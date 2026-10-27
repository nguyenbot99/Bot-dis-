# Dockerfile cho ZiPlayer Music Bot trên Render
FROM node:20-slim

# Cài ffmpeg (bắt buộc cho @discordjs/voice phát âm thanh trong voice channel)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    espeak-ng \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy file định nghĩa dependencies trước để tận dụng layer cache
COPY package.json package-lock.json* ./

RUN npm install --omit=dev

# Copy source code
COPY index.js ./
COPY src ./src
COPY .env.example ./

# Render cung cấp PORT qua biến môi trường
ENV PORT=3000

CMD ["npm", "start"]
