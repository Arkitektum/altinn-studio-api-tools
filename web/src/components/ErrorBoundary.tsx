import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearStored } from "../lib/useLocalStorage";

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
    /** Clearing throws away a payload you may have typed, so it asks twice like a delete does. */
    armed: boolean;
}

/**
 * The last resort, for a render that throws.
 *
 * Without it the page goes blank, and because the target, the selection and the payload are in
 * localStorage, reloading restores whatever caused it and the page goes blank again. That is the
 * state worth designing for: the way out cannot be a reload, so the second button drops the stored
 * work. Nothing it clears is a credential, since tokens live in server memory.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null, armed: false };

    static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }

    componentDidCatch(error: unknown, info: ErrorInfo): void {
        // The console is where a stack is readable and copyable. On the page it would bury the two
        // buttons that are the point of this screen.
        console.error("[render]", error, info.componentStack);
    }

    render(): ReactNode {
        const { error, armed } = this.state;
        if (!error) return this.props.children;

        return (
            <div className="crash">
                <section className="panel">
                    <div className="panel__head">
                        <h2>The interface stopped</h2>
                    </div>

                    <div className="notice notice--bad" role="alert">
                        {error.message || "A render threw without a message."}
                    </div>

                    <p>
                        Something in the interface threw while drawing. The stack is in the browser console. Nothing was sent to Altinn, and any token
                        you hold is on the server rather than in this page, so it is still there after a reload.
                    </p>
                    <p>
                        If reloading lands here again, it is the saved work doing it: the org, the app, the selected instance and the payload elements
                        are restored from this browser, and one of them is what the interface cannot draw.
                    </p>

                    <div className="crash__actions">
                        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
                            Reload
                        </button>
                        {armed ? (
                            <>
                                <button
                                    type="button"
                                    className="btn btn--delete btn--armed"
                                    onClick={() => {
                                        clearStored();
                                        window.location.reload();
                                    }}
                                >
                                    Confirm: throw the payload away and reload
                                </button>
                                <button type="button" className="btn btn--ghost" onClick={() => this.setState({ armed: false })}>
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button type="button" className="btn btn--delete" onClick={() => this.setState({ armed: true })}>
                                Clear the saved work and reload
                            </button>
                        )}
                    </div>
                </section>
            </div>
        );
    }
}
