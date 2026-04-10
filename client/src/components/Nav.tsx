import { Link, NavLink } from "react-router-dom";
import { Logo } from "./Logo.js";

export function Nav() {
  return (
    <header className="sticky top-0 z-50">
      <div className="glass border-b border-white/10">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-3 group">
            <Logo className="h-7 w-auto" />
            <span className="hidden sm:flex items-baseline gap-2">
              <span className="font-display font-semibold text-white text-lg leading-none">
                BE on BSV
              </span>
              <span className="text-bsva-cyan text-xs font-body opacity-80">▶ events</span>
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-3 py-2 rounded-full text-sm font-body transition-colors ${
                  isActive ? "text-bsva-cyan" : "text-white/80 hover:text-white"
                }`
              }
            >
              Upcoming
            </NavLink>
            <NavLink
              to="/past"
              className={({ isActive }) =>
                `px-3 py-2 rounded-full text-sm font-body transition-colors ${
                  isActive ? "text-bsva-cyan" : "text-white/80 hover:text-white"
                }`
              }
            >
              Past
            </NavLink>
            <a
              href="https://bsvassociation.org"
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex px-3 py-2 rounded-full text-sm font-body text-white/80 hover:text-white"
            >
              About BSVA ↗
            </a>
            <NavLink
              to="/admin"
              className="ml-2 px-3 py-2 rounded-full text-xs font-body text-white/50 hover:text-white/80"
              title="Admin"
            >
              admin
            </NavLink>
          </div>
        </nav>
      </div>
    </header>
  );
}
