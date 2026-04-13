import {
	createClient,
	downloadRemoteImage,
	getItem,
	getItemCounts,
	getLibraryItems,
	getRemoteImages,
	getSystemInfo,
	getUserById,
	getVirtualFolders,
	imageUrl,
	type JellyfinItemCounts,
	type JellyfinRemoteImageInfo,
	type JellyfinSystemInfo,
	type JellyfinVirtualFolder,
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
	people: Array<{
		id: string;
		name: string;
		role?: string;
		type?: string;
	}>;
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

export interface FathomRemoteImageCandidate {
	url: string;
	thumbnailUrl: string;
	providerName: string;
	width?: number;
	height?: number;
	communityRating?: number;
	voteCount?: number;
}

export interface FathomAutoCoverResult {
	processed: number;
	updated: number;
	failures: number;
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
		people:
			item.People?.map((person) => ({
				id: person.Id,
				name: person.Name,
				role: person.Role,
				type: person.Type,
			})) ?? [],
	};
}

function toRemoteImageCandidate(image: JellyfinRemoteImageInfo): FathomRemoteImageCandidate | null {
	const url = image.Url?.trim();
	if (!url) return null;

	return {
		url,
		thumbnailUrl: image.ThumbnailUrl?.trim() || url,
		providerName: image.ProviderName?.trim() || "Unknown provider",
		width: image.Width ?? undefined,
		height: image.Height ?? undefined,
		communityRating: image.CommunityRating ?? undefined,
		voteCount: image.VoteCount ?? undefined,
	};
}

export async function fetchRemoteCoverOptions(
	itemId: string,
): Promise<FathomRemoteImageCandidate[]> {
	const client = createFathomClient();
	const images = await getRemoteImages(client, itemId, "Primary");

	return images
		.map((image) => toRemoteImageCandidate(image))
		.filter((image): image is FathomRemoteImageCandidate => image !== null);
}

export async function applyRemoteCover(itemId: string, imageUrl: string) {
	const client = createFathomClient();
	await downloadRemoteImage(client, itemId, imageUrl, "Primary");
}

function firstRemoteImageUrl(images: JellyfinRemoteImageInfo[]) {
	for (const image of images) {
		const url = image.Url?.trim();
		if (url) {
			return url;
		}
	}

	return null;
}

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

	for (const item of targets) {
		try {
			const images = await getRemoteImages(client, item.Id, "Primary");
			const selectedUrl = firstRemoteImageUrl(images);
			if (!selectedUrl) {
				continue;
			}

			await downloadRemoteImage(client, item.Id, selectedUrl, "Primary");
			updated += 1;
		} catch {
			failures += 1;
		}
	}

	return {
		processed: targets.length,
		updated,
		failures,
	};
}
