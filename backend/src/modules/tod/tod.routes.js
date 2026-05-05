import {
  listAllPrompts, getRandomPrompt, createPrompt, updatePrompt, deletePrompt,
} from './tod.repo.js';

export default async function todRoutes(fastify) {
  fastify.get('/api/games/truth-or-dare/random', async (req, reply) => {
    const type = req.query.type;
    if (!['truth', 'dare'].includes(type)) {
      return reply.code(400).send({ error: 'type must be truth or dare' });
    }
    const prompt = await getRandomPrompt(type);
    if (!prompt) return reply.code(404).send({ error: `No ${type} prompts configured yet` });
    return prompt;
  });

  fastify.get('/api/admin/tod-prompts', async () => listAllPrompts());

  fastify.post('/api/admin/tod-prompts', async (req, reply) => {
    const { type, text } = req.body ?? {};
    if (!['truth', 'dare'].includes(type)) {
      return reply.code(400).send({ error: 'type must be truth or dare' });
    }
    if (typeof text !== 'string' || !text.trim()) {
      return reply.code(400).send({ error: 'text required' });
    }
    return reply.code(201).send(await createPrompt(type, text));
  });

  fastify.patch('/api/admin/tod-prompts/:id', async (req, reply) => {
    const updated = await updatePrompt(req.params.id, req.body ?? {});
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  fastify.delete('/api/admin/tod-prompts/:id', async (req) => {
    await deletePrompt(req.params.id);
    return { deleted: true };
  });
}
