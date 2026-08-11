FROM node:20-bullseye-slim

# Install Python 3, pip, FFmpeg, and certificates
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        ffmpeg \
        ca-certificates \
    && ln -s /usr/bin/python3 /usr/local/bin/python \
    && pip3 install --no-cache-dir yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install Node dependencies
RUN npm install --omit=dev

# Copy application files
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
