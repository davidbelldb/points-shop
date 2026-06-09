import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { listNotes, createNote, updateNote, deleteNote } from './notes.repo.js';

export default async function notesRoutes(fastify) {
  fastify.get('/api/notes', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    return listNotes(accountId);
  });

  fastify.post('/api/notes', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const note = await createNote(accountId);
    return reply.code(201).send(note);
  });

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

  fastify.delete('/api/notes/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    try {
      await deleteNote(req.params.id, accountId);
      return { ok: true };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });
}
