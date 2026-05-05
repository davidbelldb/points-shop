import {
  listReviewsForProduct, createReview, updateReview, deleteReview, addLike, removeLike,
} from './reviews.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

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
      return reply.code(201).send(await createReview(getEffectiveAccountId(req), req.params.productId, body));
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

  fastify.post('/api/reviews/:reviewId/likes', async (req) => {
    await addLike(req.params.reviewId, getEffectiveAccountId(req));
    return { ok: true };
  });

  fastify.delete('/api/reviews/:reviewId/likes', async (req) => {
    await removeLike(req.params.reviewId, getEffectiveAccountId(req));
    return { ok: true };
  });
}
