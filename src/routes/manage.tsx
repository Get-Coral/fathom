import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export const Route = createFileRoute("/manage")({
	validateSearch: (search: Record<string, unknown>): { itemId?: string } => ({
		...(typeof search.itemId === "string" && search.itemId.trim().length > 0
			? { itemId: search.itemId.trim() }
			: {}),
	}),
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
	component: ManagePage,
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Manage page intentionally orchestrates many explicit library actions in one route.
function ManagePage() {
	const initialDashboard = Route.useLoaderData();
	const { itemId: searchItemId } = Route.useSearch();
	const [dashboard, setDashboard] = useState<FathomDashboardData>(initialDashboard);
	const initialItemId =
		searchItemId ??
		initialDashboard.featured?.id ??
		initialDashboard.recentBooks[0]?.id ??
		initialDashboard.libraryBooks[0]?.id ??
		null;
	const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId);
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
	const [readerSession, setReaderSession] = useState<FathomReaderSession | null>(null);
	const [readerLoading, setReaderLoading] = useState(false);

	const titles = useMemo(() => {
		const map = new Map<string, FathomBookCard>();
		for (const item of [
			...dashboard.recentBooks,
			...dashboard.libraryBooks,
			...dashboard.collections,
		]) {
			if (!map.has(item.id)) {
				map.set(item.id, item);
			}
		}

		return [...map.values()];
	}, [dashboard]);

	const reloadDashboard = useCallback(async () => {
		const nextDashboard = await fetchDashboard();
		setDashboard(nextDashboard);
		return nextDashboard;
	}, []);

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
		if (!selectedItemId) {
			setSelectedDetail(null);
			setRemoteImages([]);
			setRemoteImagesError(null);
			return;
		}

		const itemId = selectedItemId;
		let cancelled = false;

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Explicit loading/error/cancel control keeps mutations predictable.
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
						loadError instanceof Error ? loadError.message : "Could not load title details.",
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

	useEffect(() => {
		if (!selectedDetail) {
			return;
		}

		setMetadataTitle(selectedDetail.title);
		setMetadataOverview(selectedDetail.overview);
		setMetadataYear(selectedDetail.year ? String(selectedDetail.year) : "");
		setMetadataGenres(selectedDetail.genres.join(", "));
	}, [selectedDetail]);

	const handleFindCoverOptions = useCallback(async (itemId: string) => {
		try {
			setRemoteImagesLoading(true);
			setRemoteImagesError(null);
			const images = await fetchRemoteCoverOptions({ data: { itemId } });
			setRemoteImages(images);
		} catch (loadError) {
			setRemoteImagesError(
				loadError instanceof Error ? loadError.message : "Could not fetch remote covers.",
			);
		} finally {
			setRemoteImagesLoading(false);
		}
	}, []);

	async function refreshAfterLibraryAction(itemId: string) {
		await Promise.all([reloadDashboard(), reloadCollections()]);
		const detail = await fetchBookDetail({ data: { itemId } });
		setSelectedDetail(detail);
	}

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
				applyError instanceof Error ? applyError.message : "Could not apply this cover.",
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
			setBulkCoverMessage(
				`Checked ${result.processed}, updated ${result.updated}${result.failures > 0 ? `, ${result.failures} failed` : ""}.`,
			);
		} catch (error) {
			setBulkCoverMessage(error instanceof Error ? error.message : "Could not auto-fill covers.");
		} finally {
			setBulkCoverLoading(false);
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
				data: { itemId: selectedDetail.id, nextFavorite: !selectedDetail.isFavorite },
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
				data: { itemId: selectedDetail.id, name: newCollectionName.trim() },
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

	return (
		<>
			<main className="min-h-screen bg-abyss px-4 py-6 text-ink sm:px-6 sm:py-8 xl:px-10 2xl:px-14">
				<div className="mx-auto max-w-[96rem]">
					<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-xs uppercase tracking-[0.35em] text-moss">Library Manage</p>
							<h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
								Manage your collection
							</h1>
						</div>
						<div className="flex gap-2">
							<Link
								to="/"
								className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-ink"
							>
								Back to reading
							</Link>
							<button
								type="button"
								onClick={() => void handleAutofillMissingCovers()}
								disabled={bulkCoverLoading}
								className="rounded-full border border-moss/40 bg-moss/12 px-4 py-2 text-sm font-semibold text-moss disabled:opacity-60"
							>
								{bulkCoverLoading ? "Finding covers…" : "Auto-fill covers"}
							</button>
						</div>
					</div>

					{bulkCoverMessage ? (
						<div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-muted">
							{bulkCoverMessage}
						</div>
					) : null}

					<div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
						<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
							<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">Titles</p>
							<div className="mt-3 space-y-2">
								{titles.map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() => setSelectedItemId(item.id)}
										className={`w-full rounded-2xl border px-3 py-3 text-left text-sm ${
											selectedItemId === item.id
												? "border-moss/40 bg-moss/10 text-ink"
												: "border-white/10 bg-black/20 text-ink-muted"
										}`}
									>
										<p className="line-clamp-1 font-semibold text-ink">{item.title}</p>
										<p className="mt-1 text-xs uppercase tracking-[0.2em]">{item.type}</p>
									</button>
								))}
							</div>
						</section>

						<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
							{detailLoading ? (
								<div className="space-y-4 animate-pulse">
									<div className="h-64 rounded-3xl bg-white/5" />
									<div className="h-8 w-2/3 rounded-2xl bg-white/10" />
								</div>
							) : detailError ? (
								<div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
									{detailError}
								</div>
							) : selectedDetail ? (
								<div>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<h2 className="font-display text-3xl text-ink">{selectedDetail.title}</h2>
										<div className="flex gap-2">
											<button
												type="button"
												onClick={() => void handleOpenReader()}
												disabled={readerLoading}
												className="rounded-full bg-moss px-4 py-2 text-xs font-semibold text-abyss disabled:opacity-60"
											>
												{readerLoading ? "Opening…" : "Read"}
											</button>
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
										</div>
									</div>

									{libraryMessage ? (
										<div className="mt-3 rounded-2xl border border-moss/30 bg-moss/10 px-4 py-3 text-sm text-moss">
											{libraryMessage}
										</div>
									) : null}
									{libraryError ? (
										<div className="mt-3 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
											{libraryError}
										</div>
									) : null}

									<div className="mt-5 rounded-3xl border border-white/10 bg-black/15 p-4">
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
												{remoteImagesLoading ? "Finding covers…" : "Find covers"}
											</button>
										</div>
										{remoteImagesError ? (
											<div className="mt-3 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
												{remoteImagesError}
											</div>
										) : null}
										{remoteImages.length > 0 ? (
											<div className="mt-3 grid gap-3 sm:grid-cols-2">
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
															<p className="text-sm font-semibold text-ink">{image.providerName}</p>
															<button
																type="button"
																onClick={() => handleApplyRemoteCover(selectedDetail.id, image.url)}
																disabled={coverApplying !== null}
																className="mt-2 rounded-full bg-moss px-3 py-2 text-xs font-semibold text-abyss disabled:opacity-60"
															>
																{coverApplying === image.url ? "Applying…" : "Use"}
															</button>
														</div>
													</div>
												))}
											</div>
										) : null}
									</div>

									<div className="mt-5 rounded-3xl border border-white/10 bg-black/15 p-4">
										<p className="text-xs uppercase tracking-[0.25em] text-ink-faint">Metadata</p>
										<div className="mt-3 grid gap-3">
											<input
												value={metadataTitle}
												onChange={(event) => setMetadataTitle(event.target.value)}
												placeholder="Title"
												className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none"
											/>
											<input
												value={metadataYear}
												onChange={(event) => setMetadataYear(event.target.value)}
												placeholder="Year"
												className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none"
											/>
											<input
												value={metadataGenres}
												onChange={(event) => setMetadataGenres(event.target.value)}
												placeholder="Genres (comma separated)"
												className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none"
											/>
											<textarea
												value={metadataOverview}
												onChange={(event) => setMetadataOverview(event.target.value)}
												rows={4}
												placeholder="Overview"
												className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink outline-none"
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

									<div className="mt-5 rounded-3xl border border-white/10 bg-black/15 p-4">
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

									<div className="mt-5 rounded-3xl border border-coral/30 bg-coral/10 p-4">
										<p className="text-xs uppercase tracking-[0.25em] text-coral/90">Danger zone</p>
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
								<div className="rounded-3xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-ink-muted">
									Select a title to manage.
								</div>
							)}
						</section>
					</div>
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
