import { createServerFn } from "@tanstack/react-start";

export const fetchSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
	const { getConfigurationSummary } = await import("../lib/config-store");
	return getConfigurationSummary();
});

export const saveSetupConfiguration = createServerFn({ method: "POST" })
	.inputValidator(
		(input: {
			url: string;
			apiKey: string;
			userId: string;
			username?: string;
			password?: string;
		}) => input,
	)
	.handler(async ({ data }) => {
		const { saveJellyfinSettings, validateJellyfinSettings } = await import("../lib/config-store");
		const validated = await validateJellyfinSettings({
			url: data.url,
			apiKey: data.apiKey,
			userId: data.userId,
			username: data.username,
			password: data.password,
		});

		saveJellyfinSettings(validated);

		return { configured: true };
	});

export const fetchDashboard = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchDashboardData } = await import("../lib/jellyfin");
	return fetchDashboardData();
});

export const fetchBookDetail = createServerFn({ method: "GET" })
	.inputValidator((input: { itemId: string }) => input)
	.handler(async ({ data }) => {
		const { fetchBookDetail: fetchDetail } = await import("../lib/jellyfin");
		return fetchDetail(data.itemId);
	});

export const fetchRemoteCoverOptions = createServerFn({ method: "GET" })
	.inputValidator((input: { itemId: string }) => input)
	.handler(async ({ data }) => {
		const { fetchRemoteCoverOptions: fetchOptions } = await import("../lib/jellyfin");
		return fetchOptions(data.itemId);
	});

export const applyRemoteCover = createServerFn({ method: "POST" })
	.inputValidator((input: { itemId: string; imageUrl: string }) => input)
	.handler(async ({ data }) => {
		const { applyRemoteCover: applyCover } = await import("../lib/jellyfin");
		await applyCover(data.itemId, data.imageUrl);
		return { ok: true };
	});

export const autofillMissingCovers = createServerFn({ method: "POST" })
	.inputValidator((input: { limit?: number } | undefined) => input)
	.handler(async ({ data }) => {
		const { autofillMissingCovers: runAutofill } = await import("../lib/jellyfin");
		return runAutofill(data?.limit ?? 10);
	});

export const fetchCollectionOptions = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchCollectionOptions: fetchCollections } = await import("../lib/jellyfin");
	return fetchCollections();
});

export const toggleFavorite = createServerFn({ method: "POST" })
	.inputValidator((input: { itemId: string; nextFavorite: boolean }) => input)
	.handler(async ({ data }) => {
		const { toggleItemFavorite } = await import("../lib/jellyfin");
		return toggleItemFavorite(data.itemId, data.nextFavorite);
	});

export const saveBookMetadata = createServerFn({ method: "POST" })
	.inputValidator(
		(input: { itemId: string; title: string; overview: string; year?: number; genres: string[] }) =>
			input,
	)
	.handler(async ({ data }) => {
		const { updateBookMetadata } = await import("../lib/jellyfin");
		return updateBookMetadata(data.itemId, {
			title: data.title,
			overview: data.overview,
			year: data.year,
			genres: data.genres,
		});
	});

export const removeLibraryItem = createServerFn({ method: "POST" })
	.inputValidator((input: { itemId: string }) => input)
	.handler(async ({ data }) => {
		const { deleteLibraryItem } = await import("../lib/jellyfin");
		return deleteLibraryItem(data.itemId);
	});

export const addItemToCollection = createServerFn({ method: "POST" })
	.inputValidator((input: { itemId: string; collectionId: string }) => input)
	.handler(async ({ data }) => {
		const { addItemToCollection: addToCollection } = await import("../lib/jellyfin");
		return addToCollection(data.itemId, data.collectionId);
	});

export const removeItemFromCollection = createServerFn({ method: "POST" })
	.inputValidator((input: { itemId: string; collectionId: string }) => input)
	.handler(async ({ data }) => {
		const { removeItemFromCollection: removeFromCollection } = await import("../lib/jellyfin");
		return removeFromCollection(data.itemId, data.collectionId);
	});

export const createCollectionForItem = createServerFn({ method: "POST" })
	.inputValidator((input: { itemId: string; name: string }) => input)
	.handler(async ({ data }) => {
		const { createCollectionWithItem } = await import("../lib/jellyfin");
		return createCollectionWithItem(data.itemId, data.name);
	});

export const searchLibrary = createServerFn({ method: "GET" })
	.inputValidator((input: { query: string }) => input)
	.handler(async ({ data }) => {
		const { searchLibraryBooks } = await import("../lib/jellyfin");
		return searchLibraryBooks(data.query);
	});

export const fetchReaderSession = createServerFn({ method: "GET" })
	.inputValidator((input: { itemId: string }) => input)
	.handler(async ({ data }) => {
		const { fetchReaderSession: fetchSession } = await import("../lib/jellyfin");
		return fetchSession(data.itemId);
	});
