import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import {
  listNotes,
  createNote,
  updateNote,
  archiveNote,
  softDeleteNote,
  restoreNote,
  hardDeleteNote,
} from './notes.repo.js';

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
    return reply.code(201).send(note);
  });

  // PATCH /api/notes/:id  { body: string }
  fastify.patch('/api/notes/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const { body } = req.body ?? {};
    if (typeof body !== 'string') return reply.code(400).send({ error: 'body (string) required' });
    try {
      return await updateNote(req.params.id, accountId, body);
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
