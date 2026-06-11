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
import { transcodeVideoIfNeeded, extractVideoThumbnail } from './transcode.js';

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
    if (type === 'video') {
      const thumb = await extractVideoThumbnail(out.filepath);
      if (thumb) thumbnail_url = `/media/${thumb.filename}`;
    } else if (type === 'image' && !['.gif', '.svg'].includes(ext.toLowerCase())) {
      // Small webp thumbnail for images — list views render 40-80px thumbs,
      // so shipping the full screenshot is ~95% wasted bytes. Soft-fails:
      // uploads still succeed without a thumbnail.
      try {
        const { default: sharp } = await import('sharp');
        const thumbName = `${id}_thumb.webp`;
        await sharp(out.filepath ?? filepath)
          .rotate() // respect EXIF orientation
          .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78 })
          .toFile(path.join(MEDIA_DIR, thumbName));
        thumbnail_url = `/media/${thumbName}`;
      } catch (err) {
        req.log?.warn({ err }, 'image thumbnail failed');
      }
    }
    return { url: `/media/${out.filename}`, type, mimetype: data.mimetype, thumbnail_url };
  });
}
