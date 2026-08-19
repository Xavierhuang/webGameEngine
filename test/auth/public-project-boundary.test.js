const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');

test('project page gates the displayed parent in the parent join itself', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app/projects/[id]/page.tsx'), 'utf8');
  const projectQuery = source.match(/const project = await queryOne[\s\S]*?\n\s*\[id\]\n\s*\);/)?.[0] ?? '';

  assert.match(projectQuery, /LEFT JOIN projects parent\s+ON parent\.id = p\.remixed_from/);
  assert.match(projectQuery, /parent\.visibility = 'public'/);
  assert.match(projectQuery, /parent\.moderation_status = 'published'/);
});

test('hidden parents clear both the parent DTO and raw remixed_from lineage', () => {
  const { toPublicProjectListItem } = require('../.build/lib/auth/publicProjectListItem');
  const base = {
    id: 'child',
    title: 'Child',
    description: null,
    thumbnail_url: null,
    genre: null,
    created_at: new Date('2026-08-18T00:00:00Z'),
    updated_at: new Date('2026-08-18T00:00:00Z'),
    play_count: 0,
    like_count: 0,
    remix_count: 0,
    remixed_from: 'private-parent',
    visibility: 'public',
    moderation_status: 'published',
    author_username: 'maker',
    author_name: 'Maker',
    author_avatar_url: null,
  };

  const hidden = toPublicProjectListItem({
    ...base,
    parent_id: null,
    parent_title: null,
  });
  assert.equal(hidden.remixed_from, null);
  assert.equal(hidden.parent, null);

  const visible = toPublicProjectListItem({
    ...base,
    parent_id: 'public-parent',
    parent_title: 'Visible parent',
  });
  assert.equal(visible.remixed_from, 'public-parent');
  assert.deepEqual(visible.parent, { id: 'public-parent', title: 'Visible parent' });
});
