import { listActiveDeliveryOptions } from './delivery.repo.js';

export default async function deliveryRoutes(fastify) {
  fastify.get('/api/delivery-options', async () => listActiveDeliveryOptions());
}
