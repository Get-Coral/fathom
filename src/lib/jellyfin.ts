import {
	addItemsToCollection,
	applyRemoteImageWithFallback,
	createClient,
	createCollection,
	deleteItem,
	getCollections,
	getCoverCandidates,
	getCoverCandidatesForItem,
	getItem,
	getItemCounts,
	getLibraryItems,
	getRemoteImages,
	getSystemInfo,
	getUserById,
	getVirtualFolders,
	imageUrl,
	type JellyfinCoverCandidate,
	type JellyfinItem,
	type JellyfinItemCounts,
	type JellyfinSystemInfo,
	type JellyfinVirtualFolder,
	removeItemsFromCollection,
	searchItems,
	setFavorite,
	updateItem,
} from "@get-coral/jellyfin";
import { getEffectiveJellyfinSettings } from "./config-store";

export interface FathomUserSummary {
	id: string;
	name: string;
}

export interface FathomBookCard {
	id: string;
	title: string;
	type: string;
	year?: number;
	overview: string;
	genres: string[];
	coverUrl?: string;
}

export interface FathomBookDetail extends FathomBookCard {
	publisher?: string;
	isFavorite: boolean;
	jellyfinWebUrl: string;
	people: Array<{
		id: string;
		name: string;
		role?: string;
		type?: string;
	}>;
}

export interface FathomCollectionOption {
	id: string;
	name: string;
}

export type FathomReaderFormat = "epub" | "pdf";

export interface FathomReaderSession {
	itemId: string;
	title: string;
	format: FathomReaderFormat;
	url: string;
}

export interface FathomDashboardData {
	systemInfo: JellyfinSystemInfo;
	itemCounts: JellyfinItemCounts;
	virtualFolders: JellyfinVirtualFolder[];
	currentUser: FathomUserSummary;
	featured: FathomBookCard | null;
	recentBooks: FathomBookCard[];
	libraryBooks: FathomBookCard[];
	collections: FathomBookCard[];
}

export type FathomRemoteImageCandidate = JellyfinCoverCandidate;

export interface FathomAutoCoverResult {
	processed: number;
	updated: number;
	failures: number;
	externalCandidatesUsed: number;
	uploadFallbackUsed: number;
}

function getRequiredSettings() {
	const settings = getEffectiveJellyfinSettings();

	if (!settings) {
		throw new Error("Fathom is not configured yet. Visit /setup to connect Jellyfin.");
	}

	return settings;
}

function createFathomClient() {
	const settings = getRequiredSettings();

	return createClient({
		url: settings.url,
		apiKey: settings.apiKey,
		userId: settings.userId,
		username: settings.username,
		password: settings.password,
		clientName: "Fathom",
		deviceName: "Fathom Web",
		deviceId: "fathom-web",
	});
}

function jellyfinWebDetailsUrl(itemId: string) {
	const settings = getRequiredSettings();
	return `${settings.url.replace(/\/+$/, "")}/web/#/details?id=${itemId}`;
}

function jellyfinItemDownloadUrl(itemId: string) {
	const settings = getRequiredSettings();
	const url = new URL(`${settings.url.replace(/\/+$/, "")}/Items/${itemId}/Download`);
	url.searchParams.set("api_key", settings.apiKey);
	return url.toString();
}

function detectReaderFormat(item: JellyfinItem) {
	const container = (item as JellyfinItem & { Container?: string }).Container?.toLowerCase();
	if (container === "epub") return "epub" as const;
	if (container === "pdf") return "pdf" as const;

	const path = (item as JellyfinItem & { Path?: string }).Path?.toLowerCase() ?? "";
	if (path.endsWith(".epub")) return "epub" as const;
	if (path.endsWith(".pdf")) return "pdf" as const;

	const title = item.Name.toLowerCase();
	if (title.endsWith(".epub")) return "epub" as const;
	if (title.endsWith(".pdf")) return "pdf" as const;

	return null;
}

