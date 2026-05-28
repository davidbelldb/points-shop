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
    return { url: `/media/${filename}`, type, mimetype: data.mimetype };
  });
}
