import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** Starts a guest session (no email needed) and drops the player in the lobby. */
export function GuestPlayButton({ label = "Play as guest", variant = "felt" as const, size = "lg" as const }: { label?: string; variant?: "felt" | "brass"; size?: "lg" | "sm" | "default" }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) { toast.error("Couldn't start a guest game. Please try again."); setBusy(false); return; }
    }
    navigate({ to: "/lobby" });
  }
  return <Button variant={variant} size={size} onClick={go} disabled={busy}>{label}</Button>;
}
