/* Simple emoji palette bottom-sheet for placing a large emoji sticker on the
   story canvas. When editing an existing emoji, a Remove action is offered. */
const EMOJIS = [
  '😀', '😂', '🥹', '😍', '😎', '🥳', '😭', '😡', '🤯', '🥶',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🔥', '✨', '⭐', '💯',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💖',
  '🎉', '🎂', '🍾', '🍻', '☕', '🍕', '🌮', '🍔', '🍩', '🍪',
  '⚽', '🏀', '🎮', '🎧', '🎸', '🚗', '✈️', '🏖️', '🌈', '☀️',
  '🐶', '🐱', '🐢', '🦄', '🐝', '🌸', '🌵', '👻', '💀', '🤡',
];

export default function EmojiStickerPicker({ onSelect, onClose, onRemove }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onClose} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">Pick an emoji</span>
          {onRemove ? (
            <button onClick={onRemove} className="text-sm font-semibold text-red-600">Remove</button>
          ) : (
            <span className="w-12" />
          )}
        </header>
        <div className="grid max-h-[60vh] grid-cols-6 gap-1 overflow-y-auto p-3 sm:grid-cols-8">
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => onSelect(em)}
              className="flex aspect-square items-center justify-center rounded-lg text-3xl transition hover:bg-neutral-100 active:scale-90"
            >
              {em}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
