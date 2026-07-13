/* Shared upload endpoint at /api/upload — same behaviour as /api/admin/upload
   but on a path that doesn't sit behind Caddy's admin basicauth, so the
   non-admin account (Katie) can post stories, change her profile photo, and
   so on. Saves files into the same MEDIA_DIR. */
import path from 'path';
import { mkdir, unlink } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import { config } from '../../config.js';
import { transcodeVideoIfNeeded, transcodeAudioIfNeeded, extractVideoThumbnail } from './transcode.js';
import { optimizeImage, generateImageThumbnail } from './image.js';

const MEDIA_DIR = config.mediaDir;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.qt', '.hevc']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.webm']);

// Permissive classifier — see admin.routes.js for rationale (HEVC .mov,
// missing mimetypes for audio, etc.).
function classifyMimetype(mimetype = '', filename = '') {
  const mt = (mimetype || '').toLowerCase();
  const ext = (filename ? path.extname(filename) : '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('audio/')) return 'audio';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return null;
}

export default async function mediaRoutes(fastify) {
  await mkdir(MEDIA_DIR, { recursive: true });

  fastify.post('/api/upload', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });
    const type = classifyMimetype(data.mimetype, data.filename);
    if (!type) {
      return reply.code(415).send({ error: `Unsupported type: ${data.mimetype || 'unknown'}` });
    }
    const ext = path.extname(data.filename) || '';
    const id = randomUUID();
    const filename = `${id}${ext}`;
    const filepath = path.join(MEDIA_DIR, filename);
    try {
      await pipeline(data.file, createWriteStream(filepath));
      if (data.file.truncated) {
        await unlink(filepath).catch(() => {});
        return reply.code(413).send({ error: 'File too large' });
      }
    } catch (err) {
      await unlink(filepath).catch(() => {});
      throw err;
    }
    // Normalise videos to H.264+AAC MP4 so every browser can play them.
    // Non-videos pass straight through. If transcode fails the original
    // file is kept and we return its URL so the upload still succeeds.
    const out = await transcodeVideoIfNeeded(filepath, type);
    if (out.transcoded) {
      req.log?.info({ from: filename, to: out.filename, bytes: out.bytes }, 'video transcoded');
    } else if (out.error) {
      req.log?.warn({ filename, err: out.error }, 'video transcode skipped');
    }
    // Generate a poster thumbnail for videos so the story circles can show
    // a still instead of trying to decode the whole video.
    let thumbnail_url = null;
    let mediaUrl = `/media/${out.filename}`;
    if (type === 'video') {
      const thumb = await extractVideoThumbnail(out.filepath);
      if (thumb) thumbnail_url = `/media/${thumb.filename}`;
    } else if (type === 'image') {
      // Re-encode to WebP capped at 1600px — phone photos are routinely
      // 3-4000px / multi-MB, and nothing here displays anywhere near that.
      // Soft-fails: keeps the original if sharp can't read it.
      const optimized = await optimizeImage(out.filepath, ext);
      if (optimized.optimized) {
        mediaUrl = `/media/${optimized.filename}`;
      } else if (optimized.error) {
        req.log?.warn({ filename, err: optimized.error }, 'image optimize skipped');
      }
      // Small webp thumbnail for list views (story rings etc.) — render
      // 40-80px thumbs, so shipping the full image is ~95% wasted bytes.
      // Skipped for gif/svg (animation / already tiny).
      if (!['.gif', '.svg'].includes(ext.toLowerCase())) {
        const thumbName = await generateImageThumbnail(optimized.filepath, id);
        if (thumbName) thumbnail_url = `/media/${thumbName}`;
        else req.log?.warn({ filename }, 'image thumbnail failed');
      }
    } else if (type === 'audio') {
      // Re-encode to AAC/.m4a so it plays in the iOS WKWebView (webm/opus won't).
      const a = await transcodeAudioIfNeeded(out.filepath, type);
      if (a.transcoded) mediaUrl = `/media/${a.filename}`;
      else if (a.error) req.log?.warn({ filename, err: a.error }, 'audio transcode skipped');
    }
    return { url: mediaUrl, type, mimetype: data.mimetype, thumbnail_url };
  });
}
