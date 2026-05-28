FROM node:22-alpine
WORKDIR /app

# ffmpeg powers the server-side video transcode that normalises iPhone HEVC
# (and other oddball codecs) into H.264+AAC MP4 so every browser can play
# uploaded story videos. Adds ~70MB to the image.
RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/index.js"]
