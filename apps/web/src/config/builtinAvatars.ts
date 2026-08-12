import avatarSpriteUrl from '@/assets/img/light-note-avatar-sprite-v2.webp';

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
  | 'card-robot';

export interface BuiltinAvatar {
  id: BuiltinAvatarId;
  row: number;
  column: number;
  nameKey: string;
  descriptionKey: string;
}

export const BUILTIN_AVATARS: readonly BuiltinAvatar[] = [
  {
    id: 'pineapple-scribe',
    row: 0,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.pineappleScribe',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.pineappleScribe',
  },
  {
    id: 'moon-reader',
    row: 0,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.moonReader',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.moonReader',
  },
  {
    id: 'paper-crane',
    row: 0,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.paperCrane',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.paperCrane',
  },
  {
    id: 'cloud-archive',
    row: 1,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.cloudArchive',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.cloudArchive',
  },
  {
    id: 'koi-lotus',
    row: 1,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.koiLotus',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.koiLotus',
  },
  {
    id: 'galaxy-observatory',
    row: 1,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.galaxyObservatory',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.galaxyObservatory',
  },
  {
    id: 'ink-pavilion',
    row: 2,
    column: 0,
    nameKey: 'myInfo.builtinAvatarNames.inkPavilion',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.inkPavilion',
  },
  {
    id: 'aurora-whale',
    row: 2,
    column: 1,
    nameKey: 'myInfo.builtinAvatarNames.auroraWhale',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.auroraWhale',
  },
  {
    id: 'card-robot',
    row: 2,
    column: 2,
    nameKey: 'myInfo.builtinAvatarNames.cardRobot',
    descriptionKey: 'myInfo.builtinAvatarDescriptions.cardRobot',
  },
] as const;

export const BUILTIN_AVATAR_SPRITE_URL = avatarSpriteUrl;

export function builtinAvatarPreviewStyle(avatar: BuiltinAvatar) {
  return {
    backgroundImage: `url("${avatarSpriteUrl}")`,
    backgroundPosition: `${avatar.column * 50}% ${avatar.row * 50}%`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${AVATAR_GRID_SIZE * 100}% ${AVATAR_GRID_SIZE * 100}%`,
  };
}

let spriteImagePromise: Promise<HTMLImageElement> | null = null;

function loadSpriteImage(): Promise<HTMLImageElement> {
  if (spriteImagePromise) return spriteImagePromise;

  spriteImagePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => {
      spriteImagePromise = null;
      reject(new Error('BUILTIN_AVATAR_SPRITE_LOAD_FAILED'));
    };
    image.src = avatarSpriteUrl;
  });
  return spriteImagePromise;
}

/**
 * 内置头像使用一张精灵图交付，用户确认后再裁成独立的 256px Data URL。
 * 这样既避免首屏加载九张大图，也兼容当前头像接口与聊天室头像接口的数据格式。
 */
export async function renderBuiltinAvatar(id: BuiltinAvatarId): Promise<string> {
  const avatar = BUILTIN_AVATARS.find((item) => item.id === id);
  if (!avatar) throw new Error('BUILTIN_AVATAR_NOT_FOUND');

  const image = await loadSpriteImage();
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
