export function Footer() {
  return (
    <footer className="relative z-10 mt-24 border-t border-white/10 bg-black/20 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <div className="font-display font-semibold text-white text-lg">BE on BSV</div>
          <div className="text-white/60 text-sm font-body">
            Together <span className="text-bsva-cyan">▶</span> Towards Better
          </div>
        </div>
        <div className="flex flex-col sm:items-end gap-1 text-sm font-body">
          <a
            href="https://bsvassociation.org"
            target="_blank"
            rel="noreferrer"
            className="text-white/70 hover:text-bsva-cyan transition-colors"
          >
            BSV Association ↗
          </a>
          <a
            href="https://www.npmjs.com/package/@bsv/simple"
            target="_blank"
            rel="noreferrer"
            className="text-white/70 hover:text-bsva-cyan transition-colors"
          >
            Powered by @bsv/simple ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
