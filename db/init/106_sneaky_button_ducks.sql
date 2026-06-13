-- Add ducks (random-d.uk) as a Sneaky Button animal option alongside cats/dogs.
ALTER TABLE sneaky_button_config DROP CONSTRAINT IF EXISTS sneaky_button_config_animal_type_check;
ALTER TABLE sneaky_button_config ADD CONSTRAINT sneaky_button_config_animal_type_check
  CHECK (animal_type IN ('cat', 'dog', 'duck', 'random'));
