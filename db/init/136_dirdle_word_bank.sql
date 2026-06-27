-- Dirty Wordle Word Bank
-- Tracks which words are available (used_on IS NULL) vs already used this cycle.
-- Word selection is done atomically in the DB via FOR UPDATE SKIP LOCKED,
-- preventing the race condition where two concurrent requests pick the same word.

CREATE TABLE IF NOT EXISTS dirty_wordle_word_bank (
  word     TEXT PRIMARY KEY,
  used_on  DATE   -- NULL = available; set to the date it was assigned
);

-- Seed every word as available
INSERT INTO dirty_wordle_word_bank (word) VALUES
  ('FILTH'), ('SLUTS'), ('SLAGS'), ('WHORE'), ('WANKY'),
  ('BOOBS'), ('TITTY'), ('BUTTS'), ('WILLY'), ('BITCH'),
  ('STIFF'), ('COCKS'), ('PUSSY'), ('CUNTS'), ('TWATS'),
  ('NECKS'), ('PLUGS'), ('KATIE'), ('DAVID'), ('STUFF'),
  ('CREAM'), ('KNEES'), ('DOGGY'), ('BRACE'), ('SLAPS'),
  ('CHOKE'), ('HORNY'), ('DIRTY'), ('SPANK'), ('LUSTY'),
  ('KINKY'), ('NAKED'), ('BOOTY'), ('ERECT'), ('LOVER'),
  ('COCKY'), ('BALLS'), ('BONER'), ('PERVY'), ('RANDY'),
  ('JUICY'), ('NUDES'), ('PANTY'), ('THONG'), ('GROAN'),
  ('MOANS'), ('LICKS'), ('TEASE'), ('FLIRT'), ('STRIP'),
  ('NASTY'), ('NYMPH'), ('TABOO'), ('SHAFT'), ('GRIND'),
  ('STRAP'), ('TOUCH'), ('TWERK'), ('VULVA'), ('DICKS'),
  ('PRICK'), ('TAINT'), ('SPUNK'), ('SAUCY'), ('FLESH'),
  ('FANNY'), ('MOIST'), ('GROPE'), ('THROB'), ('PORNO'),
  ('CRUDE'), ('SEXTS'), ('TRYST'), ('DADDY'), ('THIGH'),
  ('VIXEN'), ('BAWDY'), ('STUDS'), ('WENCH'), ('TRAMP'),
  ('SMUTS'), ('LETCH'), ('KNOBS'), ('WANKS'), ('SHAGS'),
  ('BONKS'), ('HUMPS'), ('ROMPS'), ('LOINS'), ('GROIN'),
  ('BUSTY'), ('BUXOM'), ('TARTS'), ('HUSSY'), ('KINKS'),
  ('ARSES'), ('MILFS'), ('MUFFS'), ('BOUND'), ('ROUGH'),
  ('DILDO'), ('FUCKS'), ('SUCKS'), ('BLOWS')
ON CONFLICT DO NOTHING;

-- Mark any words already used in the schedule as unavailable
UPDATE dirty_wordle_word_bank b
SET used_on = s.date
FROM dirty_wordle_schedule s
WHERE b.word = s.word;
