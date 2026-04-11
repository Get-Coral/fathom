import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type {
	FathomBookCard,
	FathomBookDetail,
	FathomDashboardData,
	FathomRemoteImageCandidate,
} from "#/lib/jellyfin";
import {
	applyRemoteCover,
	fetchBookDetail,
	fetchDashboard,
	fetchRemoteCoverOptions,
	fetchSetupStatus,
} from "#/server/functions";

export const Route = createFileRoute("/")({
	loader: async () => {
		const setupStatus = await fetchSetupStatus();

		if (!setupStatus?.configured) {
			throw redirect({ to: "/setup" });
		}

		return fetchDashboard();
	},
	component: Home,
});

function Home() {
	const initialDashboard = Route.useLoaderData();
	const [dashboard, setDashboard] =
		useState<FathomDashboardData>(initialDashboard);
	const firstBookId =
		initialDashboard.featured?.id ??
		initialDashboard.recentBooks[0]?.id ??
		initialDashboard.libraryBooks[0]?.id ??
		null;
	const [selectedItemId, setSelectedItemId] = useState<string | null>(
		firstBookId,
	);
	const [selectedDetail, setSelectedDetail] = useState<FathomBookDetail | null>(
		null,
	);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailError, setDetailError] = useState<string | null>(null);
	const [remoteImages, setRemoteImages] = useState<
		FathomRemoteImageCandidate[]
	>([]);
	const [remoteImagesLoading, setRemoteImagesLoading] = useState(false);
	const [remoteImagesError, setRemoteImagesError] = useState<string | null>(
		null,
	);
	const [coverApplying, setCoverApplying] = useState<string | null>(null);

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
						loadError instanceof Error
							? loadError.message
							: "Could not load the title details.",
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

	async function handleFindCoverOptions(itemId: string) {
		try {
			setRemoteImagesLoading(true);
			setRemoteImagesError(null);
			const images = await fetchRemoteCoverOptions({ data: { itemId } });
			setRemoteImages(images);
		} catch (loadError) {
			setRemoteImagesError(
				loadError instanceof Error
					? loadError.message
					: "Could not fetch remote cover options.",
			);
		} finally {
			setRemoteImagesLoading(false);
		}
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
				applyError instanceof Error
					? applyError.message
					: "Could not apply this cover in Jellyfin.",
			);
		} finally {
			setCoverApplying(null);
		}
	}

	const stats = [
		{
			label: "Books",
			value: dashboard.itemCounts.BookCount ?? dashboard.libraryBooks.length,
		},
		{ label: "Collections", value: dashboard.collections.length },
		{ label: "Libraries", value: dashboard.virtualFolders.length },
		{ label: "Server", value: dashboard.systemInfo.ServerName },
	];

	return (
		<main className="min-h-screen bg-abyss px-6 py-8 text-ink sm:px-8 xl:px-12 2xl:px-16">
			<div className="mx-auto max-w-[96rem]">
				<div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.35em] text-moss">
							Fathom
						</p>
						<h1 className="mt-3 max-w-4xl font-display text-5xl leading-none text-ink sm:text-6xl">
							Your reading room from Jellyfin
						</h1>
						<p className="mt-4 max-w-3xl text-lg leading-8 text-ink-muted">
							Browse books, manga, comics, and reading collections without the
							usual self-hosted rough edges. Fathom is the calm, cover-first
							layer for your NAS library.
						</p>
					</div>

					<div className="flex flex-wrap gap-3">
						<Link
							to="/setup"
							className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-ink"
						>
							Edit connection
						</Link>
					</div>
				</div>

				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{stats.map((stat) => (
						<section
							key={stat.label}
							className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6"
						>
							<p className="text-sm uppercase tracking-[0.25em] text-ink-faint">
								{stat.label}
							</p>
							<p className="mt-4 font-display text-4xl text-ink">
								{stat.value}
							</p>
						</section>
					))}
				</div>

				<div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.32fr)_minmax(22rem,0.68fr)]">
					<section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 xl:p-7">
						<div className="flex items-center justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">
									Featured
								</p>
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
										{dashboard.featured.year
											? ` · ${dashboard.featured.year}`
											: ""}
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
						<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">
							Reading detail
						</p>
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
								<h2 className="mt-6 font-display text-3xl text-ink">
									{selectedDetail.title}
								</h2>
								<p className="mt-2 text-sm uppercase tracking-[0.25em] text-ink-faint">
									{selectedDetail.type}
									{selectedDetail.year ? ` · ${selectedDetail.year}` : ""}
									{selectedDetail.publisher
										? ` · ${selectedDetail.publisher}`
										: ""}
								</p>
								<p className="mt-5 text-sm leading-8 text-ink-muted">
									{selectedDetail.overview ||
										"No overview available for this title yet."}
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
																handleApplyRemoteCover(
																	selectedDetail.id,
																	image.url,
																)
															}
															disabled={coverApplying !== null}
															className="mt-3 rounded-full bg-moss px-4 py-2 text-xs font-semibold text-abyss disabled:opacity-60"
														>
															{coverApplying === image.url
																? "Applying…"
																: "Use this cover"}
														</button>
													</div>
												</div>
											))}
										</div>
									) : null}
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
													<span>
														{person.role || person.type || "Contributor"}
													</span>
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
							<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">
								Libraries
							</p>
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
								<h3 className="text-xl font-semibold text-ink">
									{folder.Name}
								</h3>
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
					<p className="text-xs uppercase tracking-[0.3em] text-ink-faint">
						{props.title}
					</p>
					<h2 className="mt-2 font-display text-3xl">{props.subtitle}</h2>
				</div>
				<div className="rounded-full bg-white/[0.05] px-3 py-1 text-sm text-ink-muted">
					{props.items.length} titles
				</div>
			</div>

			<div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
				{props.items.length > 0 ? (
					props.items.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => props.onSelect(item.id)}
							className={`overflow-hidden rounded-[1.5rem] border bg-black/15 text-left transition ${
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
								<h3 className="line-clamp-2 text-lg font-semibold text-ink">
									{item.title}
								</h3>
								<p className="mt-2 text-xs uppercase tracking-[0.25em] text-ink-faint">
									{item.type}
									{item.year ? ` · ${item.year}` : ""}
								</p>
								<p className="mt-3 line-clamp-3 text-sm leading-6 text-ink-muted">
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
		</section>
	);
}
