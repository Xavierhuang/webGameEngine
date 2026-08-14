/**
 * Interactive tutorials.
 *
 * Pure data, no React, so the content can be validated in node — a tutorial
 * that references a block which doesn't exist is worse than no tutorial, and
 * that's exactly the kind of drift a test can catch.
 *
 * Design follows Scratch's step-by-step panel, but the emphasis is on teaching
 * the *concept* behind each step rather than only naming the block to drag: a
 * child who finishes should understand why an event hat starts a script, not
 * just that one goes on top.
 */

export type TutorialLevel = 'first' | 'easy' | 'medium';

export interface TutorialStep {
  /** Short imperative title, e.g. "Add a character". */
  title: string;
  /** One or two sentences. Written for an 8-12 year old. */
  body: string;
  /** Block types this step asks the child to use; validated against the palette. */
  blocks?: string[];
  /** Which part of the editor to look at. */
  hint?: string;
}

export interface Tutorial {
  id: string;
  title: string;
  /** One line shown on the card. */
  summary: string;
  level: TutorialLevel;
  /** Rough completion time in minutes. */
  minutes: number;
  emoji: string;
  /** The idea this tutorial is actually teaching. */
  concept: string;
  steps: TutorialStep[];
}

export const TUTORIALS: Tutorial[] = [
  {
    id: 'first-game',
    title: 'Make your first game',
    summary: 'Add a character and make it move when you press a key.',
    level: 'first',
    minutes: 5,
    emoji: '🎮',
    concept: 'Scripts start when something happens. That "something" is an event.',
    steps: [
      {
        title: 'Add a character',
        body: "Click Character in the toolbar and pick anyone you like. They'll appear in the middle of your world.",
        hint: 'Toolbar, top left',
      },
      {
        title: 'Open the block editor',
        body: 'Switch to the Logic tab. This is where you tell your character what to do.',
        hint: 'Scene / Logic tabs',
      },
      {
        title: 'Start with an event',
        body: "Drag out `when ⬆ key held`. Blocks only run when something starts them — that's what an event block is for. Nothing happens without one.",
        blocks: ['on_key_press'],
        hint: 'Events category',
      },
      {
        title: 'Make it move',
        body: 'Snap `move forward 200` underneath. Blocks run top to bottom, so this happens whenever the key is held.',
        blocks: ['move'],
        hint: 'Motion category',
      },
      {
        title: 'Play it',
        body: "Hit Play and hold the up arrow. You just built a game! Try adding blocks for the other arrow keys.",
        hint: 'Play button, top right',
      },
    ],
  },
  {
    id: 'collect-coins',
    title: 'Collect the coins',
    summary: 'Keep score when your character touches something.',
    level: 'easy',
    minutes: 10,
    emoji: '⭐',
    concept: 'A variable remembers a number while the game runs — that is what a score is.',
    steps: [
      {
        title: 'Add a collectible',
        body: 'Click Collectible and pick a coin. Place a few around your world.',
        hint: 'Toolbar',
      },
      {
        title: 'Make a score',
        body: 'In the Logic tab, drag `set score to 0` under a `when game starts` block. Starting at zero matters — otherwise the score keeps whatever it had last time.',
        blocks: ['on_start', 'set_variable'],
        hint: 'Variables category',
      },
      {
        title: 'Show the score',
        body: 'Add `show variable score` so players can see it on screen while they play.',
        blocks: ['show_variable'],
      },
      {
        title: 'Detect the touch',
        body: 'On the coin, use `when touching` and then `change score by 1`. The coin notices the player, not the other way round.',
        blocks: ['when_touches', 'change_variable'],
      },
      {
        title: 'Make the coin disappear',
        body: 'Add `hide` after it. Now each coin can only be collected once.',
        blocks: ['hide'],
      },
    ],
  },
  {
    id: 'talk-to-ai',
    title: 'Make a character that talks back',
    summary: 'Ask the player a question and use AI to answer it.',
    level: 'easy',
    minutes: 10,
    emoji: '🤖',
    concept: 'Your game can ask a question, remember the answer, and react to it.',
    steps: [
      {
        title: 'Ask a question',
        body: "Use `ask What's your name? and wait`. Your script pauses right there until the player types something.",
        blocks: ['ask_and_wait'],
        hint: 'Sensing category',
      },
      {
        title: 'Use the answer',
        body: 'Add `say join Hello  answer`. The `answer` block holds whatever the player typed.',
        blocks: ['say', 'expr_join', 'expr_answer'],
      },
      {
        title: 'Let AI reply',
        body: "Now try `ask AI` with a prompt and store it in a variable, then `say` that variable. Your character can answer things you never wrote yourself.",
        blocks: ['ask_ai', 'say'],
        hint: 'AI category',
      },
      {
        title: 'Play it',
        body: 'Hit Play and talk to your character. Try changing the prompt to give it a personality.',
      },
    ],
  },
  {
    id: 'make-music',
    title: 'Make music',
    summary: 'Play notes and drums to build a tune.',
    level: 'easy',
    minutes: 8,
    emoji: '🎵',
    concept: 'Blocks run one after another, so notes in a stack play as a melody.',
    steps: [
      {
        title: 'Play a note',
        body: 'Drag `play note 60 for 1 beats` under a `when game starts`. 60 is middle C.',
        blocks: ['on_start', 'play_note'],
        hint: 'Music category',
      },
      {
        title: 'Make a tune',
        body: 'Add more notes underneath — try 62, 64, 65. Each one waits for the one above to finish, so they play in order.',
        blocks: ['play_note'],
      },
      {
        title: 'Add a beat',
        body: 'Use `play drum` between notes, and `set tempo` to make the whole thing faster or slower.',
        blocks: ['play_drum', 'set_tempo'],
      },
      {
        title: 'Loop it',
        body: 'Wrap the whole stack in `forever` so your song keeps going.',
        blocks: ['forever'],
      },
    ],
  },
  {
    id: 'draw-with-pen',
    title: 'Draw with the pen',
    summary: 'Leave a trail behind your character as it moves.',
    level: 'medium',
    minutes: 8,
    emoji: '✏️',
    concept: 'A loop repeats instructions, and small changes each time add up to a shape.',
    steps: [
      {
        title: 'Put the pen down',
        body: 'Under `when game starts`, add `erase all pen` then `pen down`.',
        blocks: ['on_start', 'pen_clear', 'pen_down'],
        hint: 'Pen category',
      },
      {
        title: 'Move in a loop',
        body: 'Add `repeat 36` and put `move forward 50` and `rotate y 10` inside it. Ten degrees, thirty-six times, is a full circle.',
        blocks: ['repeat', 'move', 'rotate'],
      },
      {
        title: 'Colour it',
        body: 'Try `set pen color` before the loop. Change the numbers to draw a different shape — what does repeat 4 with rotate 90 make?',
        blocks: ['pen_set_color'],
      },
    ],
  },
  {
    id: 'share-it',
    title: 'Share your game',
    summary: 'Publish your game so other people can play and remix it.',
    level: 'first',
    minutes: 3,
    emoji: '🌍',
    concept: 'Sharing lets other people play your game — and remix it into something new.',
    steps: [
      {
        title: 'Name your game',
        body: 'Give it a title that tells people what it is.',
      },
      {
        title: 'Hit Share',
        body: 'Click Share in the top bar, then "Share publicly". Your game appears in Explore.',
        hint: 'Share button, top right',
      },
      {
        title: 'Try a remix',
        body: "Go to Explore, open someone else's game and hit Remix. You get your own copy to change however you like — the original stays safe.",
        hint: 'Explore, in the nav',
      },
    ],
  },
];

export function getTutorial(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}

export const LEVEL_LABELS: Record<TutorialLevel, string> = {
  first: 'Start here',
  easy: 'Easy',
  medium: 'A bit harder',
};

/** Every block referenced across all tutorials, for validation. */
export function referencedBlocks(): string[] {
  const out = new Set<string>();
  for (const t of TUTORIALS) {
    for (const s of t.steps) {
      for (const b of s.blocks ?? []) out.add(b);
    }
  }
  return Array.from(out).sort();
}
