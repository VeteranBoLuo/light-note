import avatarSpriteUrl from '@/assets/img/light-note-avatar-sprite-v2.webp';
import avatarVarietySpriteUrl from '@/assets/img/light-note-avatar-sprite-variety-v1.webp';

const AVATAR_GRID_SIZE = 3;
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
  | 'sunflower-turntable';

type BuiltinAvatarSprite = 'classic' | 'variety';

const AVATAR_SPRITE_URLS: Record<BuiltinAvatarSprite, string> = {
  classic: avatarSpriteUrl,
  variety: avatarVarietySpriteUrl,
};

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
] as const;

export const BUILTIN_AVATAR_SPRITE_URL = avatarSpriteUrl;

export function builtinAvatarPreviewStyle(avatar: BuiltinAvatar) {
  return {
    backgroundImage: `url("${AVATAR_SPRITE_URLS[avatar.sprite]}")`,
    backgroundPosition: `${avatar.column * 50}% ${avatar.row * 50}%`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${AVATAR_GRID_SIZE * 100}% ${AVATAR_GRID_SIZE * 100}%`,
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
 * 这样既避免首屏加载十八张大图，也兼容当前头像接口与聊天室头像接口的数据格式。
 */
export async function renderBuiltinAvatar(id: BuiltinAvatarId): Promise<string> {
  const avatar = BUILTIN_AVATARS.find((item) => item.id === id);
  if (!avatar) throw new Error('BUILTIN_AVATAR_NOT_FOUND');

  const image = await loadSpriteImage(AVATAR_SPRITE_URLS[avatar.sprite]);
  const sourceWidth = image.naturalWidth / AVATAR_GRID_SIZE;
  const sourceHeight = image.naturalHeight / AVATAR_GRID_SIZE;
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
