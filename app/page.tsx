import Link from 'next/link';
import { Sparkles, Gamepad2, Palette, Code2 } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-purple-600 mb-4 bounce-in">
            Create Amazing Games!
          </h1>
          <p className="text-2xl text-gray-700 mb-8">
            Build your own games with AI magic
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/projects/new"
              className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-8 rounded-full text-xl shadow-lg transition-all hover:scale-105"
            >
              Start Creating
            </Link>
            <Link
              href="/auth/login"
              className="bg-white hover:bg-gray-50 text-purple-600 font-bold py-4 px-8 rounded-full text-xl shadow-lg transition-all hover:scale-105"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <FeatureCard
            icon={<Sparkles className="w-12 h-12" />}
            title="AI Assistant"
            description="Tell our AI what game you want and watch it come to life!"
            color="bg-yellow-100"
          />
          <FeatureCard
            icon={<Gamepad2 className="w-12 h-12" />}
            title="Easy to Use"
            description="Drag and drop blocks to create game logic - no coding needed!"
            color="bg-blue-100"
          />
          <FeatureCard
            icon={<Palette className="w-12 h-12" />}
            title="Create Art"
            description="Generate characters and backgrounds with AI image tools!"
            color="bg-pink-100"
          />
          <FeatureCard
            icon={<Code2 className="w-12 h-12" />}
            title="Learn & Play"
            description="Learn programming concepts while having fun!"
            color="bg-green-100"
          />
        </div>

        {/* Example Games */}
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold text-purple-600 mb-8">
            What Will You Create?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <GameExample
              title="Platformer Adventure"
              description="Jump and collect coins in your own world!"
              emoji="🏃"
            />
            <GameExample
              title="Puzzle Challenge"
              description="Create brain-teasing puzzles for your friends!"
              emoji="🧩"
            />
            <GameExample
              title="Space Explorer"
              description="Fly through space and dodge asteroids!"
              emoji="🚀"
            />
          </div>
        </div>

        {/* Safety Note for Parents */}
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-gray-800 mb-4">
            Safe & Educational
          </h3>
          <p className="text-gray-600">
            Our platform is designed with kids' safety in mind. All content is
            moderated, and parental controls are built-in. Kids learn valuable
            programming concepts while creating and having fun!
          </p>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div
      className={`${color} rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105 cursor-pointer`}
    >
      <div className="text-purple-600 mb-4">{icon}</div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-700">{description}</p>
    </div>
  );
}

function GameExample({
  title,
  description,
  emoji,
}: {
  title: string;
  description: string;
  emoji: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105 cursor-pointer">
      <div className="text-6xl mb-4">{emoji}</div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

