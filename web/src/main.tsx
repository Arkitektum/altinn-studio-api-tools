import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { makeQueryClient } from "./queries";
import { RunLogProvider } from "./runLog";
import { SessionProvider } from "./session";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

/* One for the session. Built out here rather than in the element, which would make it one per render. */
const queryClient = makeQueryClient();

createRoot(container).render(
    <StrictMode>
        <ErrorBoundary>
            {/* Inside the boundary, so a client that failed to start is reported like anything else. */}
            <QueryClientProvider client={queryClient}>
                {/* The session first: the run log reads the instance on screen from it. */}
                <SessionProvider>
                    <RunLogProvider>
                        <App />
                    </RunLogProvider>
                </SessionProvider>
            </QueryClientProvider>
        </ErrorBoundary>
    </StrictMode>
);
