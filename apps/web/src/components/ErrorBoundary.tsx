import { Component, type ErrorInfo, type ReactNode } from "react";
import { Panel, PrimaryButton } from "./ui.js";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("System Hunter render failure", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-system-bg px-6 text-center text-system-text">
        <div className="system-backdrop fixed inset-0" />
        <div className="system-grid fixed inset-0 opacity-90" />
        <Panel className="relative w-full max-w-sm border-system-danger/50">
          <p className="font-mono text-sm font-black uppercase text-system-danger">СИСТЕМА ОСТАНОВЛЕНА</p>
          <p className="mt-3 text-sm text-system-muted">
            Интерфейс столкнулся с ошибкой. Обнови экран, чтобы заново подключиться к профилю.
          </p>
          <div className="mt-5">
            <PrimaryButton onClick={() => window.location.reload()}>Обновить</PrimaryButton>
          </div>
        </Panel>
      </div>
    );
  }
}
