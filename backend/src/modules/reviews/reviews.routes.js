import { listReviewsForProduct, createReview, updateReview, deleteReview, adjustThumbsUp } from './reviews.repo.js';

export default async function reviewsRoutes(fastify) {
  fastify.get('/api/products/:productId/reviews', async (req) =>
    listReviewsForProduct(req.params.productId),
  );

  fastify.post('/api/products/:productId/reviews', async (req, reply) => {
    const { body } = req.body ?? {};
    if (typeof body !== 'string' || !body.trim()) {
      return reply.code(400).send({ error: 'body required' });
    }
    try {
      return reply.code(201).send(await createReview(req.params.productId, body));
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.patch('/api/reviews/:reviewId', async (req, reply) => {
    const { body } = req.body ?? {};
    if (typeof body !== 'string' || !body.trim()) {
      return reply.code(400).send({ error: 'body required' });
    }
    const updated = await updateReview(req.params.reviewId, body);
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  fastify.delete('/api/reviews/:reviewId', async (req) => {
    await deleteReview(req.params.reviewId);
    return { deleted: true };
  });

  fastify.post('/api/reviews/:reviewId/thumbs-up', async (req, reply) => {
    const result = await adjustThumbsUp(req.params.reviewId, 1);
    if (result === null) return reply.code(404).send({ error: 'Review not found' });
    return { thumbs_up_count: result };
  });

  fastify.delete('/api/reviews/:reviewId/thumbs-up', async (req, reply) => {
    const result = await adjustThumbsUp(req.params.reviewId, -1);
    if (result === null) return reply.code(404).send({ error: 'Review not found' });
    return { thumbs_up_count: result };
  });
}
