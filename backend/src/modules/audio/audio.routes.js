import {
  listActiveAudioNotes, listAllAudioNotes, createAudioNote, updateAudioNote, deleteAudioNote,
} from './audio.repo.js';

export default async function audioRoutes(fastify) {
  fastify.get('/api/audio-notes', async () => listActiveAudioNotes());

  fastify.get('/api/admin/audio-notes', async () => listAllAudioNotes());

  fastify.post('/api/admin/audio-notes', async (req, reply) => {
    const b = req.body ?? {};
    if (!b.audio_url) return reply.code(400).send({ error: 'audio_url required' });
    return reply.code(201).send(await createAudioNote(b));
  });

  fastify.patch('/api/admin/audio-notes/:id', async (req, reply) => {
    const updated = await updateAudioNote(req.params.id, req.body ?? {});
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  fastify.delete('/api/admin/audio-notes/:id', async (req) => {
    await deleteAudioNote(req.params.id);
    return { deleted: true };
  });
}
