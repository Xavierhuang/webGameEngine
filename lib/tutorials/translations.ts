/**
 * Tutorial text in other languages.
 *
 * The catalog in `./catalog.ts` is the English source of truth and stays
 * pure data with no locale dependency, so the structural tests keep running
 * against it. This file holds translations keyed by tutorial id and field;
 * `localizeTutorial` overlays them and falls back to English per field, so a
 * partly translated locale never shows a blank.
 *
 * Only `zh` is complete today, matching the UI catalog (`en` and `zh` are the
 * fully translated locales). Adding a language is adding a table here.
 *
 * Keys: `<tutorialId>.title|summary|concept`, `<tutorialId>.step.<n>.title|body|hint`.
 */

import type { Tutorial, TutorialLevel } from './catalog';

type Table = Record<string, string>;

const zh: Table = {
  'first-game.title': '做你的第一个游戏',
  'first-game.summary': '添加一个角色，按下按键时让它动起来。',
  'first-game.concept': '脚本在"某件事发生"时开始运行。这个"某件事"就是事件。',
  'first-game.step.0.title': '添加一个角色',
  'first-game.step.0.body': '点击工具栏里的"角色"，选一个你喜欢的。它会出现在你的世界中央。',
  'first-game.step.0.hint': '工具栏，左上角',
  'first-game.step.1.title': '打开积木编辑器',
  'first-game.step.1.body': '切换到"逻辑"标签页。在这里你告诉角色该做什么。',
  'first-game.step.1.hint': '场景 / 逻辑 标签',
  'first-game.step.2.title': '从一个事件开始',
  'first-game.step.2.body': '拖出"当按住 ⬆ 键"。积木只有在被触发时才会运行——这就是事件积木的作用。没有它什么都不会发生。',
  'first-game.step.2.hint': '事件 分类',
  'first-game.step.3.title': '让它动起来',
  'first-game.step.3.body': '把"向前移动 200"拼在下面。积木从上到下运行，所以只要按住按键它就会移动。',
  'first-game.step.3.hint': '运动 分类',
  'first-game.step.4.title': '玩一玩',
  'first-game.step.4.body': '点击"播放"，按住上方向键。你刚刚做出了一个游戏！试着给其他方向键也加上积木。',
  'first-game.step.4.hint': '播放按钮，右上角',

  'collect-coins.title': '收集金币',
  'collect-coins.summary': '角色碰到东西时记分。',
  'collect-coins.concept': '变量会在游戏运行时记住一个数字——分数就是这样的东西。',
  'collect-coins.step.0.title': '添加一个收集物',
  'collect-coins.step.0.body': '点击"收集物"，选一枚金币。在世界里放几个。',
  'collect-coins.step.0.hint': '工具栏',
  'collect-coins.step.1.title': '创建分数',
  'collect-coins.step.1.body': '在"逻辑"标签页里，把"将 分数 设为 0"放在"当游戏开始"下面。从零开始很重要——否则分数会保留上一次的值。',
  'collect-coins.step.1.hint': '变量 分类',
  'collect-coins.step.2.title': '显示分数',
  'collect-coins.step.2.body': '添加"显示变量 分数"，这样玩家在玩的时候能在屏幕上看到它。',
  'collect-coins.step.3.title': '检测碰触',
  'collect-coins.step.3.body': '在金币上使用"当碰到"，然后"将 分数 增加 1"。是金币发现了玩家，而不是反过来。',
  'collect-coins.step.4.title': '让金币消失',
  'collect-coins.step.4.body': '在后面加上"隐藏"。现在每枚金币只能被收集一次。',

  'talk-to-ai.title': '做一个会回话的角色',
  'talk-to-ai.summary': '向玩家提问，并用 AI 来回答。',
  'talk-to-ai.concept': '你的游戏可以提问、记住答案，并对它做出反应。',
  'talk-to-ai.step.0.title': '提一个问题',
  'talk-to-ai.step.0.body': '使用"询问 你叫什么名字？ 并等待"。脚本会停在那里，直到玩家输入内容。',
  'talk-to-ai.step.0.hint': '侦测 分类',
  'talk-to-ai.step.1.title': '使用答案',
  'talk-to-ai.step.1.body': '添加"说 连接 你好  回答"。"回答"积木保存着玩家输入的内容。',
  'talk-to-ai.step.2.title': '让 AI 来回答',
  'talk-to-ai.step.2.body': '现在试试"询问 AI"并写一个提示，把结果存进变量，再用"说"说出这个变量。你的角色能回答你从没写过的问题。',
  'talk-to-ai.step.2.hint': 'AI 分类',
  'talk-to-ai.step.3.title': '玩一玩',
  'talk-to-ai.step.3.body': '点击"播放"，和你的角色聊天。试着改一改提示，给它一个性格。',

  'make-music.title': '做音乐',
  'make-music.summary': '弹音符、打鼓，编一段曲子。',
  'make-music.concept': '积木一个接一个运行，所以一叠音符会按顺序变成旋律。',
  'make-music.step.0.title': '弹一个音',
  'make-music.step.0.body': '把"弹奏音符 60 持续 1 拍"拖到"当游戏开始"下面。60 是中央 C。',
  'make-music.step.0.hint': '音乐 分类',
  'make-music.step.1.title': '编一段曲子',
  'make-music.step.1.body': '在下面再加几个音符——试试 62、64、65。每个音符都会等上一个弹完，所以它们按顺序播放。',
  'make-music.step.2.title': '加一段节奏',
  'make-music.step.2.body': '在音符之间用"敲鼓"，再用"设置速度"让整首曲子变快或变慢。',
  'make-music.step.3.title': '循环播放',
  'make-music.step.3.body': '把整叠积木放进"重复执行"里，你的歌就会一直放下去。',

  'draw-with-pen.title': '用画笔画画',
  'draw-with-pen.summary': '让角色移动时留下一条痕迹。',
  'draw-with-pen.concept': '循环会重复指令，每次一点小变化，加起来就是一个图形。',
  'draw-with-pen.step.0.title': '落笔',
  'draw-with-pen.step.0.body': '在"当游戏开始"下面，添加"全部擦除"然后"落笔"。',
  'draw-with-pen.step.0.hint': '画笔 分类',
  'draw-with-pen.step.1.title': '在循环里移动',
  'draw-with-pen.step.1.body': '添加"重复 36 次"，把"向前移动 50"和"旋转 y 10"放进去。十度，三十六次，正好一整圈。',
  'draw-with-pen.step.2.title': '上色',
  'draw-with-pen.step.2.body': '在循环前试试"设置画笔颜色"。改改数字画出不同的图形——重复 4 次、旋转 90 会画出什么？',

  'draw-your-own.title': '画你自己的角色',
  'draw-your-own.summary': '不用挑现成的，自己画一个角色。',
  'draw-your-own.concept': '角色的外观只是一张包在它身上的图片——所以你可以自己画。',
  'draw-your-own.step.0.title': '随便选一个开始',
  'draw-your-own.step.0.body': '添加一个角色。选哪个都无所谓——你马上就要在上面画画了。',
  'draw-your-own.step.0.hint': '工具栏',
  'draw-your-own.step.1.title': '打开绘画编辑器',
  'draw-your-own.step.1.body': '选中角色，在右侧面板里找到"自己画"。',
  'draw-your-own.step.1.hint': '属性面板',
  'draw-your-own.step.2.title': '画点什么',
  'draw-your-own.step.2.body': '先试试画笔，再用油漆桶填大块区域。棋盘格表示透明。',
  'draw-your-own.step.3.title': '用上它',
  'draw-your-own.step.3.body': '点击"使用这幅画"。你的画现在包在了 3D 世界里的角色身上。',
  'draw-your-own.step.4.title': '改主意了？',
  'draw-your-own.step.4.body': '点击"编辑画作"回去修改。什么都不是定死的——想重画多少次都行。',

  'record-a-sound.title': '录一段你自己的声音',
  'record-a-sound.summary': '用麦克风把真实的声音放进游戏。',
  'record-a-sound.concept': '游戏可以播放你能发出的任何声音——不只限于我们提供的那些。',
  'record-a-sound.step.0.title': '打开声音选择器',
  'record-a-sound.step.0.body': '点击工具栏里的"声音"，然后选择"录音"标签。',
  'record-a-sound.step.0.hint': '工具栏',
  'record-a-sound.step.1.title': '录点什么',
  'record-a-sound.step.1.body': '按下麦克风，发出一个声音——吼一声、"嘣"一下、说个词。录完按停止。浏览器会先请求你的许可。',
  'record-a-sound.step.2.title': '听一听并起名',
  'record-a-sound.step.2.body': '按"试听"回放。不满意就"丢弃"重录。给它起一个你认得出的名字。',
  'record-a-sound.step.3.title': '用积木播放它',
  'record-a-sound.step.3.body': '在"逻辑"标签页里，使用"播放声音"，从列表中选择你的录音。',

  'animate-it.title': '让你的角色动起来',
  'animate-it.summary': '一个姿势一个姿势地做出自己的动画。',
  'animate-it.concept': '动画只是几个姿势和它们出现的时间——中间的部分由电脑补上。',
  'animate-it.step.0.title': '打开动画编辑器',
  'animate-it.step.0.body': '选中一个角色，然后在属性面板里找到动画编辑器。',
  'animate-it.step.0.hint': '属性面板',
  'animate-it.step.1.title': '摆第一帧的姿势',
  'animate-it.step.1.body': '在时间 0，选一个身体部位并旋转它。添加一个关键帧。这就是起始姿势。',
  'animate-it.step.2.title': '摆后面一帧的姿势',
  'animate-it.step.2.body': '把时间往后拨，把同一个部位移到别的位置，再添加一个关键帧。两个姿势就足以产生动作。',
  'animate-it.step.3.title': '看看效果',
  'animate-it.step.3.body': '按"播放"。电脑会算出两个姿势之间的每一个位置——这就是"补间"的意思。',
  'animate-it.step.4.title': '保存并使用',
  'animate-it.step.4.body': '保存动画，然后用"切换动画到"加上它的名字来播放。',

  'speak-any-language.title': '会说任何语言的游戏',
  'speak-any-language.summary': '翻译角色说的话，并大声读出来。',
  'speak-any-language.concept': '游戏可以为每一个玩家改变自己——包括他们说的语言。',
  'speak-any-language.step.0.title': '问名字',
  'speak-any-language.step.0.body': '使用"询问 你叫什么名字？ 并等待"，然后把"回答"用"说"说出来。',
  'speak-any-language.step.1.title': '翻译一句问候',
  'speak-any-language.step.1.body': '使用"把 你好！ 翻译成 西班牙语 存入 问候"，然后用"说"说出这个变量。',
  'speak-any-language.step.1.hint': 'AI 分类',
  'speak-any-language.step.2.title': '大声说出来',
  'speak-any-language.step.2.body': '添加"朗读"并使用同一个变量。你的角色现在会说西班牙语了。',
  'speak-any-language.step.3.title': '匹配玩家',
  'speak-any-language.step.3.body': '试试用"语言"积木代替固定选择——现在问候语会匹配正在玩的人。',

  'share-it.title': '分享你的游戏',
  'share-it.summary': '发布你的游戏，让别人来玩和改编。',
  'share-it.concept': '分享让别人能玩你的游戏——还能把它改编成新的东西。',
  'share-it.step.0.title': '给游戏起名',
  'share-it.step.0.body': '起一个能让人知道这是什么的标题。',
  'share-it.step.1.title': '点击分享',
  'share-it.step.1.body': '点击顶栏的"分享"，再点"公开分享"。审核通过后，你的游戏会出现在"发现"里。',
  'share-it.step.1.hint': '分享按钮，右上角',
  'share-it.step.2.title': '试试改编',
  'share-it.step.2.body': '去"发现"，打开别人的游戏，点击"改编"。你会得到一份自己的副本，随便怎么改——原作不会受影响。',
  'share-it.step.2.hint': '导航栏里的"发现"',
};

