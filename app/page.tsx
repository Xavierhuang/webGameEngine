import Link from 'next/link';
import {
  Sparkles,
  Boxes,
  Play,
  ArrowRight,
  Github,
  Shield,
  Wand2,
  Layers,
  Bot,
  Users,
} from 'lucide-react';
import { AppNav, LogoMark } from '@/components/common/AppNav';
import { PALETTE } from '@/components/common/design';
import { getTranslator } from '@/lib/i18n/server';
import type { MessageKey } from '@/lib/i18n/messages';

type T = (key: MessageKey) => string;

export default async function Home() {
  const t = await getTranslator();
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <AppNav />
      <Hero t={t} />
      <BlockCategoriesSection t={t} />
      <ThreeDimensionalSection t={t} />
      <AISection t={t} />
      <GallerySection t={t} />
      <SafetyBar t={t} />
      <Footer t={t} />
    </main>
  );
}

// -----------------------------------------------------------------------------
// Hero
// -----------------------------------------------------------------------------

function Hero({ t }: { t: T }) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(76,151,255,0.18), transparent 60%),' +
            'radial-gradient(ellipse 60% 50% at 90% 30%, rgba(255,107,53,0.14), transparent 60%),' +
            'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(153,102,255,0.12), transparent 60%)',
        }}
      />
      <div className="max-w-7xl mx-auto px-6 pt-12 pb-16 md:pt-24 md:pb-28 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 backdrop-blur px-3 py-1 text-xs font-medium text-slate-600 mb-6">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: PALETTE.ai }}
            />
            {t('home.hero.badge')}
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.05] tracking-tight text-slate-900">
            {t('home.hero.title.line1')}<br />
            {t('home.hero.title.line2')}<br />
            {t('home.hero.title.line3')}
          </h1>
          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-xl">
            {t('home.hero.subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/worlds/new"
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-6 py-3 text-base shadow-lg shadow-slate-900/10 transition"
            >
              <Sparkles className="w-4 h-4" />
              {t('home.hero.cta.createWorld')}
            </Link>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-800 transition hover:border-slate-300"
            >
              <Play className="w-4 h-4" />
              {t('home.hero.cta.blankGame')}
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 font-semibold rounded-full px-6 py-3 text-base transition"
            >
              {t('home.hero.cta.explore')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="mt-10 flex items-center gap-6 text-sm text-slate-500">
            <StatPill value="90+" label={t('home.hero.stats.blocks')} />
            <StatPill value="12" label={t('home.hero.stats.categories')} />
            <StatPill value="3D" label={t('home.hero.stats.native')} />
          </div>
        </div>
        <div className="lg:col-span-6">
          <EditorPreview t={t} />
        </div>
      </div>
    </section>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-black text-slate-900">{value}</span>
      <span>{label}</span>
    </div>
  );
}

// A stylized preview of the editor — palette on the left, block stack in the
// middle, 3D scene on the right. Pure CSS, no runtime.
function EditorPreview({ t }: { t: T }) {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-blue-100/50 via-purple-100/40 to-orange-100/40 blur-2xl" />
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
        <div className="flex items-center gap-1.5 px-4 h-9 border-b border-slate-200 bg-slate-50">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="ml-3 text-xs text-slate-500 font-medium">
            {t('home.preview.editorName')}
          </span>
        </div>
        <div className="grid grid-cols-12 h-[340px] sm:h-[380px]">
          {/* Palette — hidden on very small screens, room-savers on tablet */}
          <div className="hidden sm:block col-span-3 border-r border-slate-200 bg-slate-50 py-3 px-2 space-y-1 text-[10px] font-semibold">
            <PaletteChip color={PALETTE.motion} label="Motion" />
            <PaletteChip color={PALETTE.looks} label="Looks" />
            <PaletteChip color={PALETTE.sound} label="Sound" />
            <PaletteChip color={PALETTE.events} label="Events" />
            <PaletteChip color={PALETTE.control} label="Control" />
            <PaletteChip color={PALETTE.ai} label="AI" active />
            <PaletteChip color={PALETTE.sensing} label="Sensing" />
            <PaletteChip color={PALETTE.operators} label="Ops" />
            <PaletteChip color={PALETTE.variables} label="Vars" />
          </div>
          {/* Block stack */}
          <div className="col-span-6 sm:col-span-5 p-3 space-y-1.5 overflow-hidden">
            <FakeBlock color={PALETTE.events} shape="hat" text="when game starts" />
            <FakeBlock color={PALETTE.looks} text="say Hello for 2 secs" />
            <FakeBlock color={PALETTE.control} shape="c-open" text="forever" />
            <FakeBlock color={PALETTE.motion} nested text="move  forward  200" />
            <FakeBlock color={PALETTE.control} shape="c-open" nested text="if  touching  Wall  then" />
            <FakeBlock color={PALETTE.motion} nestedDeep text="rotate  y  180" />
            <FakeBlock color={PALETTE.control} shape="c-close" nested text="end" />
            <FakeBlock color={PALETTE.ai} nested text="ask AI  next move  into  plan" />
            <FakeBlock color={PALETTE.control} shape="c-close" text="end" />
          </div>
          {/* 3D scene */}
          <div className="col-span-6 sm:col-span-4 relative bg-gradient-to-b from-sky-100 to-emerald-100">
            <ScenePreview t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PaletteChip({
  color,
  label,
  active,
}: {
  color: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${active ? 'bg-white shadow-sm' : ''}`}
    >
      <span
        className="inline-block w-3 h-3 rounded-full"
        style={{ background: color }}
      />
      <span className="text-slate-700">{label}</span>
    </div>
  );
}

function FakeBlock({
  color,
  text,
  shape,
  nested,
  nestedDeep,
}: {
  color: string;
  text: string;
  shape?: 'hat' | 'c-open' | 'c-close';
  nested?: boolean;
  nestedDeep?: boolean;
}) {
  const indent = nestedDeep ? 'ml-8' : nested ? 'ml-4' : '';
  const radiusTop = shape === 'hat' ? 'rounded-t-2xl rounded-b-md' : 'rounded-md';
  return (
    <div
      className={`relative ${indent} ${radiusTop} text-white text-[11px] font-semibold px-2.5 py-1.5 shadow-sm`}
      style={{
        background: color,
        boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(0,0,0,0.06)',
      }}
    >
      {text}
    </div>
  );
}

function ScenePreview({ t }: { t: T }) {
  return (
    <>
      {/* Sun */}
      <div className="absolute top-3 right-4 w-8 h-8 rounded-full bg-yellow-300 shadow-[0_0_20px_rgba(253,224,71,0.6)]" />
      {/* Ground plane */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-emerald-400 to-emerald-300" />
      {/* Character (front-facing rounded cube) */}
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 w-12 h-12 rounded-lg bg-red-400 shadow-lg rotate-12" />
      {/* Coin */}
      <div className="absolute bottom-24 right-6 w-4 h-4 rounded-full bg-yellow-400 shadow" />
      {/* Speech bubble */}
      <div className="absolute top-8 left-4 bg-white text-slate-800 text-[10px] font-semibold rounded-lg px-2 py-1 shadow-md border border-slate-200">
        {t('home.preview.speech')}
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Block categories (proof of language surface)
// -----------------------------------------------------------------------------

const CATEGORIES: { name: string; color: string; count: number; sample: string }[] = [
  { name: 'Motion', color: PALETTE.motion, count: 12, sample: 'go to x  y  z' },
  { name: 'Looks', color: PALETTE.looks, count: 11, sample: 'say Hello for 2 secs' },
  { name: 'Sound', color: PALETTE.sound, count: 1, sample: 'play sound click' },
  { name: 'Events', color: PALETTE.events, count: 8, sample: 'when this clicked' },
  { name: 'Control', color: PALETTE.control, count: 7, sample: 'repeat 10' },
  { name: 'AI', color: PALETTE.ai, count: 2, sample: 'ask AI  next move' },
  { name: 'Sensing', color: PALETTE.sensing, count: 13, sample: 'touching Coin ?' },
  { name: 'Operators', color: PALETTE.operators, count: 23, sample: 'random  1  to  10' },
  { name: 'Variables', color: PALETTE.variables, count: 5, sample: 'set score to 0' },
  { name: 'Lists', color: PALETTE.lists, count: 7, sample: 'add apple to inventory' },
  { name: 'Clones', color: PALETTE.clones, count: 2, sample: 'create clone of myself' },
  { name: 'My Blocks', color: PALETTE.myblocks, count: 999, sample: 'define your own' },
];

function BlockCategoriesSection({ t }: { t: T }) {
  return (
    <section className="py-14 sm:py-20 border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader
          eyebrow={t('home.categories.eyebrow')}
          title={t('home.categories.title')}
          copy={t('home.categories.copy')}
        />
        <div className="mt-12 grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {CATEGORIES.map((c) => (
            <CategoryCard key={c.name} {...c} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryCard({
  name,
  color,
  count,
  sample,
}: {
  name: string;
  color: string;
  count: number;
  sample: string;
}) {
  return (
    <div className="group rounded-2xl border border-slate-200 hover:border-slate-300 bg-white p-4 transition hover:shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
          <span className="font-bold text-slate-900">{name}</span>
        </div>
        <span className="text-xs font-mono text-slate-500">
          {count === 999 ? '∞' : count}
        </span>
      </div>
      <div
        className="rounded-md px-2.5 py-1.5 text-white text-[11px] font-semibold shadow-sm"
        style={{
          background: color,
          boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.15)',
        }}
      >
        {sample}
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-slate-900">
        {title}
      </h2>
      <p className="mt-4 text-lg text-slate-600">{copy}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 3D thesis
// -----------------------------------------------------------------------------

function ThreeDimensionalSection({ t }: { t: T }) {
  return (
    <section className="py-14 sm:py-20 bg-slate-50 border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-5">
          <SectionHeader
            eyebrow={t('home.threed.eyebrow')}
            title={t('home.threed.title')}
            copy={t('home.threed.copy')}
          />
          <ul className="mt-8 space-y-3 text-slate-700">
            <FeatureRow icon={<Layers className="w-5 h-5" />} label={t('home.threed.feature.motion')} />
            <FeatureRow icon={<Boxes className="w-5 h-5" />} label={t('home.threed.feature.sensing')} />
            <FeatureRow icon={<Wand2 className="w-5 h-5" />} label={t('home.threed.feature.bubbles')} />
          </ul>
        </div>
        <div className="lg:col-span-7">
          <SceneShowcase t={t} />
        </div>
      </div>
    </section>
  );
}

function FeatureRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white shrink-0"
        style={{ background: PALETTE.motion }}
      >
        {icon}
      </span>
      <span className="pt-1 font-medium">{label}</span>
    </li>
  );
}

function SceneShowcase({ t }: { t: T }) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xl">
      <div className="relative h-[360px] bg-gradient-to-b from-sky-200 via-sky-100 to-emerald-100">
        {/* Sun */}
        <div className="absolute top-6 right-8 w-12 h-12 rounded-full bg-yellow-300 shadow-[0_0_30px_rgba(253,224,71,0.7)]" />
        {/* Cloud */}
        <div className="absolute top-10 left-16 w-20 h-6 rounded-full bg-white/80" />
        <div className="absolute top-14 left-24 w-14 h-5 rounded-full bg-white/70" />
        {/* Ground plane w/ grid perspective */}
        <div
          className="absolute bottom-0 left-0 right-0 h-40"
          style={{
            background:
              'linear-gradient(to top, #34d399 0%, #6ee7b7 100%)',
            transform: 'perspective(500px) rotateX(35deg)',
            transformOrigin: 'bottom',
            backgroundImage:
              'linear-gradient(#059669 1px, transparent 1px), linear-gradient(90deg, #059669 1px, transparent 1px)',
            backgroundSize: '32px 32px, 32px 32px',
          }}
        />
        {/* Character */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-red-400 shadow-xl relative">
            <div className="absolute top-4 left-3 w-2.5 h-2.5 rounded-full bg-white" />
            <div className="absolute top-4 right-3 w-2.5 h-2.5 rounded-full bg-white" />
          </div>
          <div className="w-14 h-1 rounded-full bg-black/20 mt-2 blur-sm" />
        </div>
        {/* Coin */}
        <div className="absolute bottom-32 right-20 w-6 h-6 rounded-full bg-yellow-400 shadow-lg animate-pulse" />
        {/* Enemy */}
        <div className="absolute bottom-28 left-20 w-10 h-10 rounded-full bg-purple-500 shadow-lg" />
        {/* Speech bubble */}
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white text-slate-800 text-xs font-semibold rounded-xl px-3 py-1.5 shadow-md border border-slate-200">
          {t('home.threed.scene.speech')}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// AI section
// -----------------------------------------------------------------------------

function AISection({ t }: { t: T }) {
  return (
    <section className="py-14 sm:py-20">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 order-2 lg:order-1">
          <AIMockup t={t} />
        </div>
        <div className="lg:col-span-5 order-1 lg:order-2">
          <SectionHeader
            eyebrow={t('home.ai.eyebrow')}
            title={t('home.ai.title')}
            copy={t('home.ai.copy')}
          />
          <ul className="mt-8 space-y-3 text-slate-700">
            <FeatureRow icon={<Bot className="w-5 h-5" />} label={t('home.ai.feature.generate')} />
            <FeatureRow icon={<Sparkles className="w-5 h-5" />} label={t('home.ai.feature.runtime')} />
            <FeatureRow icon={<Wand2 className="w-5 h-5" />} label={t('home.ai.feature.safe')} />
          </ul>
        </div>
      </div>
    </section>
  );
}

function AIMockup({ t }: { t: T }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center gap-2 px-4 h-10 border-b border-slate-200 bg-slate-50">
        <Bot className="w-4 h-4" style={{ color: PALETTE.ai }} />
        <span className="text-sm font-semibold">{t('home.ai.mockup.assistantLabel')}</span>
      </div>
      <div className="p-5 space-y-3 bg-gradient-to-br from-orange-50/50 to-white">
        <ChatBubble side="right">{t('home.ai.mockup.user1')}</ChatBubble>
        <ChatBubble side="left">
          <div className="mb-2">{t('home.ai.mockup.assistant1Preamble')}</div>
          <div className="space-y-1.5">
            <FakeBlock color={PALETTE.events} shape="hat" text="when game starts" />
            <FakeBlock color={PALETTE.control} shape="c-open" text="forever" />
            <FakeBlock color={PALETTE.motion} nested text="move  forward  100" />
            <FakeBlock color={PALETTE.control} shape="c-open" nested text="if  touching  Coin  then" />
            <FakeBlock color={PALETTE.variables} nestedDeep text="change  score  by  1" />
            <FakeBlock color={PALETTE.sound} nestedDeep text="play sound coin" />
            <FakeBlock color={PALETTE.control} shape="c-close" nested text="end" />
            <FakeBlock color={PALETTE.control} shape="c-close" text="end" />
          </div>
        </ChatBubble>
        <ChatBubble side="right">{t('home.ai.mockup.user2')}</ChatBubble>
      </div>
    </div>
  );
}

function ChatBubble({ side, children }: { side: 'left' | 'right'; children: React.ReactNode }) {
  const isUser = side === 'right';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
          isUser ? 'bg-slate-900 text-white' : 'bg-white text-slate-800 border border-slate-200'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Gallery
// -----------------------------------------------------------------------------

// These are STARTER IDEAS, not real projects — a real gallery of shared
// projects lands with Phase 6b (community/sharing). Each card takes the user
// to /projects/new so they can build the idea; the prompt is prefilled via
// query params so the create form doesn't feel empty.
const SAMPLE_PROJECTS: {
  titleKey: MessageKey;
  tagKey: MessageKey;
  from: string;
  to: string;
  emoji: string;
  href: string;
}[] = [
  { titleKey: 'home.gallery.project.platformer', tagKey: 'home.gallery.tag.starter',  from: '#4C97FF', to: '#9966FF', emoji: '🏃', href: '/projects/new?genre=platformer' },
  { titleKey: 'home.gallery.project.space',      tagKey: 'home.gallery.tag.physics',  from: '#0F172A', to: '#4C97FF', emoji: '🚀', href: '/projects/new?genre=adventure' },
  { titleKey: 'home.gallery.project.maze',       tagKey: 'home.gallery.tag.aiEnemy',  from: '#FF6B35', to: '#FFBF00', emoji: '🌀', href: '/projects/new?genre=arcade' },
  { titleKey: 'home.gallery.project.fish',       tagKey: 'home.gallery.tag.clones',   from: '#5CB1D6', to: '#59C059', emoji: '🐟', href: '/projects/new?genre=other' },
  { titleKey: 'home.gallery.project.puzzle',     tagKey: 'home.gallery.tag.sensing',  from: '#9966FF', to: '#CF63CF', emoji: '🧩', href: '/projects/new?genre=puzzle' },
  { titleKey: 'home.gallery.project.pet',        tagKey: 'home.gallery.tag.askAi',    from: '#FF6680', to: '#FF6B35', emoji: '🐶', href: '/projects/new?genre=other' },
];

function GallerySection({ t }: { t: T }) {
  return (
    <section className="py-14 sm:py-20 bg-slate-50 border-y border-slate-100" id="learn">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <SectionHeader
            eyebrow={t('home.gallery.eyebrow')}
            title={t('home.gallery.title')}
            copy={t('home.gallery.copy')}
          />
          <Link
            href="/explore"
            className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            {t('home.gallery.browseAll')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SAMPLE_PROJECTS.map((p) => (
            <ProjectCard
              key={p.titleKey}
              title={t(p.titleKey)}
              tag={t(p.tagKey)}
              from={p.from}
              to={p.to}
              emoji={p.emoji}
              href={p.href}
              startLabel={t('home.gallery.startBuildingThisIdea')}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectCard({
  title,
  tag,
  from,
  to,
  emoji,
  href,
  startLabel,
}: {
  title: string;
  tag: string;
  from: string;
  to: string;
  emoji: string;
  href: string;
  startLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl overflow-hidden border border-slate-200 bg-white hover:shadow-xl hover:border-slate-300 transition focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
    >
      <div
        className="h-40 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-6xl drop-shadow-lg group-hover:scale-110 transition-transform">
          {emoji}
        </div>
        <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider bg-white/90 text-slate-700 rounded-full px-2 py-0.5">
          {tag}
        </span>
      </div>
      <div className="p-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{startLabel}</div>
        </div>
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 group-hover:bg-slate-900 group-hover:text-white transition"
          aria-hidden
        >
          <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// Safety bar
// -----------------------------------------------------------------------------

function SafetyBar({ t }: { t: T }) {
  return (
    <section id="safety" className="py-14 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-8 md:p-10 grid md:grid-cols-3 gap-8 items-center">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 mb-2">
              <Shield className="w-4 h-4" />
              {t('home.safety.eyebrow')}
            </div>
            <h3 className="text-2xl font-black text-slate-900">
              {t('home.safety.title')}
            </h3>
            <p className="mt-3 text-slate-600">
              {t('home.safety.copy')}
            </p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-1 gap-3 text-sm">
            <TrustTile label={t('home.safety.tile.moderated')} />
            <TrustTile label={t('home.safety.tile.private')} />
            <TrustTile label={t('home.safety.tile.noChat')} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustTile({ label }: { label: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 font-semibold text-slate-700 text-center">
      {label}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Footer
// -----------------------------------------------------------------------------

function Footer({ t }: { t: T }) {
  const copyright = t('home.footer.copyright').replace('{year}', String(new Date().getFullYear()));
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 font-bold">
            <LogoMark />
            lingplay
          </div>
          <p className="mt-3 text-sm text-slate-600 max-w-xs">
            {t('home.footer.tagline')}
          </p>
        </div>
        <FooterCol title={t('home.footer.col.build')}>
          <FooterLink href="/projects/new">{t('home.footer.link.startProject')}</FooterLink>
          <FooterLink href="/explore">{t('home.footer.link.explore')}</FooterLink>
          <FooterLink href="/auth/signup">{t('home.footer.link.createAccount')}</FooterLink>
        </FooterCol>
        <FooterCol title={t('home.footer.col.learn')}>
          <FooterLink href="#learn">{t('home.footer.link.starters')}</FooterLink>
          <FooterLink href="#safety">{t('home.footer.link.forParents')}</FooterLink>
          <FooterLink href="/auth/login">{t('home.footer.link.signIn')}</FooterLink>
        </FooterCol>
        <FooterCol title={t('home.footer.col.community')}>
          <FooterLink href="https://github.com" external>
            <Github className="w-4 h-4 inline mr-1" />
            {t('home.footer.link.github')}
          </FooterLink>
          <FooterLink href="#safety">
            <Users className="w-4 h-4 inline mr-1" />
            {t('home.footer.link.guidelines')}
          </FooterLink>
        </FooterCol>
      </div>
      <div className="border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6 py-6 text-xs text-slate-500 flex items-center justify-between">
          <span>{copyright}</span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: PALETTE.control }}
            />
            {t('home.footer.status')}
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-bold text-slate-900 mb-3">{title}</div>
      <ul className="space-y-2 text-sm text-slate-600">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  if (external) {
    return (
      <li>
        <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">
          {children}
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link href={href} className="hover:text-slate-900">
        {children}
      </Link>
    </li>
  );
}
