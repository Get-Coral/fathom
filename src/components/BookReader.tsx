import { CoralButton } from "@get-coral/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FathomReaderFormat } from "#/lib/jellyfin";

interface BookReaderProps {
	itemId: string;
	format: FathomReaderFormat;
	title: string;
	url: string;
	onClose: () => void;
}

type ReaderTheme = "paper" | "dark" | "sepia";

interface EpubLocation {
	start?: {
		cfi?: string;
	};
}

interface EpubThemes {
	default: (styles: Record<string, Record<string, string>>) => void;
	fontSize: (size: string) => void;
}

interface EpubContents {
	document?: Document;
}

interface EpubHooks {
	content: {
		register: (callback: (contents: EpubContents) => void) => void;
	};
}

interface EpubRendition {
	display: (target?: string) => Promise<void>;
	next: () => Promise<void>;
	prev: () => Promise<void>;
	getContents?: () => EpubContents[];
	on: (
		event: "relocated" | "keyup" | "keydown",
		callback: ((location: EpubLocation) => void) | ((event: KeyboardEvent) => void),
	) => void;
	off?: (
		event: "relocated" | "keyup" | "keydown",
		callback: ((location: EpubLocation) => void) | ((event: KeyboardEvent) => void),
	) => void;
	themes: EpubThemes;
	hooks?: EpubHooks;
	destroy: () => void;
}

interface EpubBook {
	renderTo: (
		element: HTMLElement,
		options: { width: string; height: string; spread: string },
	) => EpubRendition;
	destroy: () => void;
}

interface EpubCreateOptions {
	openAs?: "epub";
}

function isFormControlTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	const tag = target.tagName.toLowerCase();
	return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function getStorageSafe(key: string, fallback: string) {
	if (typeof window === "undefined") {
		return fallback;
	}

	return window.localStorage.getItem(key) ?? fallback;
}

function getThemeColors(theme: ReaderTheme) {
	if (theme === "dark") {
		return { background: "#0a0f1a", text: "#e8edf8" };
	}

	if (theme === "sepia") {
		return { background: "#f0e7d8", text: "#32281d" };
	}

	return { background: "#f7f4ed", text: "#1a1a1a" };
}

function applyEpubPresentation(
	rendition: EpubRendition,
	fontSize: number,
	lineHeight: number,
	theme: ReaderTheme,
) {
	const colors = getThemeColors(theme);
	rendition.themes.default({
		body: {
			background: colors.background,
			color: colors.text,
			"line-height": String(lineHeight),
		},
		p: {
			"line-height": String(lineHeight),
		},
	});
	rendition.themes.fontSize(`${fontSize}%`);

	// Apply directly to currently mounted iframes so changes are visible immediately.
	for (const contents of rendition.getContents?.() ?? []) {
		const body = contents.document?.body;
		if (!body) {
			continue;
		}

		body.style.background = colors.background;
		body.style.color = colors.text;
		body.style.lineHeight = String(lineHeight);
		body.style.fontSize = `${fontSize}%`;
	}
}

