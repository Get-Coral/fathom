import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BookReader } from "#/components/BookReader";
import type {
	FathomBookCard,
	FathomBookDetail,
	FathomCollectionOption,
	FathomDashboardData,
	FathomReaderSession,
	FathomRemoteImageCandidate,
} from "#/lib/jellyfin";
import {
	addItemToCollection,
	applyRemoteCover,
	autofillMissingCovers,
	createCollectionForItem,
	fetchBookDetail,
	fetchCollectionOptions,
	fetchDashboard,
	fetchReaderSession,
	fetchRemoteCoverOptions,
	fetchSetupStatus,
	removeItemFromCollection,
	removeLibraryItem,
	saveBookMetadata,
	searchLibrary,
	toggleFavorite,
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Home intentionally composes many conditional UI sections.
function Home() {
	const initialDashboard = Route.useLoaderData();
	const [dashboard, setDashboard] = useState<FathomDashboardData>(initialDashboard);
	const firstBookId =
		initialDashboard.featured?.id ??
		initialDashboard.recentBooks[0]?.id ??
		initialDashboard.libraryBooks[0]?.id ??
		null;
	const [selectedItemId, setSelectedItemId] = useState<string | null>(firstBookId);
	const [selectedDetail, setSelectedDetail] = useState<FathomBookDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailError, setDetailError] = useState<string | null>(null);
	const [remoteImages, setRemoteImages] = useState<FathomRemoteImageCandidate[]>([]);
	const [remoteImagesLoading, setRemoteImagesLoading] = useState(false);
	const [remoteImagesError, setRemoteImagesError] = useState<string | null>(null);
	const [coverApplying, setCoverApplying] = useState<string | null>(null);
	const [bulkCoverLoading, setBulkCoverLoading] = useState(false);
	const [bulkCoverMessage, setBulkCoverMessage] = useState<string | null>(null);
	const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
	const [libraryError, setLibraryError] = useState<string | null>(null);
	const [metadataSaving, setMetadataSaving] = useState(false);
	const [favoriteSaving, setFavoriteSaving] = useState(false);
	const [deletingItem, setDeletingItem] = useState(false);
	const [collectionActionLoading, setCollectionActionLoading] = useState(false);
	const [collectionOptions, setCollectionOptions] = useState<FathomCollectionOption[]>([]);
	const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
	const [newCollectionName, setNewCollectionName] = useState("");
	const [metadataTitle, setMetadataTitle] = useState("");
	const [metadataOverview, setMetadataOverview] = useState("");
	const [metadataYear, setMetadataYear] = useState("");
	const [metadataGenres, setMetadataGenres] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<FathomBookCard[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [readerSession, setReaderSession] = useState<FathomReaderSession | null>(null);
	const [readerLoading, setReaderLoading] = useState(false);
	const [manageOpen, setManageOpen] = useState(false);

	async function reloadDashboard() {
		const nextDashboard = await fetchDashboard();
		setDashboard(nextDashboard);
		return nextDashboard;
	}

	useEffect(() => {
		if (!selectedItemId) {
			setSelectedDetail(null);
			setRemoteImages([]);
			setRemoteImagesError(null);
			return;
		}

		const itemId = selectedItemId;
		let cancelled = false;

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Error and cancellation handling is intentionally explicit.
		async function loadDetail() {
			try {
				setDetailLoading(true);
				setDetailError(null);
				const detail = await fetchBookDetail({ data: { itemId } });
				if (!cancelled) {
					setSelectedDetail(detail);
					setRemoteImages([]);
					setRemoteImagesError(null);
				}
			} catch (loadError) {
				if (!cancelled) {
					setDetailError(
						loadError instanceof Error ? loadError.message : "Could not load the title details.",
					);
				}
			} finally {
				if (!cancelled) {
					setDetailLoading(false);
				}
			}
		}

		void loadDetail();

		return () => {
			cancelled = true;
		};
	}, [selectedItemId]);

	const handleFindCoverOptions = useCallback(async (itemId: string) => {
		try {
			setRemoteImagesLoading(true);
			setRemoteImagesError(null);
			const images = await fetchRemoteCoverOptions({ data: { itemId } });
			setRemoteImages(images);
		} catch (loadError) {
			setRemoteImagesError(
				loadError instanceof Error ? loadError.message : "Could not fetch remote cover options.",
			);
		} finally {
			setRemoteImagesLoading(false);
		}
	}, []);

	async function handleApplyRemoteCover(itemId: string, imageUrl: string) {
		try {
			setCoverApplying(imageUrl);
			setRemoteImagesError(null);
			await applyRemoteCover({ data: { itemId, imageUrl } });
			await reloadDashboard();
			const detail = await fetchBookDetail({ data: { itemId } });
			setSelectedDetail(detail);
			setRemoteImages([]);
		} catch (applyError) {
			setRemoteImagesError(
				applyError instanceof Error
					? applyError.message
					: "Could not apply this cover in Jellyfin.",
			);
		} finally {
			setCoverApplying(null);
		}
	}

	async function handleAutofillMissingCovers() {
		try {
			setBulkCoverLoading(true);
			setBulkCoverMessage(null);
			const result = await autofillMissingCovers({ data: { limit: 12 } });
			await reloadDashboard();
			if (selectedItemId) {
				const detail = await fetchBookDetail({ data: { itemId: selectedItemId } });
				setSelectedDetail(detail);
			}

			setBulkCoverMessage(
				`Checked ${result.processed} titles, updated ${result.updated} cover${result.updated === 1 ? "" : "s"}${result.externalCandidatesUsed > 0 ? ` (${result.externalCandidatesUsed} from external APIs)` : ""}${result.uploadFallbackUsed > 0 ? `, ${result.uploadFallbackUsed} via direct upload` : ""}${result.failures > 0 ? `, ${result.failures} failed` : ""}.`,
			);
		} catch (error) {
			setBulkCoverMessage(
				error instanceof Error ? error.message : "Could not auto-fill missing covers right now.",
			);
		} finally {
			setBulkCoverLoading(false);
		}
	}

	const reloadCollections = useCallback(async () => {
		const collections = await fetchCollectionOptions();
		setCollectionOptions(collections);
		if (!selectedCollectionId && collections[0]) {
			setSelectedCollectionId(collections[0].id);
		}
	}, [selectedCollectionId]);

	useEffect(() => {
		void reloadCollections();
	}, [reloadCollections]);

	useEffect(() => {
		if (!selectedDetail) {
			return;
		}

		setMetadataTitle(selectedDetail.title);
		setMetadataOverview(selectedDetail.overview);
		setMetadataYear(selectedDetail.year ? String(selectedDetail.year) : "");
		setMetadataGenres(selectedDetail.genres.join(", "));
	}, [selectedDetail]);

	useEffect(() => {
		if (!selectedItemId) {
			return;
		}

		setManageOpen(false);
	}, [selectedItemId]);

	async function refreshAfterLibraryAction(itemId: string) {
		await Promise.all([reloadDashboard(), reloadCollections()]);
		const detail = await fetchBookDetail({ data: { itemId } });
		setSelectedDetail(detail);
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
		} finally {
			setSearchLoading(false);
		}
	}

	async function handleOpenReader() {
		if (!selectedDetail) {
			return;
		}

		try {
			setReaderLoading(true);
			setLibraryError(null);
			const session = await fetchReaderSession({ data: { itemId: selectedDetail.id } });
			setReaderSession(session);
		} catch (error) {
			setLibraryError(error instanceof Error ? error.message : "Could not open reader.");
		} finally {
			setReaderLoading(false);
		}
	}

	async function handleSaveMetadata() {
		if (!selectedDetail) {
			return;
		}

		try {
			setMetadataSaving(true);
			setLibraryError(null);
			setLibraryMessage(null);
			const year = metadataYear.trim() ? Number.parseInt(metadataYear.trim(), 10) : undefined;
			if (metadataYear.trim() && Number.isNaN(year)) {
				throw new Error("Year must be a valid number.");
			}

			const genres = metadataGenres
				.split(",")
				.map((genre) => genre.trim())
				.filter(Boolean);

			const updated = await saveBookMetadata({
				data: {
					itemId: selectedDetail.id,
					title: metadataTitle.trim() || selectedDetail.title,
					overview: metadataOverview.trim(),
					year,
					genres,
				},
			});

			setSelectedDetail(updated);
			await reloadDashboard();
			setLibraryMessage("Metadata saved.");
		} catch (error) {
			setLibraryError(error instanceof Error ? error.message : "Could not save metadata.");
		} finally {
			setMetadataSaving(false);
		}
	}

	async function handleToggleFavorite() {
		if (!selectedDetail) {
			return;
		}

		try {
			setFavoriteSaving(true);
			setLibraryError(null);
			setLibraryMessage(null);
			await toggleFavorite({
				data: {
					itemId: selectedDetail.id,
					nextFavorite: !selectedDetail.isFavorite,
				},
			});
			await refreshAfterLibraryAction(selectedDetail.id);
			setLibraryMessage(
				selectedDetail.isFavorite ? "Removed from favorites." : "Marked as favorite.",
			);
		} catch (error) {
			setLibraryError(error instanceof Error ? error.message : "Could not update favorite.");
		} finally {
			setFavoriteSaving(false);
		}
	}

	async function handleDeleteItem() {
		if (!selectedDetail) {
			return;
		}

		const confirmed = window.confirm(`Delete "${selectedDetail.title}" from Jellyfin?`);
		if (!confirmed) {
			return;
		}

		try {
			setDeletingItem(true);
			setLibraryError(null);
			setLibraryMessage(null);
			await removeLibraryItem({ data: { itemId: selectedDetail.id } });
			const nextDashboard = await reloadDashboard();
			const nextItemId =
				nextDashboard.recentBooks[0]?.id ??
				nextDashboard.libraryBooks[0]?.id ??
				nextDashboard.featured?.id;
			setSelectedItemId(nextItemId ?? null);
			setSelectedDetail(null);
			setLibraryMessage("Item deleted.");
		} catch (error) {
			setLibraryError(error instanceof Error ? error.message : "Could not delete item.");
		} finally {
			setDeletingItem(false);
		}
	}

	async function handleAddToCollection() {
		if (!selectedDetail || !selectedCollectionId) {
			return;
		}

		try {
			setCollectionActionLoading(true);
			setLibraryError(null);
			setLibraryMessage(null);
			await addItemToCollection({
				data: { itemId: selectedDetail.id, collectionId: selectedCollectionId },
			});
			await refreshAfterLibraryAction(selectedDetail.id);
			setLibraryMessage("Added to collection.");
		} catch (error) {
			setLibraryError(error instanceof Error ? error.message : "Could not add to collection.");
		} finally {
			setCollectionActionLoading(false);
		}
	}

	async function handleRemoveFromCollection() {
		if (!selectedDetail || !selectedCollectionId) {
			return;
		}

		try {
			setCollectionActionLoading(true);
			setLibraryError(null);
			setLibraryMessage(null);
			await removeItemFromCollection({
				data: { itemId: selectedDetail.id, collectionId: selectedCollectionId },
			});
			await refreshAfterLibraryAction(selectedDetail.id);
			setLibraryMessage("Removed from collection.");
		} catch (error) {
			setLibraryError(error instanceof Error ? error.message : "Could not remove from collection.");
		} finally {
			setCollectionActionLoading(false);
		}
	}

	async function handleCreateCollection() {
		if (!selectedDetail || !newCollectionName.trim()) {
			return;
		}

		try {
			setCollectionActionLoading(true);
			setLibraryError(null);
			setLibraryMessage(null);
			const created = await createCollectionForItem({
				data: {
					itemId: selectedDetail.id,
					name: newCollectionName.trim(),
				},
			});
			setNewCollectionName("");
			await reloadCollections();
			setSelectedCollectionId(created.id);
			await refreshAfterLibraryAction(selectedDetail.id);
			setLibraryMessage("Collection created and item added.");
		} catch (error) {
			setLibraryError(error instanceof Error ? error.message : "Could not create collection.");
		} finally {
			setCollectionActionLoading(false);
		}
	}

	useEffect(() => {
		if (
			!selectedDetail ||
			selectedDetail.coverUrl ||
			remoteImagesLoading ||
			remoteImages.length > 0
		) {
			return;
		}

		void handleFindCoverOptions(selectedDetail.id);
	}, [handleFindCoverOptions, selectedDetail, remoteImagesLoading, remoteImages.length]);

	const stats = [
		{
			label: "Books",
			value: dashboard.itemCounts.BookCount ?? dashboard.libraryBooks.length,
		},
		{ label: "Collections", value: dashboard.collections.length },
		{ label: "Continue list", value: dashboard.recentBooks.length },
		{ label: "Server", value: dashboard.systemInfo.ServerName },
	];

	const continueBook =
		selectedDetail ??
		dashboard.recentBooks.find((item) => item.id === selectedItemId) ??
		dashboard.recentBooks[0] ??
		dashboard.featured;

	return (
		<>
			<main className="min-h-screen bg-abyss px-4 py-6 text-ink sm:px-6 sm:py-8 xl:px-10 2xl:px-14">
				<div className="mx-auto max-w-[96rem]">
					<div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.35em] text-moss">
								Fathom Home
							</p>
							<h1 className="mt-3 max-w-4xl font-display text-4xl leading-none text-ink sm:text-5xl xl:text-6xl">
								Pick up where you left off
							</h1>
							<p className="mt-4 max-w-3xl text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
								Jump straight into your next chapter, discover a new title from your shelves, and
								keep your library flowing without leaving the couch.
							</p>
						</div>

						<div className="flex flex-wrap gap-3">
							<button
								type="button"
								onClick={handleAutofillMissingCovers}
								disabled={bulkCoverLoading}
								className="rounded-full border border-moss/40 bg-moss/12 px-5 py-3 text-sm font-semibold text-moss disabled:opacity-60"
							>
								{bulkCoverLoading ? "Finding covers…" : "Auto-fill missing covers"}
							</button>
							<Link
								to="/setup"
								search={{}}
								className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-ink"
							>
								Edit connection
							</Link>
						</div>
					</div>

					<section className="mb-6 overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-moss/18 via-white/[0.04] to-coral/10 p-4 sm:p-6 xl:p-7">
						<div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_18rem] lg:items-center">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">
									Continue reading
								</p>
								<h2 className="mt-2 font-display text-3xl text-ink sm:text-4xl">
									{continueBook?.title ?? "No recent book yet"}
								</h2>
								<p className="mt-2 text-xs uppercase tracking-[0.25em] text-ink-faint">
									{continueBook?.type ?? "Book"}
									{continueBook?.year ? ` · ${continueBook.year}` : ""}
								</p>
								<p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted sm:text-base">
									{continueBook?.overview ||
										"Start with one from your recent shelf and Fathom will keep your reading flow in sync."}
								</p>
								<div className="mt-5 flex flex-wrap gap-2">
									<button
										type="button"
										onClick={() => {
											if (continueBook?.id) {
												setSelectedItemId(continueBook.id);
												void handleOpenReader();
											}
										}}
										disabled={!continueBook?.id || readerLoading}
										className="rounded-full bg-moss px-5 py-2 text-sm font-semibold text-abyss disabled:opacity-60"
									>
										{readerLoading ? "Opening…" : "Resume reading"}
									</button>
									<button
										type="button"
										onClick={() => {
											if (dashboard.libraryBooks[0]) {
												setSelectedItemId(dashboard.libraryBooks[0].id);
											}
										}}
										className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-ink"
									>
										Try something new
									</button>
								</div>
							</div>
							<div className="mx-auto w-full max-w-72 overflow-hidden rounded-[1.4rem] border border-white/10 bg-black/20">
								{continueBook?.coverUrl ? (
									<img
										src={continueBook.coverUrl}
										alt={continueBook.title}
										className="aspect-[4/5] w-full object-cover"
									/>
								) : (
									<div className="flex aspect-[4/5] items-center justify-center bg-gradient-to-br from-moss/15 to-coral/10 px-5 text-center font-display text-2xl text-ink-faint">
										{continueBook?.title ?? "No cover yet"}
									</div>
								)}
							</div>
						</div>
					</section>

					{bulkCoverMessage ? (
						<div className="mb-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-muted">
							{bulkCoverMessage}
						</div>
					) : null}

					<section className="mb-6 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
						<div className="flex flex-wrap items-end gap-3">
							<div className="min-w-[16rem] flex-1">
								<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">Search</p>
								<input
									value={searchQuery}
									onChange={(event) => setSearchQuery(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											void handleSearch();
										}
									}}
									placeholder="Find titles by name"
									className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-ink outline-none focus:border-moss/40"
								/>
							</div>
							<button
								type="button"
								onClick={() => void handleSearch()}
								disabled={searchLoading}
								className="rounded-full bg-moss px-5 py-3 text-sm font-semibold text-abyss disabled:opacity-60"
							>
								{searchLoading ? "Searching…" : "Search"}
							</button>
							<button
								type="button"
								onClick={() => {
									setSearchQuery("");
									setSearchResults([]);
								}}
								className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-ink"
							>
								Clear
							</button>
						</div>

						{searchResults.length > 0 ? (
							<div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
								{searchResults.map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() => setSelectedItemId(item.id)}
										className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-ink hover:border-moss/40"
									>
										<p className="line-clamp-1 font-semibold">{item.title}</p>
										<p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink-faint">
											{item.type}
											{item.year ? ` · ${item.year}` : ""}
										</p>
									</button>
								))}
							</div>
						) : null}
					</section>

					<div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
						{stats.map((stat) => (
							<section
								key={stat.label}
								className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5"
							>
								<p className="text-sm uppercase tracking-[0.25em] text-ink-faint">{stat.label}</p>
								<p className="mt-3 font-display text-2xl text-ink sm:text-3xl">{stat.value}</p>
							</section>
						))}
					</div>

					<div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.32fr)_minmax(22rem,0.68fr)]">
						<section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 xl:p-7">
							<div className="flex items-center justify-between gap-4">
								<div>
									<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">Featured</p>
									<h2 className="mt-2 font-display text-3xl">Start here</h2>
								</div>
								<div className="rounded-full bg-moss/12 px-3 py-1 text-sm text-moss">
									{dashboard.currentUser.name}
								</div>
							</div>

							{dashboard.featured ? (
								<div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
									<div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/20">
										{dashboard.featured.coverUrl ? (
											<img
												src={dashboard.featured.coverUrl}
												alt={dashboard.featured.title}
												className="h-full min-h-80 w-full object-cover"
											/>
										) : (
											<div className="flex min-h-80 items-center justify-center bg-gradient-to-br from-moss/15 to-coral/10 px-6 text-center font-display text-3xl text-ink-faint">
												{dashboard.featured.title}
											</div>
										)}
									</div>

									<div className="flex flex-col justify-center">
										<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">
											Latest addition
										</p>
										<h3 className="mt-3 font-display text-4xl text-ink">
											{dashboard.featured.title}
										</h3>
										<p className="mt-3 text-sm uppercase tracking-[0.25em] text-ink-faint">
											{dashboard.featured.type}
											{dashboard.featured.year ? ` · ${dashboard.featured.year}` : ""}
										</p>
										<p className="mt-5 max-w-2xl text-base leading-8 text-ink-muted">
											{dashboard.featured.overview ||
												"No overview has been added for this title yet."}
										</p>
										<div className="mt-5 flex flex-wrap gap-2">
											{dashboard.featured.genres.length > 0 ? (
												dashboard.featured.genres.map((genre) => (
													<span
														key={genre}
														className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-ink-muted"
													>
														{genre}
													</span>
												))
											) : (
												<span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-ink-muted">
													Metadata still sparse
												</span>
											)}
										</div>
									</div>
								</div>
							) : (
								<div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-ink-muted">
									No reading titles were found yet in Jellyfin.
								</div>
							)}
						</section>

						<aside className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 xl:p-7">
							<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">Reading detail</p>
							{detailLoading ? (
								<div className="mt-6 space-y-4 animate-pulse">
									<div className="h-64 rounded-3xl bg-white/5" />
									<div className="h-8 w-2/3 rounded-2xl bg-white/10" />
									<div className="h-20 rounded-3xl bg-white/5" />
								</div>
							) : detailError ? (
								<div className="mt-6 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
									{detailError}
								</div>
							) : selectedDetail ? (
								<div className="mt-6">
									<div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/20">
										{selectedDetail.coverUrl ? (
											<img
												src={selectedDetail.coverUrl}
												alt={selectedDetail.title}
												className="h-80 w-full object-cover"
											/>
										) : (
											<div className="flex h-80 items-center justify-center bg-gradient-to-br from-moss/15 to-coral/10 px-6 text-center font-display text-3xl text-ink-faint">
												{selectedDetail.title}
											</div>
										)}
									</div>
									<h2 className="mt-6 font-display text-3xl text-ink">{selectedDetail.title}</h2>
									<div className="mt-4 flex flex-wrap gap-2">
										<button
											type="button"
											onClick={() => void handleOpenReader()}
											disabled={readerLoading}
											className="rounded-full bg-moss px-4 py-2 text-xs font-semibold text-abyss disabled:opacity-60"
										>
											{readerLoading ? "Opening…" : "Read in app"}
										</button>
										<a
											href={selectedDetail.jellyfinWebUrl}
											target="_blank"
											rel="noreferrer"
											className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-ink"
										>
											Read in Jellyfin
										</a>
										<button
											type="button"
											onClick={() => void handleToggleFavorite()}
											disabled={favoriteSaving}
											className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-ink disabled:opacity-60"
										>
											{favoriteSaving
												? "Saving…"
												: selectedDetail.isFavorite
													? "Unfavorite"
													: "Favorite"}
										</button>
										<button
											type="button"
											onClick={() => setManageOpen((open) => !open)}
											className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-ink"
										>
											{manageOpen ? "Close manage" : "Manage"}
										</button>
									</div>
									<p className="mt-2 text-sm uppercase tracking-[0.25em] text-ink-faint">
										{selectedDetail.type}
										{selectedDetail.year ? ` · ${selectedDetail.year}` : ""}
										{selectedDetail.publisher ? ` · ${selectedDetail.publisher}` : ""}
									</p>
									{libraryMessage ? (
										<div className="mt-4 rounded-2xl border border-moss/30 bg-moss/10 px-4 py-3 text-sm text-moss">
											{libraryMessage}
										</div>
									) : null}
									{libraryError ? (
										<div className="mt-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
											{libraryError}
										</div>
									) : null}
									<p className="mt-5 text-sm leading-8 text-ink-muted">
										{selectedDetail.overview || "No overview available for this title yet."}
									</p>

									<div className="mt-5 flex flex-wrap gap-2">
										{selectedDetail.genres.length > 0 ? (
											selectedDetail.genres.map((genre) => (
												<span
													key={genre}
													className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-ink-muted"
												>
													{genre}
												</span>
											))
										) : (
											<span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-ink-muted">
												No genres yet
											</span>
										)}
									</div>

									<div className="mt-6 rounded-3xl border border-white/10 bg-black/15 p-4">
										<div className="flex flex-wrap items-center justify-between gap-3">
											<p className="text-xs uppercase tracking-[0.25em] text-ink-faint">
												Library management
											</p>
											<button
												type="button"
												onClick={() => setManageOpen((open) => !open)}
												className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-ink"
											>
												{manageOpen ? "Hide controls" : "Manage this title"}
											</button>
										</div>

										{manageOpen ? (
											<div className="mt-4 space-y-6">
												<div className="rounded-3xl border border-white/10 bg-black/20 p-4">
													<div className="flex flex-wrap items-center justify-between gap-3">
														<p className="text-xs uppercase tracking-[0.25em] text-ink-faint">
															Cover actions
														</p>
														<button
															type="button"
															onClick={() => handleFindCoverOptions(selectedDetail.id)}
															disabled={remoteImagesLoading || coverApplying !== null}
															className="rounded-full bg-moss/12 px-3 py-2 text-xs font-semibold text-moss disabled:opacity-60"
														>
															{remoteImagesLoading
																? "Finding covers…"
																: selectedDetail.coverUrl
																	? "Find better cover"
																	: "Find cover"}
														</button>
													</div>
													{remoteImagesError ? (
														<div className="mt-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
															{remoteImagesError}
														</div>
													) : null}
													{remoteImages.length > 0 ? (
														<div className="mt-4 grid gap-3 sm:grid-cols-2">
															{remoteImages.slice(0, 6).map((image) => (
																<div
																	key={image.url}
																	className="overflow-hidden rounded-3xl border border-white/10 bg-black/20"
																>
																	<img
																		src={image.thumbnailUrl}
																		alt={`${selectedDetail.title} from ${image.providerName}`}
																		className="aspect-[4/5] w-full object-cover"
																	/>
																	<div className="p-3">
																		<p className="text-sm font-semibold text-ink">
																			{image.providerName}
																		</p>
																		<p className="mt-1 text-xs text-ink-faint">
																			{image.width && image.height
																				? `${image.width} × ${image.height}`
																				: "Unknown size"}
																			{image.communityRating
																				? ` · ${image.communityRating.toFixed(1)} rating`
																				: ""}
																		</p>
																		<button
																			type="button"
																			onClick={() =>
																				handleApplyRemoteCover(selectedDetail.id, image.url)
																			}
																			disabled={coverApplying !== null}
																			className="mt-3 rounded-full bg-moss px-4 py-2 text-xs font-semibold text-abyss disabled:opacity-60"
																		>
																			{coverApplying === image.url ? "Applying…" : "Use this cover"}
																		</button>
																	</div>
																</div>
															))}
														</div>
													) : null}
												</div>

												<div className="rounded-3xl border border-white/10 bg-black/20 p-4">
													<p className="text-xs uppercase tracking-[0.25em] text-ink-faint">
														Metadata
													</p>
													<div className="mt-3 space-y-3">
														<input
															value={metadataTitle}
															onChange={(event) => setMetadataTitle(event.target.value)}
															placeholder="Title"
															className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none focus:border-moss/40"
														/>
														<input
															value={metadataYear}
															onChange={(event) => setMetadataYear(event.target.value)}
															placeholder="Year"
															className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none focus:border-moss/40"
														/>
														<input
															value={metadataGenres}
															onChange={(event) => setMetadataGenres(event.target.value)}
															placeholder="Genres (comma separated)"
															className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none focus:border-moss/40"
														/>
														<textarea
															value={metadataOverview}
															onChange={(event) => setMetadataOverview(event.target.value)}
															rows={4}
															placeholder="Overview"
															className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none focus:border-moss/40"
														/>
													</div>
													<button
														type="button"
														onClick={() => void handleSaveMetadata()}
														disabled={metadataSaving}
														className="mt-3 rounded-full bg-moss px-4 py-2 text-xs font-semibold text-abyss disabled:opacity-60"
													>
														{metadataSaving ? "Saving…" : "Save metadata"}
													</button>
												</div>

												<div className="rounded-3xl border border-white/10 bg-black/20 p-4">
													<p className="text-xs uppercase tracking-[0.25em] text-ink-faint">
														Collections
													</p>
													<div className="mt-3 flex flex-wrap gap-2">
														<select
															value={selectedCollectionId}
															onChange={(event) => setSelectedCollectionId(event.target.value)}
															className="min-w-[12rem] rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none"
														>
															<option value="">Select collection</option>
															{collectionOptions.map((collection) => (
																<option key={collection.id} value={collection.id}>
																	{collection.name}
																</option>
															))}
														</select>
														<button
															type="button"
															onClick={() => void handleAddToCollection()}
															disabled={collectionActionLoading || !selectedCollectionId}
															className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-ink disabled:opacity-60"
														>
															Add
														</button>
														<button
															type="button"
															onClick={() => void handleRemoveFromCollection()}
															disabled={collectionActionLoading || !selectedCollectionId}
															className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-ink disabled:opacity-60"
														>
															Remove
														</button>
													</div>
													<div className="mt-3 flex flex-wrap gap-2">
														<input
															value={newCollectionName}
															onChange={(event) => setNewCollectionName(event.target.value)}
															placeholder="New collection name"
															className="min-w-[12rem] flex-1 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none"
														/>
														<button
															type="button"
															onClick={() => void handleCreateCollection()}
															disabled={collectionActionLoading || !newCollectionName.trim()}
															className="rounded-full bg-moss px-4 py-2 text-xs font-semibold text-abyss disabled:opacity-60"
														>
															Create + add
														</button>
													</div>
												</div>

												<div className="rounded-3xl border border-coral/30 bg-coral/10 p-4">
													<p className="text-xs uppercase tracking-[0.25em] text-coral/90">
														Danger zone
													</p>
													<button
														type="button"
														onClick={() => void handleDeleteItem()}
														disabled={deletingItem}
														className="mt-3 rounded-full border border-coral/40 bg-coral/20 px-4 py-2 text-xs font-semibold text-coral disabled:opacity-60"
													>
														{deletingItem ? "Deleting…" : "Delete from library"}
													</button>
												</div>
											</div>
										) : (
											<p className="mt-4 text-sm text-ink-muted">
												Management controls are hidden. Open this panel to edit metadata,
												collections, or covers.
											</p>
										)}
									</div>

									<div className="mt-6 rounded-3xl border border-white/10 bg-black/15 p-4">
										<p className="text-xs uppercase tracking-[0.25em] text-ink-faint">
											Contributors
										</p>
										<div className="mt-3 space-y-2">
											{selectedDetail.people.length > 0 ? (
												selectedDetail.people.slice(0, 6).map((person) => (
													<div
														key={person.id}
														className="flex items-center justify-between gap-3 text-sm text-ink-muted"
													>
														<span className="text-ink">{person.name}</span>
														<span>{person.role || person.type || "Contributor"}</span>
													</div>
												))
											) : (
												<p className="text-sm text-ink-muted">
													No contributor metadata is available yet.
												</p>
											)}
										</div>
									</div>
								</div>
							) : (
								<div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-ink-muted">
									Select a title to inspect it in more detail.
								</div>
							)}
						</aside>
					</div>

					<div className="mt-6 grid gap-6">
						<ShelfSection
							title="Recently added"
							subtitle="Fresh arrivals from your Jellyfin reading library."
							items={dashboard.recentBooks}
							selectedItemId={selectedItemId}
							onSelect={setSelectedItemId}
						/>
						<ShelfSection
							title="Library shelf"
							subtitle="A calmer alphabetical pass through your books."
							items={dashboard.libraryBooks}
							selectedItemId={selectedItemId}
							onSelect={setSelectedItemId}
						/>
						<ShelfSection
							title="Collections"
							subtitle="Box sets, grouped editions, and reading bundles."
							items={dashboard.collections}
							selectedItemId={selectedItemId}
							onSelect={setSelectedItemId}
						/>
					</div>

					<section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 xl:p-7">
						<div className="flex items-center justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">Libraries</p>
								<h2 className="mt-2 font-display text-3xl">Virtual folders</h2>
							</div>
							<div className="rounded-full bg-moss/12 px-3 py-1 text-sm text-moss">
								{dashboard.virtualFolders.length} mounted
							</div>
						</div>

						<div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{dashboard.virtualFolders.map((folder) => (
								<div
									key={folder.ItemId}
									className="rounded-3xl border border-white/10 bg-black/15 p-5"
								>
									<h3 className="text-xl font-semibold text-ink">{folder.Name}</h3>
									<p className="mt-2 text-sm uppercase tracking-[0.25em] text-ink-faint">
										{folder.CollectionType || "Mixed"}
									</p>
									<div className="mt-4 flex flex-wrap gap-2">
										{folder.Locations?.map((location) => (
											<span
												key={location}
												className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-ink-muted"
											>
												{location}
											</span>
										))}
									</div>
								</div>
							))}
						</div>
					</section>
				</div>
			</main>

			{readerSession ? (
				<BookReader
					itemId={readerSession.itemId}
					format={readerSession.format}
					title={readerSession.title}
					url={readerSession.url}
					onClose={() => setReaderSession(null)}
				/>
			) : null}
		</>
	);
}

