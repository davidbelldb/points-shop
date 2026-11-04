-- Refresh the Dirty Wordle word bank so only the 60 new words are served next.
-- Original 104 words are marked as used (they'll return when the cycle resets).

-- 1. Insert all 60 new words as available
INSERT INTO dirty_wordle_word_bank (word) VALUES
  ('BOOBY'), ('CLITS'), ('LABIA'), ('PUBES'), ('PERKY'),
  ('CURVY'), ('WHIPS'), ('MOUNT'), ('RIDES'), ('GONZO'),
  ('MILKY'), ('SPURT'), ('PROBE'), ('SNOGS'), ('THICK'),
  ('SILKY'), ('LATEX'), ('ROPES'), ('CUFFS'), ('FRISK'),
  ('OGLED'), ('LEERS'), ('BIMBO'), ('SKANK'), ('PEACH'),
  ('HIMBO'), ('LURES'), ('TEMPT'), ('VAMPS'), ('SHEER'),
  ('VINYL'), ('JIGGY'), ('QUIMS'), ('NUDIE'), ('TASTY'),
  ('PLUMP'), ('YUMMY'), ('DONGS'), ('WOODY'), ('CHUBS'),
  ('BUNNY'), ('PUMPS'), ('THUMP'), ('SWEAT'), ('FOXES'),
  ('FEMME'), ('BUTCH'), ('LUBED'), ('BENDY'), ('BUMPS'),
  ('BLISS'), ('SNAKE'), ('SWORD'), ('DOMME'), ('KNEEL'),
  ('LUBES'), ('BARES'), ('BOSSY'), ('SASSY'), ('SPICY')
ON CONFLICT DO NOTHING;

-- 2. Ensure all 60 new words are available (used_on = NULL)
UPDATE dirty_wordle_word_bank
SET used_on = NULL
WHERE word IN (
  'BOOBY','CLITS','LABIA','PUBES','PERKY',
  'CURVY','WHIPS','MOUNT','RIDES','GONZO',
  'MILKY','SPURT','PROBE','SNOGS','THICK',
  'SILKY','LATEX','ROPES','CUFFS','FRISK',
  'OGLED','LEERS','BIMBO','SKANK','PEACH',
  'HIMBO','LURES','TEMPT','VAMPS','SHEER',
  'VINYL','JIGGY','QUIMS','NUDIE','TASTY',
  'PLUMP','YUMMY','DONGS','WOODY','CHUBS',
  'BUNNY','PUMPS','THUMP','SWEAT','FOXES',
  'FEMME','BUTCH','LUBED','BENDY','BUMPS',
  'BLISS','SNAKE','SWORD','DOMME','KNEEL',
  'LUBES','BARES','BOSSY','SASSY','SPICY'
);

-- 3. Mark all original 104 words as used so they're skipped until next cycle
UPDATE dirty_wordle_word_bank
SET used_on = COALESCE(used_on, '2000-01-01')
WHERE word IN (
  'FILTH','SLUTS','SLAGS','WHORE','WANKY',
  'BOOBS','TITTY','BUTTS','WILLY','BITCH',
  'STIFF','COCKS','PUSSY','CUNTS','TWATS',
  'NECKS','PLUGS','KATIE','DAVID','STUFF',
  'CREAM','KNEES','DOGGY','BRACE','SLAPS',
  'CHOKE','HORNY','DIRTY','SPANK','LUSTY',
  'KINKY','NAKED','BOOTY','ERECT','LOVER',
  'COCKY','BALLS','BONER','PERVY','RANDY',
  'JUICY','NUDES','PANTY','THONG','GROAN',
  'MOANS','LICKS','TEASE','FLIRT','STRIP',
  'NASTY','NYMPH','TABOO','SHAFT','GRIND',
  'STRAP','TOUCH','TWERK','VULVA','DICKS',
  'PRICK','TAINT','SPUNK','SAUCY','FLESH',
  'FANNY','MOIST','GROPE','THROB','PORNO',
  'CRUDE','SEXTS','TRYST','DADDY','THIGH',
  'VIXEN','BAWDY','STUDS','WENCH','TRAMP',
  'SMUTS','LETCH','KNOBS','WANKS','SHAGS',
  'BONKS','HUMPS','ROMPS','LOINS','GROIN',
  'BUSTY','BUXOM','TARTS','HUSSY','KINKS',
  'ARSES','MILFS','MUFFS','BOUND','ROUGH',
  'DILDO','FUCKS','SUCKS','BLOWS'
);
