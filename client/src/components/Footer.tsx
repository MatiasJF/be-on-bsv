export function Footer() {
  return (
    <footer className="relative z-10 mt-24 border-t border-bsva-grey bg-white">
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-bsva-navy/60 font-display font-semibold">
            BSV Association
          </div>
          <div className="font-display font-semibold text-bsva-navy text-lg leading-tight">
            BE on BSV
          </div>
          <div className="text-bsva-soft/60 text-sm font-body mt-1">
            Together <span className="text-bsva-blue">▶</span> Towards Better
          </div>
        </div>
        <div className="flex flex-col sm:items-end gap-1 text-sm font-body">
          <a
            href="https://bsvassociation.org"
            target="_blank"
            rel="noreferrer"
            className="text-bsva-soft/70 hover:text-bsva-navy transition-colors"
          >
            BSV Association ↗
          </a>
          <a
            href="https://www.npmjs.com/package/@bsv/simple"
            target="_blank"
            rel="noreferrer"
            className="text-bsva-soft/70 hover:text-bsva-navy transition-colors"
          >
            Powered by @bsv/simple ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