export function BookReader({ itemId, format, title, url, onClose }: BookReaderProps) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const renditionRef = useRef<EpubRendition | null>(null);
	const bookRef = useRef<EpubBook | null>(null);
	const touchStartXRef = useRef<number | null>(null);
	const [loading, setLoading] = useState(format === "epub");
	const [error, setError] = useState<string | null>(null);
	const storagePrefix = useMemo(() => `fathom.reader.${itemId}.${format}`, [format, itemId]);
	const [epubFontSize, setEpubFontSize] = useState(() =>
		Number.parseInt(getStorageSafe(`${storagePrefix}.fontSize`, "110"), 10),
	);
	const [epubLineHeight, setEpubLineHeight] = useState(() =>
		Number.parseFloat(getStorageSafe(`${storagePrefix}.lineHeight`, "1.6")),
	);
	const [epubTheme, setEpubTheme] = useState<ReaderTheme>(
		() => getStorageSafe(`${storagePrefix}.theme`, "paper") as ReaderTheme,
	);
	const [pdfPage, setPdfPage] = useState(() =>
		Math.max(1, Number.parseInt(getStorageSafe(`${storagePrefix}.page`, "1"), 10) || 1),
	);

	const readerSurface = useMemo(() => {
		if (format !== "epub") {
			return undefined;
		}

		const colors = getThemeColors(epubTheme);
		return { backgroundColor: colors.background, color: colors.text };
	}, [epubTheme, format]);

	const persist = useCallback((key: string, value: string) => {
		if (typeof window === "undefined") {
			return;
		}

		window.localStorage.setItem(key, value);
	}, []);

	const goPrev = useCallback(async () => {
		if (format === "epub") {
			await renditionRef.current?.prev();
			return;
		}

		setPdfPage((current) => {
			const next = Math.max(1, current - 1);
			persist(`${storagePrefix}.page`, String(next));
			return next;
		});
	}, [format, persist, storagePrefix]);

	const goNext = useCallback(async () => {
		if (format === "epub") {
			await renditionRef.current?.next();
			return;
		}

		setPdfPage((current) => {
			const next = current + 1;
			persist(`${storagePrefix}.page`, String(next));
			return next;
		});
	}, [format, persist, storagePrefix]);

	const handleNavigationKey = useCallback(
		(key: string) => {
			if (key === "ArrowLeft" || key === "PageUp") {
				void goPrev();
				return true;
			}

			if (key === "ArrowRight" || key === "PageDown" || key === " " || key === "Spacebar") {
				void goNext();
				return true;
			}

			return false;
		},
		[goNext, goPrev],
	);

	// Stable refs so event handlers always call the latest function without
	// requiring effect re-registration or EPUB rendition re-initialisation.
	const handleNavigationKeyRef = useRef(handleNavigationKey);
	handleNavigationKeyRef.current = handleNavigationKey;
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		if (format !== "epub") {
			return;
		}

		persist(`${storagePrefix}.fontSize`, String(epubFontSize));
		persist(`${storagePrefix}.lineHeight`, String(epubLineHeight));
		persist(`${storagePrefix}.theme`, epubTheme);
	}, [epubFontSize, epubLineHeight, epubTheme, format, persist, storagePrefix]);

	useEffect(() => {
		const previousOverflow = document.body.style.overflow;
		const previousOverscroll = document.body.style.overscrollBehavior;
		document.body.style.overflow = "hidden";
		document.body.style.overscrollBehavior = "none";

		return () => {
			document.body.style.overflow = previousOverflow;
			document.body.style.overscrollBehavior = previousOverscroll;
		};
	}, []);

	useEffect(() => {
		if (format !== "epub" || !mountRef.current) {
			return;
		}

		let cancelled = false;

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Reader setup keeps one-pass flow for side effects and cleanup.
		async function setupEpubReader() {
			try {
				setLoading(true);
				setError(null);
				const module = await import("epubjs");
				const createBook = (
					module as unknown as { default?: (href: string, options?: EpubCreateOptions) => EpubBook }
				).default;
				if (!createBook) {
					throw new Error("EPUB renderer could not be loaded.");
				}

				const book = createBook(url, { openAs: "epub" });
				const rendition = book.renderTo(mountRef.current as HTMLElement, {
					width: "100%",
					height: "100%",
					spread: "none",
				});
				const initialFontSize = Number.parseInt(
					getStorageSafe(`${storagePrefix}.fontSize`, "110"),
					10,
				);
				const initialLineHeight = Number.parseFloat(
					getStorageSafe(`${storagePrefix}.lineHeight`, "1.6"),
				);
				const initialTheme = getStorageSafe(`${storagePrefix}.theme`, "paper") as ReaderTheme;

				const relocateHandler = (location: EpubLocation) => {
					const cfi = location.start?.cfi;
					if (cfi) {
						persist(`${storagePrefix}.cfi`, cfi);
					}
				};
				const attachedDocuments = new Set<Document>();
				const keydownFromEpubContents = (event: KeyboardEvent) => {
					if (handleNavigationKeyRef.current(event.key)) {
						event.preventDefault();
						event.stopPropagation();
					}
				};
				const attachDocumentKeyHandler = (documentRef?: Document) => {
					if (!documentRef || attachedDocuments.has(documentRef)) {
						return;
					}

					documentRef.addEventListener("keydown", keydownFromEpubContents, true);
					attachedDocuments.add(documentRef);
				};
				rendition.on("relocated", relocateHandler);
				// Use EPUB.js native keydown proxying as the primary keyboard nav method.
				rendition.on("keydown", keydownFromEpubContents);
				rendition.hooks?.content.register((contents: EpubContents) => {
					// Some EPUB files embed scripts that are blocked in sandboxed chapter iframes.
					// Removing them avoids repeated browser warnings and keeps reader behavior stable.
					for (const script of contents.document?.querySelectorAll("script") ?? []) {
						script.remove();
					}
					attachDocumentKeyHandler(contents.document);
				});

				applyEpubPresentation(rendition, initialFontSize, initialLineHeight, initialTheme);

				const savedCfi = getStorageSafe(`${storagePrefix}.cfi`, "");
				await rendition.display(savedCfi || undefined);

				if (!cancelled) {
					bookRef.current = book;
					renditionRef.current = rendition;
					setLoading(false);
				}

				return () => {
					rendition.off?.("relocated", relocateHandler);
					rendition.off?.("keydown", keydownFromEpubContents);
					for (const documentRef of attachedDocuments) {
						documentRef.removeEventListener("keydown", keydownFromEpubContents, true);
					}
					attachedDocuments.clear();
				};
			} catch (setupError) {
				if (!cancelled) {
					setError(
						setupError instanceof Error ? setupError.message : "Could not open this EPUB file.",
					);
					setLoading(false);
				}
			}
		}

		let removeRelocatedListener: (() => void) | undefined;
		void setupEpubReader().then((cleanup) => {
			removeRelocatedListener = cleanup;
		});

		return () => {
			cancelled = true;
			removeRelocatedListener?.();
			renditionRef.current?.destroy();
			bookRef.current?.destroy();
			renditionRef.current = null;
			bookRef.current = null;
		};
		// handleNavigationKey is accessed via a stable ref; deps omitted to prevent the EPUB rendition from tearing down on every render.
	}, [format, persist, storagePrefix, url]);

	useEffect(() => {
		if (format !== "epub" || !renditionRef.current) {
			return;
		}

		applyEpubPresentation(renditionRef.current, epubFontSize, epubLineHeight, epubTheme);
	}, [epubFontSize, epubLineHeight, epubTheme, format]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (isFormControlTarget(event.target)) {
				return;
			}

			if (event.key === "Escape") {
				event.preventDefault();
				onCloseRef.current();
				return;
			}

			if (handleNavigationKeyRef.current(event.key)) {
				event.preventDefault();
			}
		}

		document.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("keydown", onKeyDown, true);
		};
		// Both handlers are accessed via stable refs; listener is registered once on mount and removed on unmount.
	}, []);

	function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
		touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
	}

	function onTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
		const startX = touchStartXRef.current;
		const endX = event.changedTouches[0]?.clientX;
		touchStartXRef.current = null;

		if (startX == null || endX == null) {
			return;
		}

		const delta = endX - startX;
		if (Math.abs(delta) < 40) {
			return;
		}

		if (delta < 0) {
			void goNext();
			return;
		}

		void goPrev();
	}

	function onWheel(event: React.WheelEvent<HTMLDivElement>) {
		event.preventDefault();
	}

	const pdfUrl = useMemo(() => {
		if (format !== "pdf") {
			return url;
		}

		return `${url}#page=${pdfPage}`;
	}, [format, pdfPage, url]);

	return (
		<div className="fixed inset-0 z-[120] bg-abyss/95 backdrop-blur-sm">
			<div className="flex h-full flex-col">
				<header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
					<div>
						<p className="text-xs uppercase tracking-[0.25em] text-ink-faint">Reading</p>
						<h2 className="line-clamp-1 font-display text-2xl text-ink">{title}</h2>
					</div>
					<div className="flex items-center gap-2">
						<CoralButton
							variant="neutral"
							size="sm"
							onClick={() => void goPrev()}
							className="rounded-full"
						>
							Prev
						</CoralButton>
						<CoralButton
							variant="neutral"
							size="sm"
							onClick={() => void goNext()}
							className="rounded-full"
						>
							Next
						</CoralButton>
						<CoralButton size="sm" onClick={onClose} className="rounded-full">
							Close
						</CoralButton>
					</div>
				</header>

				{format === "epub" ? (
					<div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-black/15 px-4 py-3">
						<label className="text-xs text-ink-muted">
							Font {epubFontSize}%
							<input
								type="range"
								min={90}
								max={170}
								step={5}
								value={epubFontSize}
								onChange={(event) => setEpubFontSize(Number.parseInt(event.target.value, 10))}
								className="ml-2 align-middle"
							/>
						</label>
						<label className="text-xs text-ink-muted">
							Line {epubLineHeight.toFixed(1)}
							<input
								type="range"
								min={1.2}
								max={2}
								step={0.1}
								value={epubLineHeight}
								onChange={(event) => setEpubLineHeight(Number.parseFloat(event.target.value))}
								className="ml-2 align-middle"
							/>
						</label>
						<div className="flex items-center gap-2">
							<CoralButton
								variant={epubTheme === "paper" ? "primary" : "neutral"}
								size="sm"
								onClick={() => setEpubTheme("paper")}
								className="rounded-full"
							>
								Paper
							</CoralButton>
							<CoralButton
								variant={epubTheme === "sepia" ? "primary" : "neutral"}
								size="sm"
								onClick={() => setEpubTheme("sepia")}
								className="rounded-full"
							>
								Sepia
							</CoralButton>
							<CoralButton
								variant={epubTheme === "dark" ? "primary" : "neutral"}
								size="sm"
								onClick={() => setEpubTheme("dark")}
								className="rounded-full"
							>
								Dark
							</CoralButton>
						</div>
					</div>
				) : null}

				<div
					onTouchStart={onTouchStart}
					onTouchEnd={onTouchEnd}
					onWheel={onWheel}
					style={readerSurface}
					className="relative flex-1 overflow-hidden"
				>
					{format === "pdf" ? (
						<iframe title={title} src={pdfUrl} className="h-full w-full" />
					) : (
						<div ref={mountRef} className="h-full w-full" />
					)}

					{loading ? (
						<div className="absolute inset-0 flex items-center justify-center bg-abyss/70 text-sm text-ink-muted">
							Opening book…
						</div>
					) : null}

					{error ? (
						<div className="absolute inset-x-6 top-6 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
							{error}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