function toBookCard(
	client: ReturnType<typeof createClient>,
	item: Awaited<ReturnType<typeof getItem>>,
): FathomBookCard {
	const coverType = item.ImageTags?.Primary
		? "Primary"
		: item.ImageTags?.Thumb
			? "Thumb"
			: item.ImageTags?.Backdrop
				? "Backdrop"
				: null;

	return {
		id: item.Id,
		title: item.Name,
		type: item.Type,
		year: item.ProductionYear,
		overview: item.Overview?.trim() ?? "",
		genres: item.GenreItems?.map((genre) => genre.Name) ?? [],
		coverUrl: coverType ? imageUrl(client, item.Id, coverType, 520) : undefined,
	};
}

export async function fetchDashboardData(): Promise<FathomDashboardData> {
	const client = createFathomClient();
	const [
		systemInfo,
		itemCounts,
		virtualFolders,
		currentUser,
		recentBooks,
		libraryBooks,
		collections,
	] = await Promise.all([
		getSystemInfo(client),
		getItemCounts(client),
		getVirtualFolders(client),
		getUserById(client, client.config.userId),
		getLibraryItems(client, "Book", {
			limit: 18,
			sortBy: "DateCreated",
			sortOrder: "Descending",
		}),
		getLibraryItems(client, "Book", {
			limit: 18,
			sortBy: "SortName",
			sortOrder: "Ascending",
		}),
		getLibraryItems(client, "BoxSet", {
			limit: 12,
			sortBy: "SortName",
			sortOrder: "Ascending",
		}),
	]);

	return {
		systemInfo,
		itemCounts,
		virtualFolders,
		currentUser: {
			id: currentUser.Id,
			name: currentUser.Name,
		},
		featured: recentBooks.Items[0] ? toBookCard(client, recentBooks.Items[0]) : null,
		recentBooks: recentBooks.Items.map((item) => toBookCard(client, item)),
		libraryBooks: libraryBooks.Items.map((item) => toBookCard(client, item)),
		collections: collections.Items.map((item) => toBookCard(client, item)),
	};
}

export async function fetchBookDetail(itemId: string): Promise<FathomBookDetail> {
	const client = createFathomClient();
	const item = await getItem(client, itemId);

	return {
		...toBookCard(client, item),
		publisher: item.Studios?.[0]?.Name,
		isFavorite: Boolean(item.UserData?.IsFavorite),
		jellyfinWebUrl: jellyfinWebDetailsUrl(itemId),
		people:
			item.People?.map((person) => ({
				id: person.Id,
				name: person.Name,
				role: person.Role,
				type: person.Type,
			})) ?? [],
	};
}

export async function fetchCollectionOptions(): Promise<FathomCollectionOption[]> {
	const client = createFathomClient();
	const collections = await getCollections(client);
	return collections.map((collection) => ({
		id: collection.Id,
		name: collection.Name,
	}));
}

export async function toggleItemFavorite(itemId: string, nextFavorite: boolean) {
	const client = createFathomClient();
	await setFavorite(client, itemId, !nextFavorite);
	return { isFavorite: nextFavorite };
}

export async function updateBookMetadata(
	itemId: string,
	input: { title: string; overview: string; year?: number; genres: string[] },
) {
	const client = createFathomClient();
	await updateItem(client, itemId, {
		name: input.title,
		overview: input.overview,
		productionYear: input.year,
		genres: input.genres,
	});
	return fetchBookDetail(itemId);
}

export async function deleteLibraryItem(itemId: string) {
	const client = createFathomClient();
	await deleteItem(client, itemId);
	return { ok: true };
}

export async function addItemToCollection(itemId: string, collectionId: string) {
	const client = createFathomClient();
	await addItemsToCollection(client, collectionId, [itemId]);
	return { ok: true };
}

export async function removeItemFromCollection(itemId: string, collectionId: string) {
	const client = createFathomClient();
	await removeItemsFromCollection(client, collectionId, [itemId]);
	return { ok: true };
}

