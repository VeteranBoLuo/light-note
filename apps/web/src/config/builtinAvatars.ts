import avatarSpriteUrl from '@/assets/img/light-note-avatar-sprite-v3.webp';
import avatarVarietySpriteUrl from '@/assets/img/light-note-avatar-sprite-variety-v2.webp';
import avatarRefinedSpriteUrl from '@/assets/img/light-note-avatar-sprite-refined-v1.webp';

const AVATAR_OUTPUT_SIZE = 256;
const AVATAR_WEBP_QUALITY = 0.82;
const AVATAR_JPEG_QUALITY = 0.84;

export type BuiltinAvatarId =
  | 'pineapple-scribe'
  | 'moon-reader'
  | 'paper-crane'
  | 'cloud-archive'
  | 'koi-lotus'
  | 'galaxy-observatory'
  | 'ink-pavilion'
  | 'aurora-whale'
  | 'card-robot'
  | 'capybara-notes'
  | 'red-panda-bookmark'
  | 'sprout-astronaut'
  | 'mountain-fox'
  | 'tea-journal-spirit'
  | 'library-mushroom'
  | 'pixel-owl'
  | 'porcelain-rabbit'
  | 'sunflower-turntable'
  | 'silver-fox'
  | 'ink-cat'
  | 'white-deer'
  | 'snow-owl'
  | 'star-whale'
  | 'paper-traveler';

type BuiltinAvatarSprite = 'classic' | 'variety' | 'refined';

const AVATAR_SPRITES: Record<BuiltinAvatarSprite, { url: string; columns: number; rows: number }> = {
  classic: { url: avatarSpriteUrl, columns: 3, rows: 3 },
  variety: { url: avatarVarietySpriteUrl, columns: 3, rows: 3 },
  refined: { url: avatarRefinedSpriteUrl, columns: 3, rows: 2 },
};

export const builtinAvatarAssetUrls = () => Object.values(AVATAR_SPRITES).map(sprite => sprite.url);

export interface BuiltinAvatar {
  id: BuiltinAvatarId;
  sprite: BuiltinAvatarSprite;
  row: number;
  column: number;
  nameKey: string;
  descriptionKey: string;
}

export const BUILTIN_AVATARS: readonly BuiltinAvatar[] = [
  {
    id: 'pineapple-scribe',
    sprite: 'classic',
    row: 0,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.pineappleScribe',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.pineappleScribe',
  },
  {
    id: 'moon-reader',
    sprite: 'classic',
    row: 0,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.moonReader',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.moonReader',
  },
  {
    id: 'paper-crane',
    sprite: 'classic',
    row: 0,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.paperCrane',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.paperCrane',
  },
  {
    id: 'cloud-archive',
    sprite: 'classic',
    row: 1,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.cloudArchive',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.cloudArchive',
  },
  {
    id: 'koi-lotus',
    sprite: 'classic',
    row: 1,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.koiLotus',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.koiLotus',
  },
  {
    id: 'galaxy-observatory',
    sprite: 'classic',
    row: 1,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.galaxyObservatory',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.galaxyObservatory',
  },
  {
    id: 'ink-pavilion',
    sprite: 'classic',
    row: 2,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.inkPavilion',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.inkPavilion',
  },
  {
    id: 'aurora-whale',
    sprite: 'classic',
    row: 2,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.auroraWhale',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.auroraWhale',
  },
  {
    id: 'card-robot',
    sprite: 'classic',
    row: 2,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.cardRobot',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.cardRobot',
  },
  {
    id: 'capybara-notes',
    sprite: 'variety',
    row: 0,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.capybaraNotes',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.capybaraNotes',
  },
  {
    id: 'red-panda-bookmark',
    sprite: 'variety',
    row: 0,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.redPandaBookmark',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.redPandaBookmark',
  },
  {
    id: 'sprout-astronaut',
    sprite: 'variety',
    row: 0,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.sproutAstronaut',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.sproutAstronaut',
  },
  {
    id: 'mountain-fox',
    sprite: 'variety',
    row: 1,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.mountainFox',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.mountainFox',
  },
  {
    id: 'tea-journal-spirit',
    sprite: 'variety',
    row: 1,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.teaJournalSpirit',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.teaJournalSpirit',
  },
  {
    id: 'library-mushroom',
    sprite: 'variety',
    row: 1,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.libraryMushroom',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.libraryMushroom',
  },
  {
    id: 'pixel-owl',
    sprite: 'variety',
    row: 2,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.pixelOwl',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.pixelOwl',
  },
  {
    id: 'porcelain-rabbit',
    sprite: 'variety',
    row: 2,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.porcelainRabbit',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.porcelainRabbit',
  },
  {
    id: 'sunflower-turntable',
    sprite: 'variety',
    row: 2,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.sunflowerTurntable',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.sunflowerTurntable',
  },
  {
    id: 'silver-fox',
    sprite: 'refined',
    row: 0,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.silverFox',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.silverFox',
  },
  {
    id: 'ink-cat',
    sprite: 'refined',
    row: 0,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.inkCat',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.inkCat',
  },
  {
    id: 'white-deer',
    sprite: 'refined',
    row: 0,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.whiteDeer',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.whiteDeer',
  },
  {
    id: 'snow-owl',
    sprite: 'refined',
    row: 1,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.snowOwl',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.snowOwl',
  },
  {
    id: 'star-whale',
    sprite: 'refined',
    row: 1,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.starWhale',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.starWhale',
  },
  {
    id: 'paper-traveler',
    sprite: 'refined',
    row: 1,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.paperTraveler',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.paperTraveler',
  },
] as const;

