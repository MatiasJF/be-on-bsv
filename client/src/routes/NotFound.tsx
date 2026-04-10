import { Link } from "react-router-dom";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";

export function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-6 pt-24 pb-24">
      <GlassCard strong className="p-12 text-center">
        <div className="font-display font-semibold text-7xl text-bsva-cyan mb-4">404</div>
        <h1 className="font-display font-semibold text-2xl text-white mb-2">
          We can't find that page.
        </h1>
        <p className="text-white/60 font-body mb-6">It may have moved, or it never existed.</p>
        <Link to="/">
          <Button variant="primary">Back to events</Button>
        </Link>
      </GlassCard>
    </div>
  );
}
