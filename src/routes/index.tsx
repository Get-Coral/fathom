import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookReader } from "#/components/BookReader";
import type { FathomBookCard, FathomReaderSession } from "#/lib/jellyfin";
import {
	fetchDashboard,
	fetchReaderSession,
	fetchSetupStatus,
	searchLibrary,
} from "#/server/functions";

function isLikelyConnectionError(error: unknown) {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return (
		message.includes("fetch failed") ||
		message.includes("network") ||
		message.includes("timed out") ||
		message.includes("econnrefused") ||
		message.includes("jellyfin api error")
	);
}

export const Route = createFileRoute("/")({
	loader: async () => {
		const setupStatus = await fetchSetupStatus();

		if (!setupStatus?.configured) {
			throw redirect({ to: "/setup", search: {} });
		}

		try {
			return await fetchDashboard();
		} catch (error) {
			if (isLikelyConnectionError(error)) {
				throw redirect({
					to: "/setup",
					search: {
						error: "connection" as const,
						reason: error instanceof Error ? error.message : undefined,
					},
				});
			}

			throw error;
		}
	},
	component: Home,
});

function Home() {
	const dashboard = Route.useLoaderData();
	const shelf = useMemo(
		() =>
			(dashboard.recentBooks.length > 0 ? dashboard.recentBooks : dashboard.libraryBooks).slice(
				0,
				18,
			),
		[dashboard.recentBooks, dashboard.libraryBooks],
	);
	const initialBookId = shelf[0]?.id ?? dashboard.featured?.id ?? null;
	const [selectedItemId, setSelectedItemId] = useState<string | null>(initialBookId);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<FathomBookCard[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [readerSession, setReaderSession] = useState<FathomReaderSession | null>(null);
	const [readerLoading, setReaderLoading] = useState(false);
	const [readerError, setReaderError] = useState<string | null>(null);

	const booksToShow = searchResults.length > 0 ? searchResults : shelf;
	const selectedBook: FathomBookCard | undefined =
		booksToShow.find((book) => book.id === selectedItemId) ??
		shelf.find((book) => book.id === selectedItemId) ??
		dashboard.featured ??
		dashboard.recentBooks[0] ??
		dashboard.libraryBooks[0];

	async function openReader(itemId: string) {
		try {
			setReaderLoading(true);
			setReaderError(null);
			const session = await fetchReaderSession({ data: { itemId } });
			setReaderSession(session);
		} catch (error) {
			setReaderError(error instanceof Error ? error.message : "Could not open reader.");
		} finally {
			setReaderLoading(false);
		}
	}

	async function handleSearch() {
		const query = searchQuery.trim();
		if (!query) {
			setSearchResults([]);
			return;
		}

		try {
			setSearchLoading(true);
			const results = await searchLibrary({ data: { query } });
			setSearchResults(results);
			if (results[0]) {
				setSelectedItemId(results[0].id);
			}
		} finally {
			setSearchLoading(false);
		}
	}

	if (readerSession) {
		return (
			<BookReader
				itemId={readerSession.itemId}
				format={readerSession.format}
				title={readerSession.title}
				url={readerSession.url}
				onClose={() => setReaderSession(null)}
			/>
		);
	}

	return (
		<main className="min-h-screen bg-abyss px-4 py-6 text-ink sm:px-6">
			<div className="mx-auto max-w-5xl space-y-5">
				<header className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.3em] text-moss">Fathom</p>
						<h1 className="mt-2 font-display text-3xl sm:text-4xl">Read</h1>
					</div>
					<div className="flex gap-2">
						<Link
							to="/manage"
							search={selectedItemId ? { itemId: selectedItemId } : {}}
							className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-ink"
						>
							Manage
						</Link>
						<Link
							to="/setup"
							search={{}}
							className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-ink"
						>
							Setup
						</Link>
					</div>
				</header>

				<section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
					<p className="text-xs uppercase tracking-[0.25em] text-ink-faint">Continue</p>
					<h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">
						{selectedBook?.title ?? "No books yet"}
					</h2>
					<p className="mt-2 text-sm text-ink-muted">
						{selectedBook?.overview || "Pick a title below and start reading."}
					</p>
					<div className="mt-4 flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => {
								if (selectedBook?.id) {
									void openReader(selectedBook.id);
								}
							}}
							disabled={!selectedBook?.id || readerLoading}
							className="rounded-full bg-moss px-5 py-2 text-sm font-semibold text-abyss disabled:opacity-60"
						>
							{readerLoading ? "Opening..." : "Open reader"}
						</button>
					</div>
					{readerError ? <p className="mt-3 text-sm text-coral">{readerError}</p> : null}
				</section>

				<section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
					<div className="flex gap-2">
						<input
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void handleSearch();
								}
							}}
							placeholder="Search books"
							className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none focus:border-moss/40"
						/>
						<button
							type="button"
							onClick={() => void handleSearch()}
							disabled={searchLoading}
							className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-abyss disabled:opacity-60"
						>
							{searchLoading ? "..." : "Search"}
						</button>
						{searchResults.length > 0 ? (
							<button
								type="button"
								onClick={() => {
									setSearchQuery("");
									setSearchResults([]);
								}}
								className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-ink"
							>
								Clear
							</button>
						) : null}
					</div>
				</section>

				<section>
					<p className="mb-3 text-xs uppercase tracking-[0.25em] text-ink-faint">
						{searchResults.length > 0 ? "Search results" : "Your books"}
					</p>
					{booksToShow.length === 0 ? (
						<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-ink-muted">
							{searchQuery.trim() ? "No matches found." : "No books found in this library yet."}
						</div>
					) : (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
							{booksToShow.map((book) => {
								const isActive = selectedItemId === book.id;
								return (
									<button
										key={book.id}
										type="button"
										onClick={() => setSelectedItemId(book.id)}
										className={`overflow-hidden rounded-2xl border bg-white/[0.03] text-left transition ${
											isActive ? "border-moss/50" : "border-white/10"
										}`}
									>
										<div className="aspect-[4/5] w-full bg-black/20">
											{book.coverUrl ? (
												<img
													src={book.coverUrl}
													alt={book.title}
													className="h-full w-full object-cover"
												/>
											) : (
												<div className="flex h-full items-center justify-center px-2 text-center text-xs text-ink-faint">
													{book.title}
												</div>
											)}
										</div>
										<div className="p-2">
											<p className="line-clamp-2 text-xs font-semibold text-ink">{book.title}</p>
										</div>
									</button>
								);
							})}
						</div>
					)}
				</section>
			</div>
		</main>
	);
}
