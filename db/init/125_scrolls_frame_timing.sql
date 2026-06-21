-- Slow the crow animation: the seeded frames ran at 80ms each (~1s total), which
-- flicks through the sprites too fast. 180ms/frame gives a calmer flight
-- (~2.3s send, ~2.2s land). Fine-tune per-frame later in /admin (scrolls-config).
UPDATE scrolls_frames SET duration_ms = 180;
