"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "./Brand";

interface AccountHeaderProps {
  brandName?: string;
}

export function AccountHeader({ brandName = "ものさき。" }: AccountHeaderProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      const { getSupabaseBrowserClient } = await import(
        "../../lib/supabase/browser"
      );
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
      <Link className="account-wordmark" href="/items" aria-label={brandName}>
        <Brand name={brandName} />
      </Link>
      <nav aria-label="アカウントメニュー">
        <Link href="/settings">設定</Link>
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
