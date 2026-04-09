import { Link } from 'react-router-dom';

const features = [
  {
    icon: '🏈',
    title: 'Full PPR Fantasy Football',
    desc: 'Yahoo-style fantasy with snake draft, waivers, trades, and live scoring. Everything you expect, plus more.'
  },
  {
    icon: '🃏',
    title: 'Weekly Card System',
    desc: 'Each week, pick 3 cards from 12 face-down options. Play them to buff your players or debuff your opponents.'
  },
  {
    icon: '⚡',
    title: 'Real-Time Live Scoring',
    desc: 'Scores update every 60 seconds during games via Tank01 NFL API. Watch your lead evaporate in real time.'
  },
  {
    icon: '💬',
    title: 'League Chat',
    desc: 'Live chat room for every league. Trash talk included. Commissioners can moderate.'
  },
  {
    icon: '🦹',
    title: 'The Ole Switcheroo',
    desc: 'Every manager gets a permanent wild card that reflects debuffs back at the player who played them.'
  },
  {
    icon: '🏆',
    title: 'Full Season + Playoffs',
    desc: 'Weeks 1–14 regular season, top 6 advance to playoffs (Weeks 15–17). Consolation bracket keeps everyone in it.'
  }
];

const howItWorks = [
  {
    step: '1',
    title: 'Create or Join a League',
    desc: 'Invite up to 12 managers via a shareable code. Commissioner controls all settings.'
  },
  {
    step: '2',
    title: 'Snake Draft Your Roster',
    desc: '15 rounds, 90-second pick timer, auto-pick fallback. Full draft board visible to everyone.'
  },
  {
    step: '3',
    title: 'Pick Your Cards Each Week',
    desc: 'Tuesday–Wednesday: flip 12 mystery cards and pick 3. Strategy meets luck.'
  },
  {
    step: '4',
    title: 'Set Lineup & Play Cards',
    desc: 'Lock your lineup Thursday night, then play cards on yourself, your opponent, or any team.'
  },
  {
    step: '5',
    title: 'Cards Reveal at Kickoff',
    desc: 'Sunday 1PM ET — all played cards flip simultaneously. Find out what your opponent had in store.'
  },
  {
    step: '6',
    title: 'Win Your League',
    desc: 'Scores settle, standings update, and the best combo of fantasy skill and card strategy wins.'
  }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gridiron-dark text-white">
      {/* ======================================================
          HEADER
      ====================================================== */}
      <header className="border-b border-slate-800 sticky top-0 bg-gridiron-dark/95 backdrop-blur z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏈</span>
            <div>
              <div className="font-black text-white text-xl leading-tight tracking-tight">Gridiron</div>
              <div className="text-[10px] text-gridiron-gold font-black tracking-[0.3em] uppercase">Cards</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-slate-300 hover:text-white text-sm font-medium transition-colors px-4 py-2"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              className="btn-primary text-sm"
            >
              Sign Up Free
            </Link>
          </div>
        </div>
      </header>

      {/* ======================================================
          HERO
      ====================================================== */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-gridiron-gold/10 border border-gridiron-gold/30 text-gridiron-gold text-xs font-bold px-4 py-1.5 rounded-full mb-8 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 bg-gridiron-gold rounded-full animate-pulse" />
          Fantasy Football, Evolved
        </div>

        <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6">
          Play Fantasy.<br />
          <span className="text-brand-400">Play Cards.</span><br />
          <span className="text-gridiron-gold">Win Everything.</span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          Gridiron Cards combines standard PPR fantasy football with a weekly MTG-inspired card system.
          Buff your stars, debuff your opponents, and deploy the perfect Switcheroo when it matters most.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/signup"
            className="btn-primary text-base px-10 py-3.5 font-bold"
          >
            🏈 Create Your League Free
          </Link>
          <Link
            to="/login"
            className="btn-secondary text-base px-8 py-3.5"
          >
            Already playing? Log in
          </Link>
        </div>

        <p className="text-slate-600 text-xs mt-6">No credit card required · Private leagues only · Up to 12 managers</p>
      </section>

      {/* ======================================================
          FEATURE HIGHLIGHT — CARD SYSTEM
      ====================================================== */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="text-gridiron-gold text-xs font-bold uppercase tracking-widest mb-3">The Card System</div>
            <h2 className="text-3xl md:text-4xl font-black mb-5">
              Fantasy Football With a<br />
              <span className="text-brand-400">Devious Twist</span>
            </h2>
            <div className="space-y-4 text-slate-400">
              <p>
                Every week you pick 3 mystery cards from 12 face-down options — then decide how to deploy them.
              </p>
              <ul className="space-y-2 text-sm">
                {[
                  '🔒 Cards stay hidden until Sunday 1PM kickoff',
                  '⚡ Buff your own players OR debuff your opponent\'s',
                  '🎯 Play one on any team in the entire league',
                  '🦹 The Switcheroo reflects debuffs back at attackers',
                  '🃏 Rare, Uncommon, and Common cards with different effects'
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-base leading-5">{item.split(' ')[0]}</span>
                    <span>{item.split(' ').slice(1).join(' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Visual mock card */}
          <div className="flex justify-center">
            <div className="relative w-64">
              {/* Back card */}
              <div className="absolute top-4 left-4 w-56 h-80 bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl border border-slate-600 shadow-xl" />
              {/* Front card */}
              <div className="relative w-56 h-80 bg-gradient-to-br from-brand-900 to-slate-900 rounded-2xl border border-brand-600/50 shadow-2xl p-5 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30 font-semibold">BUFF</span>
                  <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/30">Rare</span>
                </div>
                <div className="text-4xl mb-3 text-center">🚀</div>
                <div className="text-white font-black text-lg mb-1">Jet Fuel</div>
                <p className="text-slate-400 text-xs flex-1">
                  Your QB is locked in. All passing TDs score double points this week. Unleash the arm.
                </p>
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Target</span>
                    <span className="text-white font-semibold">QB · +100%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================
          FEATURES GRID
      ====================================================== */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black mb-3">Everything You Need</h2>
          <p className="text-slate-400">Full-featured fantasy football, no compromises.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="card hover:border-slate-600 transition-all hover:-translate-y-0.5"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-white font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ======================================================
          HOW IT WORKS
      ====================================================== */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black mb-3">How It Works</h2>
          <p className="text-slate-400">From league creation to championship in 6 steps.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {howItWorks.map((step) => (
            <div key={step.step} className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-gridiron-gold flex items-center justify-center text-black font-black text-sm flex-shrink-0">
                {step.step}
              </div>
              <div>
                <div className="text-white font-bold mb-1">{step.title}</div>
                <div className="text-slate-400 text-sm leading-relaxed">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ======================================================
          CTA BANNER
      ====================================================== */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="bg-gradient-to-br from-brand-900/50 to-slate-800/50 border border-brand-700/30 rounded-3xl p-10 text-center">
          <h2 className="text-3xl md:text-4xl font-black mb-4">
            Ready to Dominate?
          </h2>
          <p className="text-slate-400 mb-8 text-lg">
            Create your league, invite your crew, and find out who's got the smarts — and the cards — to win.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="btn-primary text-base px-10 py-3.5 font-bold">
              🏈 Start Your League
            </Link>
            <Link to="/login" className="btn-secondary text-base px-8 py-3.5">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ======================================================
          FOOTER
      ====================================================== */}
      <footer className="border-t border-slate-800 py-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="text-2xl">🏈</span>
          <div className="text-left">
            <div className="font-black text-white leading-tight">Gridiron</div>
            <div className="text-[9px] text-gridiron-gold font-black tracking-[0.3em] uppercase">Cards</div>
          </div>
        </div>
        <p className="text-slate-600 text-sm">
          Fantasy Football, Evolved · Private leagues · PPR scoring · Card system
        </p>
        <p className="text-slate-700 text-xs mt-2">MVP Build · {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
