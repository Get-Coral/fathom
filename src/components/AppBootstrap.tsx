import { useEffect } from "react";

const IS_DEV = import.meta.env.DEV;

export function AppBootstrap() {
	useEffect(() => {
		if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
			return;
		}

		if (IS_DEV) {
			void navigator.serviceWorker.getRegistrations().then((registrations) => {
				registrations.forEach((registration) => {
					void registration.unregister();
				});
			});

			if ("caches" in window) {
				void caches.keys().then((cacheNames) => {
					cacheNames.forEach((cacheName) => {
						void caches.delete(cacheName);
					});
				});
			}

			return;
		}

		void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);

		return;
	}, []);

	return null;
}