export async function createCollectionWithItem(itemId: string, name: string) {
	const client = createFathomClient();
	const created = await createCollection(client, name, [itemId]);
	return { id: created.Id };
}

export async function searchLibraryBooks(query: string): Promise<FathomBookCard[]> {
	const client = createFathomClient();
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		return [];
	}

	const items = await searchItems(client, trimmedQuery, ["Book", "BoxSet"]);
	return items.slice(0, 30).map((item) => toBookCard(client, item));
}

export async function fetchReaderSession(itemId: string): Promise<FathomReaderSession> {
	const client = createFathomClient();
	const item = await getItem(client, itemId);
	const format = detectReaderFormat(item);

	if (!format) {
		throw new Error("This item is not an EPUB or PDF. Use 'Read in Jellyfin' for this format.");
	}

	return {
		itemId,
		title: item.Name,
		format,
		url: jellyfinItemDownloadUrl(itemId),
	};
}

async function fetchCoverCandidatesForItem(
	client: ReturnType<typeof createClient>,
	item: JellyfinItem,
): Promise<FathomRemoteImageCandidate[]> {
	return await getCoverCandidates(client, item, "Primary");
}

export async function fetchRemoteCoverOptions(
	itemId: string,
): Promise<FathomRemoteImageCandidate[]> {
	const client = createFathomClient();
	return await getCoverCandidatesForItem(client, itemId, "Primary");
}

export async function applyRemoteCover(itemId: string, imageUrl: string) {
	const client = createFathomClient();
	await applyRemoteImageWithFallback(client, itemId, imageUrl, "Primary");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Autofill intentionally coordinates multiple fallback paths and counters.
export async function autofillMissingCovers(limit = 10): Promise<FathomAutoCoverResult> {
	const client = createFathomClient();
	const [recentBooks, libraryBooks] = await Promise.all([
		getLibraryItems(client, "Book", {
			limit: 48,
			sortBy: "DateCreated",
			sortOrder: "Descending",
		}),
		getLibraryItems(client, "Book", {
			limit: 48,
			sortBy: "SortName",
			sortOrder: "Ascending",
		}),
	]);

	const itemsById = new Map<string, (typeof recentBooks.Items)[number]>();
	for (const item of [...recentBooks.Items, ...libraryBooks.Items]) {
		if (item.ImageTags?.Primary || item.ImageTags?.Thumb || item.ImageTags?.Backdrop) {
			continue;
		}

		if (!itemsById.has(item.Id)) {
			itemsById.set(item.Id, item);
		}
	}

	const targets = [...itemsById.values()].slice(0, Math.max(1, limit));
	let updated = 0;
	let failures = 0;
	let externalCandidatesUsed = 0;
	let uploadFallbackUsed = 0;

	for (const item of targets) {
		try {
			const detailedItem = await getItem(client, item.Id);
			const remoteImages = await getRemoteImages(client, item.Id, "Primary");
			const candidates = await fetchCoverCandidatesForItem(client, detailedItem);

			if (candidates.length === 0) {
				continue;
			}

			const remoteUrlSet = new Set(
				remoteImages.map((image) => image.Url?.trim()).filter((url): url is string => Boolean(url)),
			);
			let applied = false;
			for (const candidate of candidates) {
				const selectedFromExternal = !remoteUrlSet.has(candidate.url);
				if (selectedFromExternal) {
					externalCandidatesUsed += 1;
				}

				try {
					const method = await applyRemoteImageWithFallback(
						client,
						item.Id,
						candidate.url,
						"Primary",
					);
					if (method === "binary-upload") {
						uploadFallbackUsed += 1;
					}
					applied = true;
					break;
				} catch {}
			}

			if (!applied) {
				failures += 1;
				continue;
			}

			updated += 1;
		} catch {
			failures += 1;
		}
	}

	return {
		processed: targets.length,
		updated,
		failures,
		externalCandidatesUsed,
		uploadFallbackUsed,
	};
}
