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

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <AppNav />
      <Hero />
      <BlockCategoriesSection />
      <ThreeDimensionalSection />
      <AISection />
      <GallerySection />
      <SafetyBar />
      <Footer />
    </main>
  );
}

// -----------------------------------------------------------------------------
// Hero
// -----------------------------------------------------------------------------

function Hero() {
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
            AI-powered · 3D · Free forever
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.05] tracking-tight text-slate-900">
            Make <span style={{ color: PALETTE.motion }}>3D games</span>.<br />
            With blocks.<br />
            With <span style={{ color: PALETTE.ai }}>AI</span>.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-xl">
            Snap Scratch-style blocks together to build worlds, characters, and games — in
            real 3D. Stuck? Ask the built-in AI and it&apos;ll write the code with you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-6 py-3 text-base shadow-lg shadow-slate-900/10 transition"
            >
              <Play className="w-4 h-4" />
              Start Building
            </Link>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 font-semibold rounded-full px-6 py-3 text-base transition"
            >
              Explore Projects
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="mt-10 flex items-center gap-6 text-sm text-slate-500">
            <StatPill value="90+" label="blocks" />
            <StatPill value="12" label="categories" />
            <StatPill value="3D" label="native" />
          </div>
        </div>
        <div className="lg:col-span-6">
          <EditorPreview />
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
function EditorPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-blue-100/50 via-purple-100/40 to-orange-100/40 blur-2xl" />
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
        <div className="flex items-center gap-1.5 px-4 h-9 border-b border-slate-200 bg-slate-50">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="ml-3 text-xs text-slate-500 font-medium">
            lingplay editor · Space Explorer
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
          <div className="col-span-7 sm:col-span-5 p-3 sm:p-4 space-y-1.5 bg-white overflow-hidden">
            <FakeBlock color={PALETTE.events} shape="hat" text="when game starts" />
            <FakeBlock color={PALETTE.looks} text="say  Hello!  for  2  secs" />
            <FakeBlock color={PALETTE.control} shape="c-open" text="forever" />
            <FakeBlock color={PALETTE.motion} nested text="move  forward  200" />
            <FakeBlock color={PALETTE.control} shape="c-open" nested text="if  touching  Wall  then" />
            <FakeBlock color={PALETTE.motion} nestedDeep text="rotate y 180" />
            <FakeBlock color={PALETTE.control} shape="c-close" nested text="end" />
            <FakeBlock color={PALETTE.ai} nested text="ask AI  next move  into  plan" />
            <FakeBlock color={PALETTE.control} shape="c-close" text="end" />
          </div>
          {/* 3D scene */}
          <div className="col-span-5 sm:col-span-4 relative bg-gradient-to-b from-sky-200 via-sky-100 to-emerald-100 overflow-hidden">
            <ScenePreview />
          </div>
        </div>
      </div>
    </div>
  );
}

