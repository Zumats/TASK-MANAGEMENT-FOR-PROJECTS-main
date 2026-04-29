const ADJECTIVES = [
  "Silent", "Cosmic", "Mystic", "Neon", "Shadow", "Ancient",
  "Electric", "Phantom", "Velvet", "Quantum", "Hidden",
  "Crimson", "Sapphire", "Golden", "Midnight", "Lunar",
  "Solar", "Astral", "Frosted", "Ghostly", "Neon", "Cyber",
  "Lost", "Wandering", "Hollow", "Vibrant", "Emerald"
];

const ANIMALS = [
  "Panda", "Tiger", "Raven", "Fox", "Wolf", "Otter", "Hawk",
  "Cobra", "Lynx", "Crane", "Owl", "Bear", "Shark", "Mantis",
  "Dragon", "Phoenix", "Leopard", "Falcon", "Viper", "Lion",
  "Panther", "Eagle", "Sloth", "Koala", "Badger", "Stag"
];

const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e"
];

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return Math.abs(hash);
}

export function generateAlias(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${adj}${animal}_${num}`;
}

export function getAvatarColor(userId: number | string): string {
  const hash = simpleHash(String(userId));
  return PALETTE[hash % PALETTE.length];
}
