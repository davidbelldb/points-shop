import { listActiveProducts, getProductById } from './products.repo.js';

export default async function productsRoutes(fastify) {
  fastify.get('/api/products', async () => {
    return listActiveProducts();
  });

  fastify.get('/api/products/:id', async (req, reply) => {
    const product = await getProductById(req.params.id);
    if (!product) {
      return reply.code(404).send({ error: 'Product not found' });
    }
    return product;
  });
}