function PaletteChip({ color, label, active }: { color: string; label: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${active ? 'bg-white shadow-sm ring-1 ring-slate-200' : ''}`}
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

function ScenePreview() {
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
        Hello!
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

function BlockCategoriesSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader
          eyebrow="Every block Scratch has — and 3D on top"
          title="A full block language, categorized like you already know."
          copy="Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, Lists, and Clones — plus native 3D writers and an AI category for asking the model at runtime."
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

function ThreeDimensionalSection() {
  return (
    <section className="py-14 sm:py-20 bg-slate-50 border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-5">
          <SectionHeader
            eyebrow="Beyond 2D sprites"
            title="Sprites are flat. Worlds aren't."
            copy="Every object is a real 3D shape you can rotate, glide, scale, and collide in three axes. Cameras follow characters, physics is on by default, and clones spawn at live positions — up to 300 at once."
          />
          <ul className="mt-8 space-y-3 text-slate-700">
            <FeatureRow icon={<Layers className="w-5 h-5" />} label="X, Y, Z motion writers: goto, glide, point-towards" />
            <FeatureRow icon={<Boxes className="w-5 h-5" />} label="3D touching + distance sensing on world radii" />
            <FeatureRow icon={<Wand2 className="w-5 h-5" />} label="Say / think bubbles that follow objects through space" />
          </ul>
        </div>
        <div className="lg:col-span-7">
          <SceneShowcase />
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

function SceneShowcase() {
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
          Let&apos;s go! ▾
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// AI section
// -----------------------------------------------------------------------------

function AISection() {
  return (
    <section className="py-14 sm:py-20">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 order-2 lg:order-1">
          <AIMockup />
        </div>
        <div className="lg:col-span-5 order-1 lg:order-2">
          <SectionHeader
            eyebrow="AI-first, not AI-bolted-on"
            title="Ask, and the blocks appear."
            copy="Describe what you want in plain English. The AI writes real block programs into your project — the same blocks you'd drag by hand. Nothing hidden, everything editable."
          />
          <ul className="mt-8 space-y-3 text-slate-700">
            <FeatureRow icon={<Bot className="w-5 h-5" />} label="AI generates full games from a prompt" />
            <FeatureRow icon={<Sparkles className="w-5 h-5" />} label='Runtime "ask_ai" and "ai_decide" blocks — NPCs that think' />
            <FeatureRow icon={<Wand2 className="w-5 h-5" />} label="Safe, moderated, and kid-appropriate by default" />
          </ul>
        </div>
      </div>
    </section>
  );
}

function AIMockup() {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center gap-2 px-4 h-10 border-b border-slate-200 bg-slate-50">
        <Bot className="w-4 h-4" style={{ color: PALETTE.ai }} />
        <span className="text-sm font-semibold">AI Assistant</span>
      </div>
      <div className="p-5 space-y-3 bg-gradient-to-br from-orange-50/50 to-white">
        <ChatBubble side="right">Build me a maze game with a red hero and coins to collect.</ChatBubble>
        <ChatBubble side="left">
          <div className="mb-2">Added a 3D maze, a red character, and 8 coins. Here&apos;s what I wrote:</div>
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
        <ChatBubble side="right">Make the enemy chase me only when I&apos;m close.</ChatBubble>
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

const SAMPLE_PROJECTS = [
  { title: 'Platformer Adventure', tag: 'starter', from: '#4C97FF', to: '#9966FF', emoji: '🏃' },
  { title: 'Space Explorer', tag: 'physics', from: '#0F172A', to: '#4C97FF', emoji: '🚀' },
  { title: 'Maze Runner', tag: 'AI enemy', from: '#FF6B35', to: '#FFBF00', emoji: '🌀' },
  { title: 'Fish Tank', tag: 'clones', from: '#5CB1D6', to: '#59C059', emoji: '🐟' },
  { title: 'Puzzle Room', tag: 'sensing', from: '#9966FF', to: '#CF63CF', emoji: '🧩' },
  { title: 'AI Pet', tag: 'ask_ai', from: '#FF6680', to: '#FF6B35', emoji: '🐶' },
];

function GallerySection() {
  return (
    <section className="py-14 sm:py-20 bg-slate-50 border-y border-slate-100" id="learn">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <SectionHeader
            eyebrow="Made with lingplay"
            title="Start from a spark. Ship a whole world."
            copy="Remix any starter or build from scratch. Every project runs in the browser — no downloads, no accounts required."
          />
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            Browse all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SAMPLE_PROJECTS.map((p) => (
            <ProjectCard key={p.title} {...p} />
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
}: {
  title: string;
  tag: string;
  from: string;
  to: string;
  emoji: string;
}) {
  return (
    <div className="group rounded-2xl overflow-hidden border border-slate-200 bg-white hover:shadow-xl hover:border-slate-300 transition">
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
          <div className="text-xs text-slate-500">Remix in one click</div>
        </div>
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 group-hover:bg-slate-900 group-hover:text-white transition"
        >
          <Play className="w-4 h-4" />
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Safety bar
// -----------------------------------------------------------------------------

function SafetyBar() {
  return (
    <section id="safety" className="py-14 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-8 md:p-10 grid md:grid-cols-3 gap-8 items-center">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 mb-2">
              <Shield className="w-4 h-4" />
              For parents and teachers
            </div>
            <h3 className="text-2xl font-black text-slate-900">
              Safe by default. Kid-appropriate always.
            </h3>
            <p className="mt-3 text-slate-600">
              AI responses are moderated. No open chat between kids. Projects
              are private until you choose to share. Age-tuned content filters
              run on every prompt.
            </p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-1 gap-3 text-sm">
            <TrustTile label="Moderated AI" />
            <TrustTile label="Private by default" />
            <TrustTile label="No open chat" />
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

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 font-bold">
            <LogoMark />
            lingplay
          </div>
          <p className="mt-3 text-sm text-slate-600 max-w-xs">
            A creative coding platform for kids to make 3D games with blocks and AI.
          </p>
        </div>
        <FooterCol title="Build">
          <FooterLink href="/projects/new">Start a project</FooterLink>
          <FooterLink href="/projects">Explore</FooterLink>
          <FooterLink href="/auth/signup">Create account</FooterLink>
        </FooterCol>
        <FooterCol title="Learn">
          <FooterLink href="#learn">Starter projects</FooterLink>
          <FooterLink href="#safety">For parents</FooterLink>
          <FooterLink href="/auth/login">Sign in</FooterLink>
        </FooterCol>
        <FooterCol title="Community">
          <FooterLink href="https://github.com" external>
            <Github className="w-4 h-4 inline mr-1" />
            GitHub
          </FooterLink>
          <FooterLink href="#safety">
            <Users className="w-4 h-4 inline mr-1" />
            Community guidelines
          </FooterLink>
        </FooterCol>
      </div>
      <div className="border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6 py-6 text-xs text-slate-500 flex items-center justify-between">
          <span>© {new Date().getFullYear()} lingplay. Made for kids.</span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: PALETTE.control }}
            />
            All systems normal
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
