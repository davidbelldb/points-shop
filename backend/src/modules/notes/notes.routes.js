import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { findOtherUser } from '../chat/chat.repo.js';
import { sendPush } from '../notifications/push.js';
import { query } from '../../db.js';
import {
  listNotes,
  createNote,
  updateNote,
  changeNoteType,
  archiveNote,
  softDeleteNote,
  restoreNote,
  hardDeleteNote,
} from './notes.repo.js';

/** Fetch the display name for an account (fire-and-forget safe). */
async function getSenderName(accountId) {
  try {
    const { rows } = await query(`SELECT name FROM accounts WHERE id = $1`, [accountId]);
    return rows[0]?.name ?? 'Someone';
  } catch { return 'Someone'; }
}

/**
 * Notify the other user about a note event.
 * action: 'added' | 'updated'
 */
async function notifyPartner(actorId, action) {
  try {
    const [other, name] = await Promise.all([findOtherUser(actorId), getSenderName(actorId)]);
    if (!other) return;
    await sendPush(other.id, {
      title: `${name} just ${action} a sneaky note`,
      body: 'Best go take a look, ey?',
      url: '/notes',
      tag: 'sneaky-note',
    });
  } catch { /* never let notification errors bubble up */ }
}

export default async function notesRoutes(fastify) {
  // GET /api/notes?status=active|archived|deleted
  fastify.get('/api/notes', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const status = ['active', 'archived', 'deleted'].includes(req.query.status)
      ? req.query.status
      : 'active';
    return listNotes(accountId, status);
  });

  // POST /api/notes  { type?: 'personal'|'shared' }
  fastify.post('/api/notes', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const type = req.body?.type === 'shared' ? 'shared' : 'personal';
    const note = await createNote(accountId, type);
    if (type === 'shared') notifyPartner(accountId, 'added'); // fire-and-forget
    return reply.code(201).send(note);
  });

  // PATCH /api/notes/:id  { body: string }
  fastify.patch('/api/notes/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const { body } = req.body ?? {};
    if (typeof body !== 'string') return reply.code(400).send({ error: 'body (string) required' });
    try {
      const note = await updateNote(req.params.id, accountId, body);
      return note;
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // PATCH /api/notes/:id/type  { type: 'personal'|'shared' }
  fastify.patch('/api/notes/:id/type', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const type = req.body?.type;
    if (type !== 'personal' && type !== 'shared') return reply.code(400).send({ error: 'type must be personal or shared' });
    try {
      const note = await changeNoteType(req.params.id, accountId, type);
      if (type === 'shared') notifyPartner(accountId, 'shared'); // fire-and-forget
      return note;
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // PATCH /api/notes/:id/archive
  fastify.patch('/api/notes/:id/archive', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    try {
      return await archiveNote(req.params.id, accountId);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // PATCH /api/notes/:id/restore
  fastify.patch('/api/notes/:id/restore', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    try {
      return await restoreNote(req.params.id, accountId);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // DELETE /api/notes/:id  →  soft-delete (moves to trash)
  fastify.delete('/api/notes/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    try {
      await softDeleteNote(req.params.id, accountId);
      return { ok: true };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // DELETE /api/notes/:id/permanent  →  hard-delete (only from trash)
  fastify.delete('/api/notes/:id/permanent', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    try {
      await hardDeleteNote(req.params.id, accountId);
      return { ok: true };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });
}
