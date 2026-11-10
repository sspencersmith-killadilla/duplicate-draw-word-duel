import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import "@lovable.dev/cloud-auth-js/styles.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Sign in — Duplicate Draw" },
      { name: "description", content: "Sign in or create an account to play the daily Duplicate Draw deal." },
      { property: "og:title", content: "Sign in — Duplicate Draw" },
      { property: "og:description", content: "Sign in to play today's deal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: "/lobby" }); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (s && e === "SIGNED_IN") navigate({ to: "/lobby" }); });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new Error("Username: 3–20 letters, numbers or underscores.");
        const { error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: window.location.origin, data: { username: username.toLowerCase() } },
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) toast.error("Couldn't sign in. Please try again.");
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="paper rounded-xl p-8">
        <h1 className="text-3xl font-semibold">{mode === "signin" ? "Take your seat" : "Join the club"}</h1>
        <p className="mt-1 text-sm opacity-70">{mode === "signin" ? "Sign in to play today's deal." : "Pick a username other players will see."}</p>
        {sent ? (
          <p className="mt-6 rounded-md bg-tile-new/40 p-4 text-sm">Check your email to confirm your account, then come back to sign in.</p>
        ) : (
          <>
            <div className="mt-6 grid gap-2">
              <button type="button" onClick={() => oauth("google")}
                className="flex h-10 items-center justify-center gap-[10px] rounded-md border border-[#747775] bg-[#FFFFFF] px-3 text-sm font-medium text-[#1F1F1F]">
                <GoogleLogo /> Continue with Google
              </button>
            </div>
            <div className="my-5 flex items-center gap-3 text-xs opacity-60"><span className="h-px flex-1 bg-current" />or<span className="h-px flex-1 bg-current" /></div>
            <form onSubmit={submit} className="grid gap-4">
              {mode === "signup" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required className="bg-background/5 border-card-foreground/20" />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-background/5 border-card-foreground/20" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-background/5 border-card-foreground/20" />
              </div>
              <Button type="submit" variant="brass" disabled={busy}>{mode === "signin" ? "Sign in" : "Create account"}</Button>
            </form>
          </>
        )}
        <button className="mt-5 text-sm underline opacity-80" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setSent(false); }}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