export const BUILTIN_AVATAR_SPRITE_URL = avatarSpriteUrl;

export function builtinAvatarPreviewStyle(avatar: BuiltinAvatar) {
  const sprite = AVATAR_SPRITES[avatar.sprite];
  return {
    backgroundImage: `url("${sprite.url}")`,
    backgroundPosition: `${(avatar.column * 100) / (sprite.columns - 1)}% ${(avatar.row * 100) / (sprite.rows - 1)}%`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${sprite.columns * 100}% ${sprite.rows * 100}%`,
  };
}

const spriteImagePromises = new Map<string, Promise<HTMLImageElement>>();

function loadSpriteImage(spriteUrl: string): Promise<HTMLImageElement> {
  const cachedPromise = spriteImagePromises.get(spriteUrl);
  if (cachedPromise) return cachedPromise;

  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => {
      spriteImagePromises.delete(spriteUrl);
      reject(new Error('BUILTIN_AVATAR_SPRITE_LOAD_FAILED'));
    };
    image.src = spriteUrl;
  });
  spriteImagePromises.set(spriteUrl, imagePromise);
  return imagePromise;
}

/**
 * 内置头像按系列使用紧凑精灵图交付，用户确认后再裁成独立的 256px Data URL。
 * 这样既避免首屏逐张加载大图，也兼容当前头像接口与聊天室头像接口的数据格式。
 */
export async function renderBuiltinAvatar(id: BuiltinAvatarId): Promise<string> {
  const avatar = BUILTIN_AVATARS.find((item) => item.id === id);
  if (!avatar) throw new Error('BUILTIN_AVATAR_NOT_FOUND');

  const sprite = AVATAR_SPRITES[avatar.sprite];
  const image = await loadSpriteImage(sprite.url);
  const sourceWidth = image.naturalWidth / sprite.columns;
  const sourceHeight = image.naturalHeight / sprite.rows;
  if (!sourceWidth || !sourceHeight) throw new Error('BUILTIN_AVATAR_SPRITE_SIZE_INVALID');

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('AVATAR_CANVAS_UNAVAILABLE');

  context.drawImage(
    image,
    avatar.column * sourceWidth,
    avatar.row * sourceHeight,
    sourceWidth,
    sourceHeight,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  const webp = canvas.toDataURL('image/webp', AVATAR_WEBP_QUALITY);
  if (webp.startsWith('data:image/webp')) return webp;

  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  return canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);
}
