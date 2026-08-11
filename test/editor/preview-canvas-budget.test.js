const assert = require('node:assert/strict');
const test = require('node:test');

const { PreviewCanvasBudget } = require('../.build/components/editor/previewCanvasBudget.js');

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

test('notifies a waiting visible tile when an unmounted preview releases its lease', () => {
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
