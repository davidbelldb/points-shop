import { listActiveSlides, listAllSlides, createSlide, updateSlide, deleteSlide } from './hero.repo.js';

export default async function heroRoutes(fastify) {
  fastify.get('/api/hero-slides', async (req) => {
    const placement = (req.query?.placement || 'top').toString();
    return listActiveSlides(placement);
  });

  fastify.get('/api/admin/hero-slides', async () => listAllSlides());

  fastify.post('/api/admin/hero-slides', async (req, reply) => {
    const b = req.body ?? {};
    if (!b.image_url) return reply.code(400).send({ error: 'image_url required' });
    return reply.code(201).send(await createSlide(b));
  });

  fastify.patch('/api/admin/hero-slides/:id', async (req, reply) => {
    const updated = await updateSlide(req.params.id, req.body ?? {});
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  fastify.delete('/api/admin/hero-slides/:id', async (req) => {
    await deleteSlide(req.params.id);
    return { deleted: true };
  });
}
