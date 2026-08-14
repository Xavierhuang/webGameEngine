#!/usr/bin/env node
/**
 * Generate the backdrop library as SVG.
 *
 * `scenes.background_image_url` has existed since migration 001 and the player
 * now renders it — but no backdrop images shipped, so the feature was reachable
 * and empty. Scratch ships ~70 backdrops; a 3D game builder with none is a
 * hollow promise.
 *
 * Generated rather than sourced: deterministic, tiny, no licensing question,
 * and regenerable. Same reasoning as tools/metal-starters for the characters.
 *
 * Usage: node tools/backdrops/generate.js [outDir]
 */

const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '..', '..', 'public', 'backdrops');
const W = 1024;
const H = 768;

/** Deterministic PRNG so regenerating produces byte-identical files. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const svg = (body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<defs>${defs}</defs>${body}</svg>\n`;

const linear = (id, from, to, vertical = true) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">` +
  `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;

function clouds(seed, count, opacity = 0.85) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const cx = r() * W;
    const cy = 60 + r() * (H * 0.4);
    const s = 0.6 + r() * 0.9;
    out +=
      `<g opacity="${opacity}" transform="translate(${cx.toFixed(0)} ${cy.toFixed(0)}) scale(${s.toFixed(2)})">` +
      `<ellipse cx="0" cy="0" rx="70" ry="28" fill="#fff"/>` +
      `<ellipse cx="-45" cy="10" rx="45" ry="22" fill="#fff"/>` +
      `<ellipse cx="45" cy="8" rx="50" ry="24" fill="#fff"/></g>`;
  }
  return out;
}

function stars(seed, count) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const cx = (r() * W).toFixed(0);
    const cy = (r() * H).toFixed(0);
    const rad = (0.6 + r() * 1.8).toFixed(2);
    const o = (0.35 + r() * 0.65).toFixed(2);
    out += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#fff" opacity="${o}"/>`;
  }
  return out;
}

/** Rolling hills as stacked bezier bands. */
function hills(seed, colors) {
  const r = rng(seed);
  let out = '';
  colors.forEach((color, layer) => {
    const base = H * (0.55 + layer * 0.13);
    const amp = 60 - layer * 12;
    let d = `M0 ${base}`;
    for (let x = 0; x <= W; x += W / 4) {
      d += ` Q ${x + W / 8} ${base - amp * (0.4 + r())} ${x + W / 4} ${base}`;
    }
    d += ` L${W} ${H} L0 ${H} Z`;
    out += `<path d="${d}" fill="${color}"/>`;
  });
  return out;
}

