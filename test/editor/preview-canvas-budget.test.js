const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PreviewCanvasBudget,
  PreviewCanvasLeaseController,
  selectorPreviewCanvasBudget,
} = require('../.build/components/editor/previewCanvasBudget.js');

function createFakeScheduler() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();

  return {
    scheduler: {
      schedule(callback, delayMs) {
        const id = nextId++;
        pending.set(id, { callback, deadline: now + delayMs });
        return () => pending.delete(id);
      },
    },
    advanceBy(milliseconds) {
      now += milliseconds;
      let ranTask = true;
      while (ranTask) {
        ranTask = false;
        for (const [id, task] of [...pending.entries()]) {
          if (task.deadline > now) continue;
          pending.delete(id);
          task.callback();
          ranTask = true;
        }
      }
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

function createBudget(options = {}) {
  const clock = createFakeScheduler();
  const budget = new PreviewCanvasBudget({
    maximum: 4,
    reservedModelSlots: 1,
    retirementGraceMs: 650,
    scheduler: clock.scheduler,
    ...options,
  });
  return { budget, clock };
}

test('shared selector budget leaves room for the editor renderer', () => {
  assert.equal(selectorPreviewCanvasBudget.capacity, 6);
});

test('primitive previews stop at their reserved allowance', () => {
  const { budget } = createBudget();

  assert.equal(budget.acquire('hero', 'primitive'), true);
  assert.equal(budget.acquire('knight', 'primitive'), true);
  assert.equal(budget.acquire('wizard', 'primitive'), true);
  assert.equal(budget.acquire('robot', 'primitive'), false);
  assert.equal(budget.size, 3);
});

test('released contexts count against capacity until their retirement completes', () => {
  const { budget, clock } = createBudget({ maximum: 2, reservedModelSlots: 1 });

  assert.equal(budget.acquire('hero', 'primitive'), true);
  budget.release('hero');

  assert.equal(budget.activeSize, 0);
  assert.equal(budget.retiringSize, 1);
  assert.equal(budget.size, 1);
  assert.equal(budget.acquire('wizard', 'primitive'), false);
  clock.advanceBy(649);
  assert.equal(budget.acquire('wizard', 'primitive'), false);
  clock.advanceBy(1);
  assert.equal(budget.acquire('wizard', 'primitive'), true);
  assert.equal(budget.size, 1);
});

test('a visible waiter acquires only after the released context retires', () => {
  const { budget, clock } = createBudget({ maximum: 2, reservedModelSlots: 1 });
  const hero = new PreviewCanvasLeaseController({ id: 'hero', kind: 'primitive', budget });
  const wizard = new PreviewCanvasLeaseController({ id: 'wizard', kind: 'primitive', budget });

  hero.setVisible(true);
  wizard.setVisible(true);
  hero.setVisible(false);

  assert.equal(hero.hasCanvas, false);
  assert.equal(wizard.hasCanvas, false);
  assert.equal(budget.size, 1);
  clock.advanceBy(650);
  assert.equal(wizard.hasCanvas, true);
  assert.equal(budget.size, 1);

  hero.dispose();
  wizard.dispose();
  clock.advanceBy(650);
});

test('reserves a preview slot for the dragon model after primitives fill their allowance', () => {
  const { budget } = createBudget();

  assert.equal(budget.acquire('hero', 'primitive'), true);
  assert.equal(budget.acquire('knight', 'primitive'), true);
  assert.equal(budget.acquire('wizard', 'primitive'), true);
  assert.equal(budget.acquire('robot', 'primitive'), false);
  assert.equal(budget.acquire('red-metal-dragon', 'model'), true);
  assert.equal(budget.size, 4);
});

test('model-first allocation does not strand primitive capacity', () => {
  const { budget } = createBudget();

  assert.equal(budget.acquire('red-metal-dragon', 'model'), true);
  assert.equal(budget.acquire('hero', 'primitive'), true);
  assert.equal(budget.acquire('knight', 'primitive'), true);
  assert.equal(budget.acquire('wizard', 'primitive'), true);
  assert.equal(budget.acquire('robot', 'primitive'), false);
  assert.equal(budget.size, 4);
});

test('rapid close and reopen never exceeds active plus retiring capacity', () => {
  const { budget, clock } = createBudget({ maximum: 1, reservedModelSlots: 0 });
  const hero = new PreviewCanvasLeaseController({ id: 'hero', kind: 'primitive', budget });

  hero.setVisible(true);
  assert.equal(budget.size, 1);
  hero.setVisible(false);
  hero.setVisible(true);

  assert.equal(hero.hasCanvas, false);
  assert.equal(budget.activeSize, 0);
  assert.equal(budget.retiringSize, 1);
  assert.equal(budget.size, 1);
  clock.advanceBy(650);
  assert.equal(hero.hasCanvas, true);
  assert.equal(budget.activeSize, 1);
  assert.equal(budget.retiringSize, 0);
  assert.equal(budget.size, 1);

  hero.dispose();
  clock.advanceBy(650);
});

test('controller disposal releases once and leaves no timer or listener effects', () => {
  const { budget, clock } = createBudget({ maximum: 2, reservedModelSlots: 1 });
  const states = [];
  const dragon = new PreviewCanvasLeaseController({
    id: 'red-metal-dragon',
    kind: 'model',
    budget,
    onLeaseChange: (hasCanvas) => states.push(hasCanvas),
  });

  dragon.setVisible(true);
  dragon.dispose();
  dragon.dispose();
  dragon.setVisible(true);
  const statesAfterDispose = [...states];

  assert.equal(clock.pendingCount, 1);
  clock.advanceBy(650);
  assert.equal(clock.pendingCount, 0);
  budget.acquire('hero', 'primitive');
  assert.equal(dragon.hasCanvas, false);
  assert.deepEqual(states, statesAfterDispose);
});
