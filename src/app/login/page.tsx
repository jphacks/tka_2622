"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MovingHomeIllustration } from "../../components/account/MovingHomeIllustration";
import { getSupabaseBrowserClient } from "../../lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        if (signInError.status === 400 || signInError.status === 401) {
          setError("メールアドレスまたはパスワードを確認してください。");
          return;
        }
        throw new Error("認証サービスに接続できません。時間をおいて再度お試しください。");
      }

      const profileResponse = await fetch("/api/profile", { cache: "no-store" });
      if (!profileResponse.ok) {
        const payload: unknown = await profileResponse.json().catch(() => null);
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "ログイン済みですがプロフィールを確認できません。時間をおいて再度お試しください。";
        throw new Error(message);
      }
      const profilePayload: unknown = await profileResponse.json();
      if (
        typeof profilePayload !== "object" ||
        profilePayload === null ||
        !("profile" in profilePayload)
      ) {
        throw new Error("プロフィールの応答を確認できませんでした。");
      }

      const profile = profilePayload.profile;
      const isOnboarded =
        typeof profile === "object" &&
        profile !== null &&
        "onboarding_completed" in profile &&
        profile.onboarding_completed === true;
      router.replace(isOnboarded ? "/items" : "/onboarding");
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "ログインできませんでした。時間をおいて再度お試しください。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-stage">
      <section className="login-hero" aria-labelledby="login-title">
        <h1 id="login-title">JPHACK</h1>
        <p>引っ越しをもっとかんたんに</p>
        <MovingHomeIllustration />
      </section>
      <section className="login-panel" aria-label="ログイン">
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-input">
            <span className="visually-hidden">メールアドレス</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
              <path d="m4.5 7 7.5 6 7.5-6" />
            </svg>
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="メールアドレス"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </label>
          <label className="login-input">
            <span className="visually-hidden">パスワード</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4.5" y="10" width="15" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2" />
            </svg>
            <input
              type="password"
              autoComplete="current-password"
              required
              placeholder="パスワード"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </label>
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? "確認しています…" : "ログイン"}
            {!submitting && <span aria-hidden="true">→</span>}
          </button>
        </form>
        <p className="login-admin-note">
          アカウントをお持ちでない方は、管理者に作成をご依頼ください。
        </p>
      </section>
    </main>
  );
}
