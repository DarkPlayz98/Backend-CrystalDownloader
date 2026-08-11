FROM node:20-bullseye-slim

# Added python-is-python3 to alias python3 as python
RUN apt-get update && apt-get install -y python3 python3-pip python-is-python3 ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
