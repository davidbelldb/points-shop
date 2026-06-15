# Sneakyscapes sprites

Drop sprite images in here and they're picked up automatically on the next build
(Vite scans this folder — no code or manifest to edit). PNG (transparent) is
ideal; `.webp` / `.jpg` also work.

## Layout — one folder per thing

```
base/                  the ground tile drawn under everything
  default.png          REQUIRED for a ground texture (else cells stay flat colour)
  winter.png  snow.png optional scene variants

<itemKey>/             one folder per catalog item (key, not display name)
  default.png          fallback sprite for the item
  <state>.png          state-specific art (see below)
```

Current item keys: `grass`, `soil`, `gravel`, `hydrangea`, `bench`, `shed`,
`trampoline`. (The key — not the label — is the folder name.)

## State file names

A file name is one or more **state tokens**. Single token, or a combination
joined by `-`. The game picks the most specific match it can find, then falls
back step by step to `default`, then to the flat colour block.

Tokens the resolver understands right now:

- **Season:** `spring` `summer` `autumn` `winter`
- **Weather:** `rain` `snow`  (clear weather uses no token)
- **Time:** `night`  (day uses no token)
- **Growth (per item):** `bare` `bloom` `sprout` … (whatever you name)
- **Watering (per item):** `dry`
- **Device (per item):** `on` `off`

Resolver priority when combining: growth → device → watering → weather → season → night.

### Examples

```
shed/default.png            always-on fallback
shed/night.png              shown at night
shed/winter.png             shown in winter
shed/winter-snow.png        shown in winter when it's snowing (beats winter.png)
hydrangea/bloom.png         summer/healthy
hydrangea/bare.png          winter/dormant
trampoline/snow.png         snow-covered
soil/dry.png                needs watering
base/default.png            ground tile
```

You never have to make every combination — only the art you want. Anything
missing degrades to the next-best file, so it's safe to add states incrementally.

> Multi-tile sprites (e.g. the shed) should be drawn for the item's full
> footprint; they're stretched across the item's tiles. Rotation/precise tile
> mapping gets refined in the PixiJS renderer pass.
