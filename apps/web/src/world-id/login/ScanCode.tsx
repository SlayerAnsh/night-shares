// A QR-like code drawn from the request payload (mock login.js): three finder squares,
// timing lines and seeded modules, with a clear center for the World ID mark.
// The mock World ID adapter has no real QR, so this is decoration only.
const size = 29;
const ink = "#16131F";

function seeded(text: string) {
  let state = 2166136261;
  for (const char of text)
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function modules(payload: string) {
  const random = seeded(payload);
  const isFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9);
  const isCenter = (x: number, y: number) =>
    Math.abs(x - 14) <= 3 && Math.abs(y - 14) <= 3;
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFinder(x, y) || isCenter(x, y)) continue;
      const isOn = y === 6 || x === 6 ? (x + y) % 2 === 0 : random() < 0.48;
      if (isOn) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return path;
}

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect
        x={x + 0.5}
        y={y + 0.5}
        width="6"
        height="6"
        rx="1.4"
        fill="none"
        stroke={ink}
      />
      <rect x={x + 2} y={y + 2} width="3" height="3" rx=".7" fill={ink} />
    </>
  );
}

export function ScanCode({ payload }: { payload: string }) {
  return (
    <svg
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      <path d={modules(payload)} fill={ink} />
      <Finder x={0} y={0} />
      <Finder x={size - 7} y={0} />
      <Finder x={0} y={size - 7} />
      <g
        shapeRendering="geometricPrecision"
        fill="none"
        stroke={ink}
        strokeWidth=".7"
      >
        <circle cx="14.5" cy="14.5" r="3.4" fill="#fff" stroke="none" />
        <circle cx="14.5" cy="14.5" r="2.6" />
        <path
          d="M11.9 14.5h2.7M14.6 14.5a1.25 1.25 0 0 1 1.25-1.25"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
