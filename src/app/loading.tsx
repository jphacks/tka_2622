export default function LoadingPage() {
  return (
    <main className="inventory-stage">
      <div className="app-feedback" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p>読み込んでいます…</p>
      </div>
    </main>
  );
}
