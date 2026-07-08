import {
  listSlots, createSlot, updateSlot, deleteSlot, getSlotBySlug, listAuthorStories,
} from './nfc.repo.js';
import { getStory } from '../stories/stories.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

export default async function nfcRoutes(fastify) {
  /* ---- Admin slot management (gated by the global /api/admin/* admin hook) ---- */

  fastify.get('/api/admin/nfc/slots', async () => listSlots());

  fastify.post('/api/admin/nfc/slots', async (req, reply) => {
    const label = req.body?.label;
    return reply.code(201).send(await createSlot(label));
  });

  fastify.patch('/api/admin/nfc/slots/:id', async (req, reply) => {
    const slot = await updateSlot(req.params.id, req.body ?? {});
    if (!slot) return reply.code(404).send({ error: 'not found' });
    return slot;
  });

  fastify.delete('/api/admin/nfc/slots/:id', async (req) => deleteSlot(req.params.id));

  /* Author's stories for the assignment picker. */
  fastify.get('/api/admin/nfc/my-stories', async (req) => {
    const accountId = getEffectiveAccountId(req);
    return listAuthorStories(accountId);
  });

  /* ---- Public resolve (any logged-in person): the slug is the gate ----
     Returns whatever story the slot currently points at, ignoring expiry so
     the tag keeps working. 404 when the slot is unknown or unassigned. */
  fastify.get('/api/nfc/slots/:slug/story', async (req, reply) => {
    const slot = await getSlotBySlug(req.params.slug);
    if (!slot || !slot.story_id) return reply.code(404).send({ error: 'not found' });
    const accountId = getEffectiveAccountId(req);
    const story = await getStory(slot.story_id, accountId);
    if (!story) return reply.code(404).send({ error: 'not found' });
    return story;
  });
}
