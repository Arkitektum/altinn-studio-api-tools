import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { makeQueryClient } from "./queries";
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
                <App />
            </QueryClientProvider>
        </ErrorBoundary>
    </StrictMode>
);
