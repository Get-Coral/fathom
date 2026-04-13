import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "#/styles.css";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Fathom" },
			{
				name: "description",
				content: "Modern self-hosted reading room for books, manga, comics, and PDFs in Jellyfin.",
			},
		],
	}),
	component: RootComponent,
	errorComponent: RootErrorPage,
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
				<main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
					<h1 className="font-display text-4xl">Something went wrong</h1>
					{error?.message && <p className="max-w-md text-center text-ink-muted">{error.message}</p>}
					<div className="flex gap-3">
						<button
							type="button"
							onClick={handleRetry}
							className="rounded-xl bg-moss/20 px-5 py-2.5 text-sm font-medium text-moss hover:bg-moss/30"
						>
							Try again
						</button>
						<a
							href="/setup"
							className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium text-ink hover:bg-white/15"
						>
							Go to setup
						</a>
					</div>
				</main>
				<Scripts />
			</body>
		</html>
	);
}
