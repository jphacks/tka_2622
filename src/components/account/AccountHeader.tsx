"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase/browser";

interface AccountHeaderProps {
  brandName?: string;
}

export function AccountHeader({ brandName = "よりみち" }: AccountHeaderProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      const { error: signOutError } =
        await getSupabaseBrowserClient().auth.signOut();
      if (signOutError) {
        setError("ログアウトできませんでした。もう一度お試しください。");
        setSigningOut(false);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("認証サービスに接続できません。ログアウトできませんでした。");
      setSigningOut(false);
    }
  }

  return (
    <header className="inventory-header">
      <a className="account-wordmark" href="/items" aria-label={brandName}>
        {brandName}
      </a>
      <nav aria-label="アカウントメニュー">
        <a href="/settings">設定</a>
        <button type="button" onClick={() => void signOut()} disabled={signingOut}>
          {signingOut ? "…" : "ログアウト"}
        </button>
      </nav>
      {error && (
        <span className="inventory-header-error" role="alert">
          {error}
        </span>
      )}
    </header>
  );
}