function ShelfSection(props: {
	title: string;
	subtitle: string;
	items: FathomBookCard[];
	selectedItemId: string | null;
	onSelect: (itemId: string) => void;
}) {
	return (
		<section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 xl:p-7">
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">{props.title}</p>
					<h2 className="mt-2 font-display text-2xl sm:text-3xl">{props.subtitle}</h2>
				</div>
				<div className="rounded-full bg-white/[0.05] px-3 py-1 text-sm text-ink-muted">
					{props.items.length} titles
				</div>
			</div>

			<div className="mt-6 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				<div className="flex gap-4 sm:gap-5">
					{props.items.length > 0 ? (
						props.items.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => props.onSelect(item.id)}
								className={`w-[12.5rem] shrink-0 overflow-hidden rounded-[1.4rem] border bg-black/15 text-left transition sm:w-[14rem] ${
									props.selectedItemId === item.id
										? "border-moss/40 bg-moss/8"
										: "border-white/10 hover:border-white/20"
								}`}
							>
								<div className="aspect-[4/5] bg-black/25">
									{item.coverUrl ? (
										<img
											src={item.coverUrl}
											alt={item.title}
											className="h-full w-full object-cover"
										/>
									) : (
										<div className="flex h-full items-center justify-center bg-gradient-to-br from-moss/15 to-coral/10 px-4 text-center font-display text-2xl text-ink-faint">
											{item.title}
										</div>
									)}
								</div>
								<div className="p-4">
									<h3 className="line-clamp-2 text-base font-semibold text-ink sm:text-lg">
										{item.title}
									</h3>
									<p className="mt-2 text-xs uppercase tracking-[0.25em] text-ink-faint">
										{item.type}
										{item.year ? ` · ${item.year}` : ""}
									</p>
									<p className="mt-3 line-clamp-3 text-xs leading-6 text-ink-muted sm:text-sm">
										{item.overview || "No overview available yet."}
									</p>
								</div>
							</button>
						))
					) : (
						<div className="rounded-3xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-ink-muted">
							No titles yet in this shelf.
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
