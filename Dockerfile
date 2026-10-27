# Dockerfile cho ZiPlayer Music Bot trên Render
FROM node:20-slim

# Cài hệ thống cần thiết:
# - ffmpeg: decode âm thanh cho @discordjs/voice
# - espeak-ng: nguồn TTS thật cho lệnh /tts
# - build-essential, python3, make, g++: biên dịch native module @discordjs/opus
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    espeak-ng \
    ca-certificates \
    build-essential \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy file định nghĩa dependencies trước để tận dụng layer cache
COPY package.json ./

RUN npm install --omit=dev

# Copy source code
COPY index.js ./
COPY src ./src
COPY .env.example ./

# Render cung cấp PORT qua biến môi trường
ENV PORT=3000

CMD ["npm", "start"]
