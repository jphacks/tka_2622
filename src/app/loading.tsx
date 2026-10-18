import { Spinner } from "../components/ui";

export default function LoadingPage() {
  return (
    <main className="inventory-stage">
      <div className="app-feedback" role="status" aria-live="polite">
        <Spinner />
        <p>読み込んでいます…</p>
      </div>
    </main>
  );
}
