import { CoralErrorState } from "@get-coral/ui";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppBootstrap } from "#/components/AppBootstrap";
import "@get-coral/ui/styles.css";
import "#/styles.css";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ name: "theme-color", content: "#050d14" },
			{ name: "apple-mobile-web-app-capable", content: "yes" },
			{ name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
			{ title: "Fathom" },
			{
				name: "description",
				content: "Modern self-hosted reading room for books, manga, comics, and PDFs in Jellyfin.",
			},
		],
		links: [
			{ rel: "manifest", href: "/manifest.json" },
			{ rel: "icon", href: "/favicon.ico" },
			{ rel: "apple-touch-icon", href: "/logo192.png" },
		],
	}),
	component: RootComponent,
	errorComponent: RootErrorPage,
	notFoundComponent: RootNotFoundPage,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<AppBootstrap />
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootErrorPage({ error, reset }: { error: Error; reset: () => void }) {
	const router = useRouter();

	function handleRetry() {
		reset();
		void router.invalidate();
	}

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="min-h-screen bg-abyss text-ink">
				<CoralErrorState
					eyebrow="Fathom"
					title="Something went wrong"
					description={error?.message ?? "An unexpected error happened while loading this route."}
					primaryAction={{ label: "Try again", onClick: handleRetry }}
					secondaryAction={{ label: "Go to setup", href: "/setup", variant: "neutral" }}
				/>
				<Scripts />
			</body>
		</html>
	);
}

function RootNotFoundPage() {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="min-h-screen bg-abyss text-ink">
				<CoralErrorState
					code="404"
					title="Page not found"
					description="This route does not exist in Fathom. You can return to your library dashboard or edit your server connection."
					primaryAction={{ label: "Back to dashboard", href: "/" }}
					secondaryAction={{ label: "Go to setup", href: "/setup", variant: "neutral" }}
				/>
				<Scripts />
			</body>
		</html>
	);
}
