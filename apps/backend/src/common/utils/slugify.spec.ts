import { slugify, generateUniqueSlug } from './slugify';

describe('slugify', () => {
  it('normalise une chaine basique', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('retire les accents', () => {
    expect(slugify('Politique de sécurité')).toBe('politique-de-securite');
    // L'apostrophe est retiree (non-alphanum)
    expect(slugify('Café à l\'orée')).toBe('cafe-a-loree');
    expect(slugify('Réponse à incident #42 !')).toBe('reponse-a-incident-42');
  });

  it('compacte les espaces et tirets multiples', () => {
    expect(slugify('foo   bar___baz---qux')).toBe('foo-bar-baz-qux');
  });

  it('retire les caracteres non-alphanum', () => {
    expect(slugify('Dollar $ symbol & more!')).toBe('dollar-symbol-more');
  });

  it('trim les tirets de debut/fin', () => {
    expect(slugify('---foo---')).toBe('foo');
  });

  it('tronque a la longueur max', () => {
    const longTitle = 'a'.repeat(100);
    const result = slugify(longTitle, { maxLength: 10 });
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('retourne fallback si chaine vide', () => {
    expect(slugify('', { fallback: 'untitled' })).toBe('untitled');
    expect(slugify('   ', { fallback: 'untitled' })).toBe('untitled');
  });

  it('retourne chaine vide si pas de fallback', () => {
    expect(slugify('')).toBe('');
    expect(slugify('!!!')).toBe('');
  });

  it('handle unicode/emojis', () => {
    expect(slugify('🚀 Rocket Launch 2026')).toBe('rocket-launch-2026');
  });
});

describe('generateUniqueSlug', () => {
  it('retourne le slug base si pas pris', async () => {
    const isTaken = async (_s: string) => false;
    expect(await generateUniqueSlug('Politique', isTaken)).toBe('politique');
  });

  it('ajoute suffixe -2 si pris une fois', async () => {
    const taken = new Set(['politique']);
    const isTaken = async (s: string) => taken.has(s);
    expect(await generateUniqueSlug('Politique', isTaken)).toBe('politique-2');
  });

  it('continue jusqu\'a trouver un suffixe libre', async () => {
    const taken = new Set(['foo', 'foo-2', 'foo-3', 'foo-4']);
    const isTaken = async (s: string) => taken.has(s);
    expect(await generateUniqueSlug('foo', isTaken)).toBe('foo-5');
  });

  it('respecte maxLength avec suffixe', async () => {
    const isTaken = async (s: string) => s === 'abcdefghij';
    const result = await generateUniqueSlug('abcdefghij', isTaken, { maxLength: 10 });
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result).toBe('abcdefgh-2');
  });

  it('fallback timestamp apres 100 echecs', async () => {
    const isTaken = async (_s: string) => true; // tout est pris
    const result = await generateUniqueSlug('foo', isTaken, { maxAttempts: 5 });
    // Apres 5 tentatives, timestamp (base36) est ajouté
    expect(result).toMatch(/^foo-[a-z0-9]+$/);
  });
});
