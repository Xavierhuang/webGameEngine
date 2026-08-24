import assert from 'node:assert/strict';
import Module from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { act } from 'react';
import { JSDOM } from 'jsdom';

import WorldTemplateCardModule from '../.build/components/worlds/WorldTemplateCard.js';

const WorldTemplateCard = WorldTemplateCardModule.default ?? WorldTemplateCardModule;

const templates = [
  ['platformer', 'Sky Steps'],
  ['obby', 'Rainbow Run'],
  ['racing', 'Turbo Track'],
  ['story', 'Castle Story'],
  ['pet', 'Happy Pet Park'],
].map(([id, title]) => ({
  id,
  version: 1,
  title,
  description: `A safe ${title} starter world.`,
  genre: 'Adventure',
  cardArt: '/backdrops/blue-sky.svg',
  missions: [{ id: `${id}-mission-1` }, { id: `${id}-mission-2` }, { id: `${id}-mission-3` }],
}));

for (const template of templates) {
  const markup = renderToStaticMarkup(
    React.createElement(WorldTemplateCard, {
      template,
      selected: template.id === 'platformer',
      onSelect: () => {},
    }),
  );

  assert.match(markup, new RegExp(`<button[^>]*aria-label="Choose ${template.title}"`), `${template.id} has a named choice button`);
  assert.match(markup, new RegExp(`id="${template.id}-description"`), `${template.id} has an accessible description`);
  assert.match(markup, new RegExp(`aria-describedby="${template.id}-description"`), `${template.id} names its description`);
  assert.match(markup, new RegExp(`id="${template.id}-description"[^>]*>[\\s\\S]*${template.title}[\\s\\S]*${template.description}[\\s\\S]*Adventure[\\s\\S]*3 missions`), `${template.id} accessible description includes the full card summary`);
  assert.equal((markup.match(new RegExp(`id="${template.id}-description"`, 'g')) ?? []).length, 1, `${template.id} has one description target`);
  assert.match(markup, /Adventure/, `${template.id} shows its genre`);
  assert.match(markup, /3 missions/, `${template.id} shows its mission count`);
  assert.doesNotMatch(markup, /<button[^>]*>[\s\S]*<(?:div|h2|p)\b/, `${template.id} keeps card content outside its native button`);
  assert.doesNotMatch(markup, /https?:\/\//, `${template.id} does not render external artwork`);
}

const selectedMarkup = renderToStaticMarkup(
  React.createElement(WorldTemplateCard, {
    template: templates[0],
    selected: true,
    onSelect: () => {},
  }),
);
assert.match(selectedMarkup, /aria-pressed="true"/, 'the selected card exposes its selected state');

const DOM = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/worlds/new' });
Object.assign(globalThis, {
  window: DOM.window,
  document: DOM.window.document,
  HTMLElement: DOM.window.HTMLElement,
  Event: DOM.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: DOM.window.navigator });
DOM.window.HTMLElement.prototype.attachEvent = () => {};
DOM.window.HTMLElement.prototype.detachEvent = () => {};
const { createRoot } = await import('react-dom/client');

const originalLoad = Module._load;
let pushedTo = null;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/auth/guestSessionClient') return { ensureGuestSession: async () => {} };
  if (request === '@/components/common/LocaleProvider') {
    return {
      useTranslator: () => (key) => ({
        'worlds.error.catalog': 'Could not load starter worlds.',
        'worlds.error.create': 'Could not create your world.',
        'worlds.eyebrow': 'World Builder',
        'worlds.title': 'Create a World',
        'worlds.subtitle': 'Choose a starter world.',
        'worlds.loading': 'Loading',
        'worlds.chooseTemplate': 'Choose a starter world',
        'worlds.card.choose': 'Choose',
        'worlds.card.missions': '{count} missions',
        'worlds.field.title': 'World title',
        'worlds.field.titlePlaceholder': 'My amazing world',
        'worlds.field.description': 'Description (optional)',
        'worlds.field.descriptionPlaceholder': 'What happens?',
        'worlds.privateDraft': 'Your world starts private.',
        'worlds.create': 'Create a World',
        'worlds.createLoading': 'Creating your world…',
      })[key] ?? key,
    };
  }
  if (request === 'next/navigation') return { useRouter: () => ({ push: (url) => { pushedTo = url; } }) };
  return originalLoad(request, parent, isMain);
};

let WorldTemplatePicker;
try {
  const pickerModule = await import('../.build/components/worlds/WorldTemplatePicker.js');
  WorldTemplatePicker = pickerModule.default?.default ?? pickerModule.default ?? pickerModule;
} finally {
  Module._load = originalLoad;
}

const root = createRoot(document.getElementById('root'));
let createRequestBody = null;
globalThis.fetch = async (url, options) => {
  if (url === '/api/world-templates') return new Response(JSON.stringify({ templates }), { status: 200 });
  if (url === '/api/worlds/create') {
    createRequestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ error: 'The server is taking a nap.' }), { status: 500 });
  }
  throw new Error(`Unexpected request: ${url}`);
};

await act(async () => {
  root.render(React.createElement(WorldTemplatePicker));
});
await act(async () => {});

const submit = () => document.querySelector('button[type="submit"]');
assert.equal(submit().disabled, true, 'submit is disabled before a template and title are selected');

await act(async () => {
  document.querySelector('button[aria-label="Choose Sky Steps"]').click();
});
assert.equal(submit().disabled, true, 'submit remains disabled until the title is filled');

const titleInput = document.querySelector('input');
await act(async () => {
  titleInput.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(titleInput, 'My Sky Adventure');
  titleInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  titleInput.dispatchEvent(new window.Event('change', { bubbles: true }));
});
assert.equal(submit().disabled, false, 'submit is enabled once a template and title are selected');

await act(async () => {
  submit().click();
});
assert.deepEqual(createRequestBody, {
  templateId: 'platformer', templateVersion: 1, title: 'My Sky Adventure', description: '',
}, 'creation sends only the narrow world request payload');
assert.equal(document.querySelector('input').value, 'My Sky Adventure', 'a network error keeps the title');
assert.equal(document.querySelector('button[aria-label="Choose Sky Steps"]').getAttribute('aria-pressed'), 'true', 'a network error keeps the selected template');
assert.equal(pushedTo, null, 'a failed create does not navigate away');
await act(async () => {
  root.unmount();
});

console.log('World template picker card tests passed');
