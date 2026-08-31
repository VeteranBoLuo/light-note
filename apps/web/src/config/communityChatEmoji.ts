import { COMMUNITY_CHAT_INLINE_EMOJIS } from '@lightnote/shared/community-chat-inline-emojis';

export interface CommunityChatEmojiCategory {
  key:
    'recent' | 'jianTuan' | 'smileys' | 'people' | 'animals' | 'food' | 'activities' | 'travel' | 'objects' | 'symbols';
  icon: string;
  emojis: string[];
}

const emojiList = (value: string) => value.trim().split(/\s+/u).filter(Boolean).slice(0, 30);

export const COMMUNITY_CHAT_EMOJI_CATEGORIES: CommunityChatEmojiCategory[] = [
  {
    key: 'jianTuan',
    icon: COMMUNITY_CHAT_INLINE_EMOJIS[0].token,
    emojis: COMMUNITY_CHAT_INLINE_EMOJIS.map((emoji) => emoji.token),
  },
  {
    key: 'smileys',
    icon: '😀',
    emojis: emojiList(
      '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 😶 😐 😑 😬 🙄 😯 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕',
    ),
  },
  {
    key: 'people',
    icon: '👋',
    emojis: emojiList(
      '👋 🤚 🖐️ ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 👀 🧠 👶 🧒 👦 👧 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🙇 🤦 🤷 👮 👷 🕵️ 👩‍⚕️ 👩‍🍳 👩‍🎓 👩‍🎤 👩‍🏫 👩‍💻 👩‍💼 👩‍🔧 👩‍🔬 👩‍🎨 👩‍🚒 👩‍✈️',
    ),
  },
  {
    key: 'animals',
    icon: '🐱',
    emojis: emojiList(
      '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐣 🦆 🦅 🦉 🦇 🐺 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🕷️ 🐢 🐍 🦎 🐙 🦑 🦀 🐠 🐬 🐳 🦈 🐊 🦓 🦍 🐘 🦒 🦘 🐄 🐎 🐑 🦙 🐐 🦌 🐕 🐈 🐾 🌵 🌲 🌳 🌴 🌱 🌿 🍀 🍃 🍂 🍁 🍄 💐 🌷 🌹 🌺 🌸 🌼 🌻',
    ),
  },
  {
    key: 'food',
    icon: '🍜',
    emojis: emojiList(
      '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🥞 🧇 🥓 🥩 🍗 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍡 🍧 🍨 🍦 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🍯 🥛 ☕ 🍵 🧋 🥤 🍺 🍻 🥂 🍷 🍹',
    ),
  },
  {
    key: 'activities',
    icon: '⚽',
    emojis: emojiList(
      '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🏑 🏏 🥅 ⛳ 🏹 🎣 🥊 🥋 🛹 🛼 ⛸️ 🎿 🏂 🏋️ 🤸 ⛹️ 🤺 🏌️ 🏇 🧘 🏄 🏊 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎪 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩',
    ),
  },
  {
    key: 'travel',
    icon: '🚗',
    emojis: emojiList(
      '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🚏 🛣️ 🛤️ ⛽ 🚨 🚦 🛑 🚧 ⚓ ⛵ 🛶 🚤 🛳️ 🚢 ✈️ 🛫 🛬 🚁 🚠 🚡 🛰️ 🚀 🛸 🏠 🏡 🏢 🏥 🏦 🏨 🏪 🏫 🏭 🏯 🏰 💒 🗼 🗽 ⛪ 🕌 ⛩️ ⛲ ⛺ 🌁 🌃 🏙️ 🌄 🌅 🌆 🌇 🌉 🎠 🎡 🎢 🌍 🌎 🌏 🗺️ 🧭',
    ),
  },
  {
    key: 'objects',
    icon: '💡',
    emojis: emojiList(
      '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🕹️ 💽 💾 💿 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🎙️ ⏱️ ⏲️ ⏰ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🪛 🔧 🔨 🛠️ ⛏️ 🪚 🔩 ⚙️ 🧱 ⛓️ 🧲 🔪 🗡️ ⚔️ 🛡️ 🔮 🔭 🔬 🩹 🩺 💊 💉 🧬 🧪 🌡️ 🧹 🧺 🧻 🚽 🚿 🛁 🧼 🪥 🧽 🪣 🧴 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 🎁 🎈 🎀 🪄',
    ),
  },
  {
    key: 'symbols',
    icon: '❤️',
    emojis: emojiList(
      '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☯️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ ☢️ ☣️ 🆚 💮 ㊙️ ㊗️ 🅰️ 🅱️ 🆎 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 🚫 💯 💢 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 ⚠️ 🔰 ♻️ ✅ ❎ 🌐 💠 🌀 💤 ℹ️ 🆖 🆗 🆙 🆒 🆕 🆓 🔟 🔢 ▶️ ⏸️ ⏹️ ⏭️ ⏮️ ⏩ ⏪ 🔀 🔁 ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ 🔄 🎵 🎶 ➕ ➖ ➗ ✖️ ♾️ ©️ ®️',
    ),
  },
];

export const COMMUNITY_CHAT_EMOJI_RECENT_LIMIT = 24;
