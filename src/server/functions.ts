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
