"use client";

import Link from "next/link";
import { Button } from "../components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="inventory-stage">
      <section className="app-feedback" aria-labelledby="page-error-title">
        <h1 id="page-error-title">ページを読み込めませんでした</h1>
        <p role="alert">接続を確認して、もう一度お試しください。</p>
        <Button type="button" onClick={reset}>もう一度読み込む</Button>
        <Link className="inventory-back-link" href="/items">持ち物一覧へ戻る</Link>
      </section>
    </main>
  );
}
