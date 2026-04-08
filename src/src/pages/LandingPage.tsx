import { Link } from 'react-router-dom';

const features = [
  { icon: '🏈', title: 'Full PPR Fantasy', desc: 'Standard Yahoo-style fantasy football with snake draft, waivers, and trades.' },
  { icon: '🃏', title: 'Card System', desc: 'Play MTG-style cards weekly to buff your players or debuff your opponent.' },
  { icon: '⚡', title: 'Live Scoring', desc: 'Real-time scores powered by Tank01 NFL API, updating every 60 seconds.' },
  { icon: '💬', title: 'League Chat', desc: 'Live chat for every league. Trash talk included.' },
  { icon: '🦹', title: 'The Switcheroo', desc: 'Every manager gets a permanent wild card to reflect debuffs back at opponents.' },
  { icon: '🏆', title: 'Playoffs', desc: 'Top 6 teams advance. Consolation bracket keeps everyone playing.' }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gridiron-dark">
      {/* Header */}
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏈</span>
            <div>
              <div className="font-bold text-white text-xl leading-tight">Gridiron</div>
              <div className="text-xs text-gridiron-gold font-bold tracking-widest">CARDS</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="btn-secondary text-sm">Log In</Link>
            <Link to="/signup" className="btn-primary text-sm">Sign Up Free</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="inline-block bg-gridiron-gold/10 border border-gridiron-gold/30 text-gridiron-gold text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
          Fantasy Football, Evolved
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
          Play Fantasy Football.<br />
          <span className="text-brand-400">Play Cards.</span><br />
          Dominate Your League.
        </h1>
        <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
          Standard PPR fantasy football combined with a weekly card system inspired by Magic: The Gathering.
          Buff your players, debuff your opponents, and pull off the perfect Switcheroo.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/signup" className="btn-primary text-base px-8 py-3">
            Create Your League
          </Link>
          <Link to="/login" className="btn-secondary text-base px-8 py-3">
            Already have an account?
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="card hover:border-slate-600 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-white font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-slate-500 text-sm">
        <p>Gridiron Cards MVP · Built with 🏈 and ⚡</p>
      </footer>
    </div>
  );
}
