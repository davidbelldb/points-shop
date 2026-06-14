/**
 * Central route registry — every API route module the app exposes, in one
 * place, in registration order.
 *
 * index.js stays focused on server bootstrap (Fastify instance, CORS/cookie/
 * multipart/static setup, the auth hook, background jobs, and process
 * lifecycle). This file is purely "what endpoints exist."
 *
 * To add a new route module: write it as a normal Fastify plugin under
 * modules/<name>/, import it below, and add one `await fastify.register(...)`
 * line in registerAppRoutes(). That's the entire integration step — no other
 * file needs to change.
 */
import productsRoutes from './products/products.routes.js';
import accountsRoutes from './accounts/accounts.routes.js';
import basketRoutes from './basket/basket.routes.js';
import ordersRoutes from './orders/orders.routes.js';
import adminRoutes from './admin/admin.routes.js';
import settingsRoutes from './settings/settings.routes.js';
import discountsRoutes from './discounts/discounts.routes.js';
import deliveryRoutes from './delivery/delivery.routes.js';
import heroRoutes from './hero/hero.routes.js';
import reviewsRoutes from './reviews/reviews.routes.js';
import notificationsRoutes from './notifications/notifications.routes.js';
import surveysRoutes from './surveys/surveys.routes.js';
import authRoutes from './auth/auth.routes.js';
import chatRoutes from './chat/chat.routes.js';
import todRoutes from './tod/tod.routes.js';
import gamesRoutes from './games/games.routes.js';
import giftsweeperRoutes from './games/giftsweeper.routes.js';
import rewardsRoutes from './rewards/rewards.routes.js';
import wheelRoutes from './wheel/wheel.routes.js';
import stb15Routes from './games/stb15.routes.js';
import duckyRoutes from './games/ducky.routes.js';
import cambsRageRoutes from './games/cambs-rage.routes.js';
import dirtyWordleRoutes from './games/dirty-wordle.routes.js';
import { rtcRoutes } from './games/rtc.routes.js';
import rewatchRoutes from './rewatch/rewatch.routes.js';
import audioRoutes from './audio/audio.routes.js';
import calendarRoutes from './calendar/calendar.routes.js';
import storiesRoutes from './stories/stories.routes.js';
import lastfmRoutes from './stories/lastfm.routes.js';
import mediaRoutes from './media/media.routes.js';
import notesRoutes from './notes/notes.routes.js';
import { momentsRoutes } from './moments/moments.routes.js';
import callsRoutes from './calls/calls.routes.js';
import spreadsheetsRoutes from './spreadsheets/spreadsheets.routes.js';
import shoppingRoutes from './shopping/shopping.routes.js';
import bootstrapRoutes from './bootstrap/bootstrap.routes.js';
import playlistRoutes from './playlist/playlist.routes.js';
import sneakyButtonRoutes from './sneaky-button/sneaky-button.routes.js';
import timelineRoutes from './timeline/timeline.routes.js';
import storageRoutes from './storage/storage.routes.js';
import readsRoutes from './reads/reads.routes.js';

export async function registerAppRoutes(fastify) {
  await fastify.register(productsRoutes);
  await fastify.register(accountsRoutes);
  await fastify.register(basketRoutes);
  await fastify.register(ordersRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(settingsRoutes);
  await fastify.register(discountsRoutes);
  await fastify.register(deliveryRoutes);
  await fastify.register(heroRoutes);
  await fastify.register(reviewsRoutes);
  await fastify.register(notificationsRoutes);
  await fastify.register(surveysRoutes);
  await fastify.register(authRoutes);
  await fastify.register(chatRoutes);
  await fastify.register(todRoutes);
  await fastify.register(gamesRoutes);
  await fastify.register(giftsweeperRoutes);
  await fastify.register(rewardsRoutes);
  await fastify.register(wheelRoutes);
  await fastify.register(stb15Routes);
  await fastify.register(duckyRoutes);
  await fastify.register(cambsRageRoutes);
  await fastify.register(dirtyWordleRoutes);
  await fastify.register(rtcRoutes);
  await fastify.register(rewatchRoutes);
  await fastify.register(audioRoutes);
  await fastify.register(calendarRoutes);
  await fastify.register(storiesRoutes);
  await fastify.register(lastfmRoutes);
  await fastify.register(mediaRoutes);
  await fastify.register(notesRoutes);
  await fastify.register(momentsRoutes);
  await fastify.register(callsRoutes);
  await fastify.register(spreadsheetsRoutes);
  await fastify.register(shoppingRoutes);
  await fastify.register(bootstrapRoutes);
  await fastify.register(playlistRoutes);
  await fastify.register(sneakyButtonRoutes);
  await fastify.register(timelineRoutes);
  await fastify.register(storageRoutes);
  await fastify.register(readsRoutes);
}
