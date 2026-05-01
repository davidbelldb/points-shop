import {
  getBasket, addItem, setItemQty, removeItem,
  applyPromoCode, removePromoCode, setDeliveryOption,
} from './basket.repo.js';

export default async function basketRoutes(fastify) {
  fastify.get('/api/basket', async () => getBasket());

  fastify.post('/api/basket/items', async (req, reply) => {
    const { productId, qty = 1 } = req.body ?? {};
    if (!productId) return reply.code(400).send({ error: 'productId required' });
    if (!Number.isInteger(qty) || qty < 1) {
      return reply.code(400).send({ error: 'qty must be a positive integer' });
    }
    return addItem(productId, qty);
  });

  fastify.patch('/api/basket/items/:productId', async (req, reply) => {
    const { qty } = req.body ?? {};
    if (!Number.isInteger(qty) || qty < 0) {
      return reply.code(400).send({ error: 'qty must be a non-negative integer' });
    }
    return setItemQty(req.params.productId, qty);
  });

  fastify.delete('/api/basket/items/:productId', async (req) => removeItem(req.params.productId));

  fastify.post('/api/basket/promo', async (req, reply) => {
    const { code } = req.body ?? {};
    if (!code) return reply.code(400).send({ error: 'code required' });
    try { return await applyPromoCode(code); }
    catch (err) { return reply.code(err.statusCode ?? 500).send({ error: err.message }); }
  });

  fastify.delete('/api/basket/promo', async () => removePromoCode());

  fastify.patch('/api/basket/delivery', async (req, reply) => {
    const { delivery_option_id } = req.body ?? {};
    try { return await setDeliveryOption(delivery_option_id); }
    catch (err) { return reply.code(err.statusCode ?? 500).send({ error: err.message }); }
  });
}
