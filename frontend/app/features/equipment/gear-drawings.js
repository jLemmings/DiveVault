// Each piece is drawn hanging from 0,0 at the end of its line, with `height` for placing the words beside it.
const DRAWINGS = {
  regulator: { height: 46, d: "M0 0A23 23 0 1 1 0 46A23 23 0 1 1 0 0ZM0 14A9 9 0 1 0 0 32A9 9 0 1 0 0 14Z" },
  bcd: { height: 50, d: "M-20 4Q0-10 20 4L28 50H8V22H-8V50H-28Z" },
  computer: { height: 40, d: "M-14 0H14Q23 0 23 9V31Q23 40 14 40H-14Q-23 40-23 31V9Q-23 0-14 0ZM-13 10V28H13V10Z" },
  suit: { height: 58, d: "M-16 0H16L30 26 18 32 14 58H-14L-18 32-30 26Z" },
  torch: { height: 44, d: "M-16 0H16V14L10 20V44H-10V20L-16 14Z" },
  fins: { height: 50, d: "M-23 0L-5 50H-41ZM23 0L41 50H5Z" },
  tank: { height: 60, d: "M-5 0H5V8Q16 10 16 22V60H-16V22Q-16 10-5 8Z" },
  mask: { height: 34, d: "M-30 2H30V18Q30 34 14 34H8L0 24-8 34H-14Q-30 34-30 18Z" },
  weights: { height: 38, d: "M-30 8H30V24H-30ZM-18 0H-6V32H-18ZM6 0H18V32H6Z" },
  camera: { height: 42, d: "M-10 0H10L14 8H28V42H-28V8H-14ZM0 14A10 10 0 1 0 0 34A10 10 0 1 0 0 14Z" },
  other: { height: 42, d: "M-8 0H8V10H20V42H-20V10H-8Z" }
};

const KIND_BY_WORD = [
  ["regulator", /regulat|atemregler|détendeur/i],
  ["bcd", /bcd|\bbc\b|jacket|wing|tarier|gilet/i],
  ["computer", /computer|watch|uhr|ordinateur/i],
  ["suit", /suit|exposure|anzug|combinaison/i],
  ["torch", /torch|light|lamp|lampe/i],
  ["fins", /\bfins?\b|floss|palme/i],
  ["tank", /tank|cylinder|flasche|bouteille/i],
  ["mask", /mask|maske|masque/i],
  ["weights", /weight|blei|plomb/i],
  ["camera", /camera|kamera|photo|caméra/i]
];

const KIND_BY_ICON = {
  air: "regulator",
  backpack: "bcd",
  watch: "computer",
  waves: "suit",
  flashlight_on: "torch",
  water: "fins",
  opacity: "tank",
  visibility: "mask",
  fitness_center: "weights",
  photo_camera: "camera",
  build: "other"
};

export function gearDrawing(item) {
  // A drawing chosen in the form wins; "scuba_diving" is the untouched default, so the kind decides.
  const kind = KIND_BY_ICON[item.icon] || KIND_BY_WORD.find(([, words]) => words.test(item.category || item.type || item.name || ""))?.[0];
  return DRAWINGS[kind] || DRAWINGS.other;
}

export const GEAR_DRAWING_OPTIONS = [
  { icon: "scuba_diving", label: "Match the kind" },
  { icon: "air", label: "Regulator" },
  { icon: "backpack", label: "BCD" },
  { icon: "watch", label: "Computer" },
  { icon: "waves", label: "Suit" },
  { icon: "flashlight_on", label: "Torch" },
  { icon: "water", label: "Fins" },
  { icon: "opacity", label: "Tank" },
  { icon: "visibility", label: "Mask" },
  { icon: "fitness_center", label: "Weights" },
  { icon: "photo_camera", label: "Camera" },
  { icon: "build", label: "Tools" }
];
