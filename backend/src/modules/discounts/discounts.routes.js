import {
  listDiscountCodes,
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
} from './discounts.repo.js';

export default async function discountsRoutes(fastify) {
  fastify.get('/api/admin/discount-codes', async () => listDiscountCodes());

  fastify.post('/api/admin/discount-codes', async (req, reply) => {
    const b = req.body ?? {};
    if (!b.code || !b.discount_type || !Number.isInteger(b.discount_value)) {
      return reply.code(400).send({ error: 'code, discount_type, discount_value required' });
    }
    if (!['percent', 'fixed'].includes(b.discount_type)) {
      return reply.code(400).send({ error: 'discount_type must be percent or fixed' });
    }
    if (b.discount_value <= 0) {
      return reply.code(400).send({ error: 'discount_value must be positive' });
    }
    if (b.discount_type === 'percent' && b.discount_value > 100) {
      return reply.code(400).send({ error: 'percent cannot exceed 100' });
    }
    try {
      return reply.code(201).send(await createDiscountCode(b));
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Code already exists' });
      throw err;
    }
  });

  fastify.patch('/api/admin/discount-codes/:id', async (req, reply) => {
    const updated = await updateDiscountCode(req.params.id, req.body ?? {});
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  fastify.delete('/api/admin/discount-codes/:id', async (req) => {
    await deleteDiscountCode(req.params.id);
    return { deleted: true };
  });
}
