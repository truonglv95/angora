export interface Row {
  id: number;
  label: string;
}

const ADJECTIVES = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
];

const COLOURS = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'white',
  'black',
  'orange',
];

const NOUNS = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

let nextId = 1;

export function buildData(count: number): Row[] {
  const data: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`,
    };
  }
  return data;
}

export function resetIdCounter(): void {
  nextId = 1;
}
