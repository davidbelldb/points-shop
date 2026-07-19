/* Tiny inline loading spinner for async buttons (send, checkout, post…).
   Inherits the current text color via `currentColor`, so it sits naturally
   inside a button next to or in place of its label. Honours reduced motion
   through the global CSS block in index.css (animation is neutralised there). */
export default function Spinner({ size = 16, className = '', strokeWidth = 2.4 }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={strokeWidth} strokeOpacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