const LEVEL_LABELS_BY_LOCALE: Record<string, Record<TutorialLevel, string>> = {
  zh: { first: '从这里开始', easy: '简单', medium: '稍难一点' },
};

const TABLES: Record<string, Table> = { zh };

/** Level label for a locale, falling back to the English catalog label. */
export function levelLabel(level: TutorialLevel, locale: string, fallback: string): string {
  return LEVEL_LABELS_BY_LOCALE[locale]?.[level] ?? fallback;
}

/** A copy of `tutorial` with every translated field overlaid. English is returned untouched. */
export function localizeTutorial(tutorial: Tutorial, locale: string): Tutorial {
  const table = TABLES[locale];
  if (!table) return tutorial;
  const pick = (key: string, fallback: string | undefined) => table[key] ?? fallback;
  return {
    ...tutorial,
    title: pick(`${tutorial.id}.title`, tutorial.title) as string,
    summary: pick(`${tutorial.id}.summary`, tutorial.summary) as string,
    concept: pick(`${tutorial.id}.concept`, tutorial.concept) as string,
    steps: tutorial.steps.map((step, i) => ({
      ...step,
      title: pick(`${tutorial.id}.step.${i}.title`, step.title) as string,
      body: pick(`${tutorial.id}.step.${i}.body`, step.body) as string,
      hint: pick(`${tutorial.id}.step.${i}.hint`, step.hint),
    })),
  };
}

export function localizeTutorials(tutorials: Tutorial[], locale: string): Tutorial[] {
  return tutorials.map((t) => localizeTutorial(t, locale));
}

/** Which locales have tutorial text; used by the test that keeps tables complete. */
export const TUTORIAL_LOCALES: string[] = Object.keys(TABLES);
export const TUTORIAL_TABLES: Record<string, Table> = TABLES;
