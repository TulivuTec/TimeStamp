import React, { useCallback } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter, useNavigate } from "react-router-dom";
import App from "./App";
import "./index.css";

// Register the service worker used for task reminder push notifications.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.error("Push notification service worker registration failed:", err);
  });
}

const publishableKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
const container = document.getElementById("root");
const root = createRoot(container);

if (!publishableKey) {
	root.render(
		<div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
			<h2>Missing Clerk publishable key</h2>
			<p>
				Set <code>REACT_APP_CLERK_PUBLISHABLE_KEY</code> in <code>frontend/.env</code>
				 and restart <code>npm start</code>.
			</p>
		</div>
	);
	throw new Error(
		"Missing REACT_APP_CLERK_PUBLISHABLE_KEY. Add it to frontend/.env and restart npm start."
	);
}

function ClerkProviderWithRouter() {
	const navigate = useNavigate();
	const clerkNavigate = useCallback((to) => navigate(to), [navigate]);

	return (
		<ClerkProvider
			publishableKey={publishableKey}
			navigate={clerkNavigate}
		>
			<App />
		</ClerkProvider>
	);
}

root.render(
	<BrowserRouter>
		<ClerkProviderWithRouter />
	</BrowserRouter>
);