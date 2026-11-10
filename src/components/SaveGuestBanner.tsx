import { Link } from "@tanstack/react-router";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";

/** Shown to guests: invites them to turn their guest games into a real account. */
export function SaveGuestBanner({ text = "You're playing as a guest. Create an account to keep this game and your rankings." }: { text?: string }) {
  const { isGuest } = useSession();
  if (!isGuest) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-secondary p-3 text-sm">
      <span>{text}</span>
      <Button variant="brass" size="sm" asChild><Link to="/auth">Save my games</Link></Button>
    </div>
  );
}