const BACKDROPS = [
  {
    id: 'blue-sky',
    name: 'Blue Sky',
    category: 'outdoor',
    build: () => svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>${clouds(7, 6)}`,
      linear('g', '#7EC8F5', '#DFF3FF')
    ),
  },
  {
    id: 'sunset',
    name: 'Sunset',
    category: 'outdoor',
    build: () => svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
      `<circle cx="${W * 0.5}" cy="${H * 0.62}" r="110" fill="#FFD08A" opacity="0.95"/>` +
      clouds(19, 4, 0.5),
      linear('g', '#2B3A67', '#FF9E6B')
    ),
  },
  {
    id: 'green-hills',
    name: 'Green Hills',
    category: 'outdoor',
    build: () => svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>${clouds(3, 5)}` +
      hills(11, ['#7FC96B', '#5FAF52', '#3F8F3C']),
      linear('g', '#8FD8FF', '#E6F7FF')
    ),
  },
  {
    id: 'night-sky',
    name: 'Night Sky',
    category: 'space',
    build: () => svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>${stars(5, 220)}` +
      `<circle cx="${W * 0.78}" cy="${H * 0.22}" r="52" fill="#F4F1E4"/>` +
      `<circle cx="${W * 0.75}" cy="${H * 0.20}" r="52" fill="#0B1026" opacity="0.55"/>`,
      linear('g', '#070B1F', '#22306B')
    ),
  },
  {
    id: 'outer-space',
    name: 'Outer Space',
    category: 'space',
    build: () => svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>${stars(23, 320)}` +
      `<ellipse cx="${W * 0.3}" cy="${H * 0.4}" rx="240" ry="120" fill="#7B4BC9" opacity="0.22"/>` +
      `<ellipse cx="${W * 0.7}" cy="${H * 0.6}" rx="200" ry="100" fill="#3AA6C9" opacity="0.18"/>`,
      linear('g', '#04030F', '#160E33')
    ),
  },
  {
    id: 'underwater',
    name: 'Underwater',
    category: 'water',
    build: () => {
      const r = rng(31);
      let bubbles = '';
      for (let i = 0; i < 40; i++) {
        bubbles += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(2 + r() * 7).toFixed(1)}" fill="#fff" opacity="${(0.1 + r() * 0.3).toFixed(2)}"/>`;
      }
      return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>${bubbles}`, linear('g', '#0B4F73', '#27A3C9'));
    },
  },
  {
    id: 'beach',
    name: 'Beach',
    category: 'outdoor',
    build: () => svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>${clouds(41, 4)}` +
      `<rect y="${H * 0.58}" width="${W}" height="${H * 0.18}" fill="#2FA8D6"/>` +
      `<rect y="${H * 0.76}" width="${W}" height="${H * 0.24}" fill="#EBD9A8"/>`,
      linear('g', '#79D2F5', '#DFF6FF')
    ),
  },
  {
    id: 'desert',
    name: 'Desert',
    category: 'outdoor',
    build: () => svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
      `<circle cx="${W * 0.8}" cy="${H * 0.2}" r="60" fill="#FFE9A8"/>` +
      hills(13, ['#E8C579', '#D6A94F']),
      linear('g', '#F7C56B', '#FFF0C9')
    ),
  },
  {
    id: 'snow',
    name: 'Snowy',
    category: 'outdoor',
    build: () => {
      const r = rng(53);
      let flakes = '';
      for (let i = 0; i < 120; i++) {
        flakes += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(1 + r() * 2.5).toFixed(1)}" fill="#fff" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`;
      }
      return svg(
        `<rect width="${W}" height="${H}" fill="url(#g)"/>` + hills(17, ['#E8F4FF', '#D2E7F7']) + flakes,
        linear('g', '#9FC4E0', '#E8F4FF')
      );
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    category: 'outdoor',
    build: () => {
      const r = rng(61);
      let trees = '';
      for (let i = 0; i < 22; i++) {
        const x = r() * W;
        const scale = 0.7 + r() * 0.8;
        const y = H * 0.62 + r() * H * 0.25;
        trees +=
          `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${scale.toFixed(2)})">` +
          `<rect x="-6" y="-10" width="12" height="60" fill="#6B4A2F"/>` +
          `<polygon points="0,-110 -46,-10 46,-10" fill="#2F7A45"/>` +
          `<polygon points="0,-150 -36,-60 36,-60" fill="#3B9155"/></g>`;
      }
      return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>${trees}`, linear('g', '#BFE3C4', '#EAF7EC'));
    },
  },
  {
    id: 'city',
    name: 'City',
    category: 'indoor',
    build: () => {
      const r = rng(71);
      let build = '';
      for (let x = 0; x < W; x += 54) {
        const h = 120 + r() * 320;
        build += `<rect x="${x}" y="${(H - h).toFixed(0)}" width="46" height="${h.toFixed(0)}" fill="#3A4A66"/>`;
        for (let wy = H - h + 14; wy < H - 20; wy += 30) {
          for (let wx = x + 8; wx < x + 40; wx += 16) {
            if (r() > 0.45) build += `<rect x="${wx}" y="${wy.toFixed(0)}" width="8" height="12" fill="#FFDD8A" opacity="0.85"/>`;
          }
        }
      }
      return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>${stars(83, 90)}${build}`, linear('g', '#141C33', '#4A3C6B'));
    },
  },
  {
    id: 'room',
    name: 'Room',
    category: 'indoor',
    build: () => svg(
      `<rect width="${W}" height="${H}" fill="#E8DCC8"/>` +
      `<rect y="${H * 0.7}" width="${W}" height="${H * 0.3}" fill="#A9784F"/>` +
      `<rect x="${W * 0.62}" y="${H * 0.18}" width="220" height="170" rx="8" fill="#9FD8F2" stroke="#fff" stroke-width="12"/>` +
      `<rect x="${W * 0.1}" y="${H * 0.3}" width="150" height="220" rx="6" fill="#C9A46B"/>`
    ),
  },
  {
    id: 'castle',
    name: 'Castle',
    category: 'fantasy',
    build: () => svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>${clouds(97, 3, 0.55)}` +
      `<rect x="${W * 0.3}" y="${H * 0.42}" width="${W * 0.4}" height="${H * 0.58}" fill="#8C93A8"/>` +
      `<rect x="${W * 0.24}" y="${H * 0.32}" width="70" height="${H * 0.68}" fill="#767D93"/>` +
      `<rect x="${W * 0.68}" y="${H * 0.32}" width="70" height="${H * 0.68}" fill="#767D93"/>` +
      `<polygon points="${W * 0.24},${H * 0.32} ${W * 0.24 + 35},${H * 0.2} ${W * 0.24 + 70},${H * 0.32}" fill="#B4506B"/>` +
      `<polygon points="${W * 0.68},${H * 0.32} ${W * 0.68 + 35},${H * 0.2} ${W * 0.68 + 70},${H * 0.32}" fill="#B4506B"/>`,
      linear('g', '#8FB8E8', '#E4F0FF')
    ),
  },
  {
    id: 'cave',
    name: 'Cave',
    category: 'fantasy',
    build: () => {
      const r = rng(103);
      let spikes = '';
      for (let x = 0; x < W; x += 46) {
        const h = 50 + r() * 110;
        spikes += `<polygon points="${x},0 ${x + 23},${h.toFixed(0)} ${x + 46},0" fill="#2A2436"/>`;
        const bh = 40 + r() * 100;
        spikes += `<polygon points="${x},${H} ${x + 23},${(H - bh).toFixed(0)} ${x + 46},${H}" fill="#2A2436"/>`;
      }
      return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>${spikes}`, linear('g', '#1B1726', '#4A3F5E'));
    },
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    category: 'abstract',
    build: () => {
      const bands = ['#FF6B6B', '#FFA96B', '#FFE66B', '#6BD98A', '#6BC5FF', '#9B6BFF'];
      let arcs = '';
      bands.forEach((c, i) => {
        arcs += `<circle cx="${W / 2}" cy="${H * 1.05}" r="${420 - i * 42}" fill="none" stroke="${c}" stroke-width="40" opacity="0.85"/>`;
      });
      return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>${arcs}`, linear('g', '#CFF0FF', '#FFFFFF'));
    },
  },
  {
    id: 'grid',
    name: 'Grid',
    category: 'abstract',
    build: () => {
      let lines = '';
      for (let x = 0; x <= W; x += 64) lines += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#fff" stroke-width="2" opacity="0.25"/>`;
      for (let y = 0; y <= H; y += 64) lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#fff" stroke-width="2" opacity="0.25"/>`;
      return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>${lines}`, linear('g', '#3A2E6B', '#6B4BA8'));
    },
  },
];

fs.mkdirSync(OUT, { recursive: true });

const manifest = [];
for (const b of BACKDROPS) {
  const file = `${b.id}.svg`;
  fs.writeFileSync(path.join(OUT, file), b.build(), 'utf8');
  manifest.push({ id: b.id, name: b.name, category: b.category, url: `/backdrops/${file}` });
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Wrote ${manifest.length} backdrops to ${OUT}`);
