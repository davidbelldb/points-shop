import { listActiveProducts, getProductById } from './products.repo.js';
import { getAudience } from '../auth/auth.helpers.js';

export default async function productsRoutes(fastify) {
  // Everyone sees their own audience's products plus anything marked 'both'.
  fastify.get('/api/products', async (req) => {
    return listActiveProducts(getAudience(req));
  });

  fastify.get('/api/products/:id', async (req, reply) => {
    const product = await getProductById(req.params.id, getAudience(req));
    if (!product) {
      return reply.code(404).send({ error: 'Product not found' });
    }
    return product;
  });
}
