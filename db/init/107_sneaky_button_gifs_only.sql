-- Sneaky Button now only fetches gifs, and only of cats/ducks (dogs dropped).
UPDATE sneaky_button_config SET animal_type = 'cat' WHERE animal_type = 'dog';
ALTER TABLE sneaky_button_config DROP CONSTRAINT IF EXISTS sneaky_button_config_animal_type_check;
ALTER TABLE sneaky_button_config ADD CONSTRAINT sneaky_button_config_animal_type_check
  CHECK (animal_type IN ('cat', 'duck', 'random'));
