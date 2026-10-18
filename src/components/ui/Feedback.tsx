import type { ReactNode } from "react";
import { Button } from "./Button";

interface LoadingStateProps {
  title: string;
  description: string;
}

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
}

interface RetryableErrorProps {
  message: ReactNode;
  retryLabel: string;
  onRetry: () => void;
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function LoadingState({ title, description }: LoadingStateProps) {
  return (
    <div className="loading-card" role="status" aria-live="polite">
      <Spinner />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}

export function RetryableError({
  message,
  retryLabel,
  onRetry,
}: RetryableErrorProps) {
  return (
    <div className="notice notice-error" role="alert">
      <span aria-hidden="true">!</span>
      <p>{message}</p>
      <Button variant="text" type="button" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
