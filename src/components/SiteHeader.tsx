import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="tile flex h-8 w-8 items-center justify-center text-lg">D</span>
      <span className="font-display text-xl font-semibold tracking-tight">Duplicate Draw</span>
    </Link>
  );
}

export function SiteHeader() {
  const { session, ready } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const link = "text-sm text-muted-foreground hover:text-foreground transition-colors";
  const active = { className: "text-sm text-foreground font-semibold" };
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Logo />
        {ready && (
          <nav className="flex items-center gap-4">
            {session ? (
              <>
                <Link to="/lobby" className={link} activeProps={active}>Lobby</Link>
                <Link to="/leaderboard" className={link} activeProps={active}>Rankings</Link>
                <Link to="/profile" className={link} activeProps={active}>Profile</Link>
                <Button variant="felt" size="sm" onClick={signOut}>Sign out</Button>
              </>
            ) : (
              <Button variant="brass" size="sm" asChild>
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
