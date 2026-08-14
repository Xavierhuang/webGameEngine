/**
 * Message catalog — pure data, no React, so node tests can verify that every
 * locale covers every key.
 *
 * The app was hardcoded English throughout (`<html lang="en">`, every string
 * inline in JSX, no i18n library). This is the extraction layer that was
 * missing; EN and 中文 match what the rest of LingCode ships.
 *
 * Adding a locale: add the code to `LOCALES`, add a block to `MESSAGES`, and
 * `npm run test:i18n` will fail until every key is translated.
 */

export const LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
};

/** Keys are dot-namespaced by surface: nav, explore, share, player, … */
export const MESSAGES = {
  en: {
    'nav.create': 'Create',
    'nav.explore': 'Explore',
    'nav.myGames': 'My Games',
    'nav.learn': 'Learn',
    'nav.forParents': 'For Parents',
    'nav.signIn': 'Sign in',
    'nav.signOut': 'Sign out',
    'nav.startBuilding': 'Start Building',

    'explore.title': 'Explore',
    'explore.subtitle': 'Play games other people made — then remix one to make it your own.',
    'explore.search': 'Search games…',
    'explore.sort.newest': 'Newest',
    'explore.sort.loved': 'Most loved',
    'explore.sort.remixed': 'Most remixed',
    'explore.sort.played': 'Most played',
    'explore.empty.title': 'No shared games yet',
    'explore.empty.body': 'Be the first — make a game, then hit Share in the editor so everyone can play it.',
    'explore.empty.search': 'No games match that search',
    'explore.makeAGame': 'Make a game',

    'project.play': 'Play',
    'project.remix': 'Remix',
    'project.remixing': 'Remixing…',
    'project.edit': 'Edit',
    'project.report': 'Report',
    'project.by': 'by',
    'project.remixedFrom': 'Remixed from',
    'project.loves': 'loves',
    'project.remixes': 'remixes',
    'project.plays': 'plays',
    'project.noDescription': 'No description yet.',

    'share.title': 'Share your game',
    'share.public': 'Anyone with the link can play',
    'share.private': 'Only you can see this',
    'share.publicBody': 'Your game appears in Explore, and other people can remix it to make their own version.',
    'share.privateBody': 'Share it publicly so friends can play it and remix it.',
    'share.makePublic': 'Share publicly',
    'share.makePrivate': 'Make it private again',
    'share.copy': 'Copy',
    'share.copied': 'Copied',
    'share.download': 'Download a copy',

    'player.restart': 'Restart',
    'player.stop': 'Stop',
    'player.fullscreen': 'Fullscreen',
    'player.clickToStart': 'Click to start',
    'player.unlocksSound': 'Unlocks sound in this window',
    'player.controls': 'Use Arrow Keys or WASD to move',
    'player.jump': 'Press Space to jump',

    'editor.save': 'Save',
    'editor.saving': 'Saving…',
    'editor.saved': 'Saved',
    'editor.saveFailed': 'Save failed',
    'editor.share': 'Share',
    'editor.shared': 'Shared',
    'editor.scenes': 'Scenes',
    'editor.addScene': 'Add',
    'editor.sceneObjects': 'Scene Objects',
    'editor.noObjects': 'No objects yet',

    'consent.needed': 'Parental permission needed',
    'consent.needsParentEmail': "Because you're under 13, we need a parent or guardian's email address.",
    'consent.grant': 'I give permission',
    'consent.deny': 'No, not right now',
    'consent.granted': 'Thank you — permission granted. Your child can now share their games.',

    'common.cancel': 'Cancel',
    'common.done': 'Done',
    'common.close': 'Close',
    'common.tryAgain': 'Could not reach the server. Try again.',
  },

  zh: {
    'nav.create': '创建',
    'nav.explore': '发现',
    'nav.myGames': '我的游戏',
    'nav.learn': '学习',
    'nav.forParents': '家长专区',
    'nav.signIn': '登录',
    'nav.signOut': '退出登录',
    'nav.startBuilding': '开始创作',

    'explore.title': '发现',
    'explore.subtitle': '玩玩别人做的游戏 —— 然后改编成你自己的版本。',
    'explore.search': '搜索游戏…',
    'explore.sort.newest': '最新',
    'explore.sort.loved': '最多喜欢',
    'explore.sort.remixed': '最多改编',
    'explore.sort.played': '最多游玩',
    'explore.empty.title': '还没有分享的游戏',
    'explore.empty.body': '来当第一个吧 —— 做一个游戏，然后在编辑器里点「分享」，大家就能玩到了。',
    'explore.empty.search': '没有找到符合的游戏',
    'explore.makeAGame': '做一个游戏',

    'project.play': '开始玩',
    'project.remix': '改编',
    'project.remixing': '改编中…',
    'project.edit': '编辑',
    'project.report': '举报',
    'project.by': '作者',
    'project.remixedFrom': '改编自',
    'project.loves': '喜欢',
    'project.remixes': '改编',
    'project.plays': '游玩',
    'project.noDescription': '还没有介绍。',

    'share.title': '分享你的游戏',
    'share.public': '有链接的人都能玩',
    'share.private': '只有你能看到',
    'share.publicBody': '你的游戏会出现在「发现」里，其他人可以改编成自己的版本。',
    'share.privateBody': '公开分享，朋友就能玩，也能改编。',
    'share.makePublic': '公开分享',
    'share.makePrivate': '改回私密',
    'share.copy': '复制',
    'share.copied': '已复制',
    'share.download': '下载副本',

    'player.restart': '重新开始',
    'player.stop': '停止',
    'player.fullscreen': '全屏',
    'player.clickToStart': '点击开始',
    'player.unlocksSound': '点击后才有声音',
    'player.controls': '用方向键或 WASD 移动',
    'player.jump': '按空格键跳跃',

    'editor.save': '保存',
    'editor.saving': '保存中…',
    'editor.saved': '已保存',
    'editor.saveFailed': '保存失败',
    'editor.share': '分享',
    'editor.shared': '已分享',
    'editor.scenes': '场景',
    'editor.addScene': '添加',
    'editor.sceneObjects': '场景对象',
    'editor.noObjects': '还没有对象',

    'consent.needed': '需要家长同意',
    'consent.needsParentEmail': '因为你还不满 13 岁，我们需要一位家长或监护人的邮箱。',
    'consent.grant': '我同意',
    'consent.deny': '暂时不同意',
    'consent.granted': '谢谢 —— 已获得同意。你的孩子现在可以分享游戏了。',

    'common.cancel': '取消',
    'common.done': '完成',
    'common.close': '关闭',
    'common.tryAgain': '连不上服务器，请再试一次。',
  },
} satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof (typeof MESSAGES)['en'];

/** Look up a message, falling back to English and then to the key itself. */
export function translate(locale: Locale, key: MessageKey): string {
  const table = MESSAGES[locale] as Record<string, string> | undefined;
  return table?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? String(key);
}

/** Narrow an arbitrary string (cookie, Accept-Language) to a supported locale. */
export function resolveLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const lower = value.toLowerCase();
  for (const locale of LOCALES) {
    if (lower === locale || lower.startsWith(`${locale}-`)) return locale;
  }
  return DEFAULT_LOCALE;
}
