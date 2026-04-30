import { Link, NavLink, useLocation } from "react-router-dom";

/**
 * Top navigation, light theme.
 *
 * Logo treatment per BSVA brand: small uppercase "BSV ASSOCIATION" eyebrow
 * above a large "BE on BSV" wordmark. The "▶ events" subscript that used
 * to follow "BE on BSV" is gone — the page itself is the events surface,
 * we don't need to caption it.
 *
 * The "Upcoming" / "Events" nav button is also gone — the homepage hero
 * is the upcoming list.
 *
 * Admin link is gated by either:
 *   - `?admin=1` query string (lets us bookmark `/admin?admin=1` for
 *     direct access while keeping the link out of public view), or
 *   - `localStorage.beonbsv-admin-gate` already unlocked (so once an
 *     admin has entered the gate password they don't lose the link on
 *     subsequent navigations).
 */
function shouldShowAdminLink(search: string): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(search);
  if (params.get("admin") === "1") return true;
  try {
    return window.localStorage.getItem("beonbsv-admin-gate") === "1";
  } catch {
    return false;
  }
}

export function Nav() {
  const { search } = useLocation();
  const showAdmin = shouldShowAdminLink(search);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-bsva-grey">
      <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
        <Link to="/" className="flex flex-col group">
          <span className="text-[10px] tracking-[0.2em] uppercase text-bsva-navy/60 font-display font-semibold leading-none">
            BSV Association
          </span>
          <span className="font-display font-semibold text-bsva-navy text-2xl leading-tight mt-0.5">
            BE on BSV
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <a
            href="https://bsvassociation.org"
            target="_blank"
            rel="noreferrer"
            className="hidden md:inline-flex px-3 py-2 rounded-full text-sm font-body text-bsva-soft/70 hover:text-bsva-navy"
          >
            About BSVA ↗
          </a>
          {showAdmin && (
            <NavLink
              to="/admin"
              className="ml-2 px-3 py-2 rounded-full text-xs font-body text-bsva-soft/50 hover:text-bsva-navy"
              title="Admin"
            >
              admin
            </NavLink>
          )}
        </div>
      </nav>
    </header>
  );
}
