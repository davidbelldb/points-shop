import { execFile } from 'child_process';
import { promisify } from 'util';
import { unlink, rename, stat, access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

/* Extract a single JPEG frame ~1s into the video as a poster image. Used
   so the story circles on the home strip can show a still without having
   to load + decode the whole video. Returns { filename, filepath } of the
   saved JPEG, or null on failure. */
export async function extractVideoThumbnail(videoPath) {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const outPath = path.join(dir, `${base}.thumb.jpg`);
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-ss', '00:00:01',          // skip the first frame which is often blank
        '-i', videoPath,
        '-frames:v', '1',
        '-vf', "scale='min(720,iw)':-2",
        '-q:v', '4',                // good-quality JPEG
        '-y', outPath,
      ],
      { timeout: 60_000 },
    );
    // Some short clips don't have a frame at 1s — retry from 0s.
    try { await access(outPath, fsConstants.F_OK); }
    catch {
      await execFileAsync(
        'ffmpeg',
        ['-i', videoPath, '-frames:v', '1', '-vf', "scale='min(720,iw)':-2", '-q:v', '4', '-y', outPath],
        { timeout: 60_000 },
      );
    }
    return { filename: path.basename(outPath), filepath: outPath };
  } catch {
    await unlink(outPath).catch(() => {});
    return null;
  }
}

/* Server-side video normalisation.
   --------------------------------
   Every uploaded video gets re-encoded into H.264 video + AAC audio in an
   MP4 container with `+faststart`, so it plays in every modern browser
   regardless of what the phone produced (iPhone HEVC .mov, Android
   container quirks, etc). We also cap the longest side at 1920px and use
   CRF 23, which usually shrinks a 4K iPhone clip 5-10x without a
   perceptible quality loss.

   The function REPLACES the original file with the transcoded MP4 so we
   don't accumulate disk space holding both copies. The returned `filename`
   is what the caller should use to build the public `/media/<filename>`
   URL (the extension is always `.mp4` after a successful transcode).

   Failure mode: if ffmpeg errors out (corrupt source, unsupported codec,
   etc.) the original file is left in place and `transcoded: false` is
   returned. Better some users see a broken video than the upload fails
   outright. */

const TRANSCODE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — long story clips on a small VPS

export async function transcodeVideoIfNeeded(filepath, type) {
  if (type !== 'video') return { filepath, filename: path.basename(filepath), transcoded: false };

  const dir = path.dirname(filepath);
  const base = path.basename(filepath, path.extname(filepath));
  const outPath = path.join(dir, `${base}.mp4`);
  const intermediatePath = path.join(dir, `${base}.transcoding.mp4`);

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-i', filepath,
        // Video
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',          // broadest playback compatibility
        // Audio (stories from camera roll have audio; voice notes don't go through here)
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        // Cap longest side at 1920 while keeping aspect ratio + even dimensions.
        // Works for portrait, landscape, square.
        '-vf', "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))'",
        // Move moov atom to the front so the file streams from byte 0.
        '-movflags', '+faststart',
        '-y', intermediatePath,
      ],
      { timeout: TRANSCODE_TIMEOUT_MS, maxBuffer: 100 * 1024 * 1024 },
    );

    // Swap the transcoded file into place. If the input was the same .mp4
    // name as the output we need to overwrite; rename handles both cases.
    if (filepath !== outPath) {
      await unlink(filepath).catch(() => {});
    }
    await rename(intermediatePath, outPath);

    const after = await stat(outPath);
    return {
      filepath: outPath,
      filename: path.basename(outPath),
      transcoded: true,
      bytes: after.size,
    };
  } catch (err) {
    // Leave the original alone, mop up the partial output.
    await unlink(intermediatePath).catch(() => {});
    return {
      filepath,
      filename: path.basename(filepath),
      transcoded: false,
      error: err.message,
    };
  }
}
