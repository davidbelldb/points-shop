import { placeOrder, getOrderById, listOrders, HttpError } from './orders.repo.js';
import { sendOrderConfirmation } from './emails.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

export default async function ordersRoutes(fastify) {
  fastify.post('/api/orders', async (req, reply) => {
    try {
      const order = await placeOrder(getEffectiveAccountId(req));
      sendOrderConfirmation(order).catch((err) =>
        fastify.log.error({ err }, 'Order confirmation email failed'),
      );
      return reply.code(201).send(order);
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/api/orders', async (req) => {
    const bucket = req.query?.bucket ?? 'all';
    const limit = Math.min(Number(req.query?.limit ?? 50), 200);
    return listOrders({ accountId: getEffectiveAccountId(req), bucket, limit });
  });

  fastify.get('/api/orders/:id', async (req, reply) => {
    const order = await getOrderById(req.params.id);
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    return order;
  });
}
