import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ShapePreviewModule from '../.build/components/editor/ShapePreview.js';

const ShapePreview = ShapePreviewModule.default ?? ShapePreviewModule;

let failures = 0;

function ok(condition, label) {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL ${label}`);
  }
}

const shapes = ['box', 'sphere', 'cylinder', 'cone', 'pyramid', 'torus', 'capsule'];

for (const shape of shapes) {
  const markup = renderToStaticMarkup(
    React.createElement(ShapePreview, { shape, color: '#FACC15' }),
  );

  ok(markup.includes('<svg'), `${shape} renders a lightweight SVG preview`);
  ok(!markup.includes('<canvas'), `${shape} does not allocate a WebGL canvas`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
