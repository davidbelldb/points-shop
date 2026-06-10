FROM node:22-alpine
WORKDIR /app

# ffmpeg powers the server-side video transcode that normalises iPhone HEVC
# (and other oddball codecs) into H.264+AAC MP4 so every browser can play
# uploaded story videos. Adds ~70MB to the image.
# Retried up to 3x — Alpine's CDN occasionally throws transient DNS errors
# mid-fetch, which otherwise kills the whole build.
RUN for i in 1 2 3; do apk add --no-cache ffmpeg && break || { echo "apk attempt $i failed, retrying..."; sleep 5; }; done && ffmpeg -version >/dev/null

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/index.js"]
