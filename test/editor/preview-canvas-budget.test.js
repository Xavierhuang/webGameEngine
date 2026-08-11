const assert = require('node:assert/strict');
const test = require('node:test');

const { PreviewCanvasBudget, PreviewCanvasLeaseController } = require('../.build/components/editor/previewCanvasBudget.js');

test('never allocates more preview canvases than its hard maximum', () => {
  const budget = new PreviewCanvasBudget({ maximum: 4, reservedModelSlots: 1 });

  assert.equal(budget.acquire('hero', 'primitive'), true);
  assert.equal(budget.acquire('knight', 'primitive'), true);
  assert.equal(budget.acquire('wizard', 'primitive'), true);
  assert.equal(budget.acquire('robot', 'primitive'), false);
  assert.equal(budget.size, 3);
});

test('releases an invisible preview slot so a waiting tile can acquire it', () => {
  const budget = new PreviewCanvasBudget({ maximum: 3, reservedModelSlots: 1 });

  assert.equal(budget.acquire('hero', 'primitive'), true);
  assert.equal(budget.acquire('knight', 'primitive'), true);
  assert.equal(budget.acquire('wizard', 'primitive'), false);
  budget.release('hero');

  assert.equal(budget.has('hero'), false);
  assert.equal(budget.acquire('wizard', 'primitive'), true);
  assert.equal(budget.size, 2);
});

test('budget notifies a waiting lease when a slot is released', () => {
  const budget = new PreviewCanvasBudget({ maximum: 2, reservedModelSlots: 1 });
  let wizardHasCanvas = false;

  assert.equal(budget.acquire('hero', 'primitive'), true);
  const unsubscribe = budget.subscribe(() => {
    if (!wizardHasCanvas) wizardHasCanvas = budget.acquire('wizard', 'primitive');
  });

  budget.release('hero');

  assert.equal(wizardHasCanvas, true);
  assert.equal(budget.has('wizard'), true);
  unsubscribe();
});

test('reserves a preview slot for the dragon model after primitive tiles fill their allowance', () => {
  const budget = new PreviewCanvasBudget({ maximum: 4, reservedModelSlots: 1 });

  assert.equal(budget.acquire('hero', 'primitive'), true);
  assert.equal(budget.acquire('knight', 'primitive'), true);
  assert.equal(budget.acquire('wizard', 'primitive'), true);
  assert.equal(budget.acquire('robot', 'primitive'), false);

  assert.equal(budget.acquire('red-metal-dragon', 'model'), true);
  assert.equal(budget.has('red-metal-dragon'), true);
  assert.equal(budget.size, 4);
});

test('lease controller acquires only while visible and hands its slot to a visible waiter', () => {
  const budget = new PreviewCanvasBudget({ maximum: 2, reservedModelSlots: 1 });
  const hero = new PreviewCanvasLeaseController({ id: 'hero', kind: 'primitive', budget });
  const wizard = new PreviewCanvasLeaseController({ id: 'wizard', kind: 'primitive', budget });

  hero.setVisible(true);
  wizard.setVisible(true);

  assert.equal(hero.hasCanvas, true);
  assert.equal(wizard.hasCanvas, false);

  hero.setVisible(false);

  assert.equal(hero.hasCanvas, false);
  assert.equal(wizard.hasCanvas, true);
  hero.dispose();
  wizard.dispose();
});

test('lease controller releases its canvas and ignores future notifications after dispose', () => {
  const budget = new PreviewCanvasBudget({ maximum: 2, reservedModelSlots: 1 });
  const states = [];
  const dragon = new PreviewCanvasLeaseController({
    id: 'red-metal-dragon',
    kind: 'model',
    budget,
    onLeaseChange: (hasCanvas) => states.push(hasCanvas),
  });

  dragon.setVisible(true);
  dragon.dispose();
  const statesAfterDispose = [...states];
  budget.acquire('hero', 'primitive');

  assert.equal(dragon.hasCanvas, false);
  assert.equal(budget.has('red-metal-dragon'), false);
  assert.deepEqual(states, statesAfterDispose);
});
