# Fathom

> A [Coral](https://getcoral.dev) reading module for Jellyfin. Books, manga, comics, PDFs, and grouped collections in a calmer, cover-first interface.

## What It Is

Fathom is the Coral reading room. It connects to Jellyfin and turns reading libraries into a cleaner browsing experience with:

- a featured shelf
- recent additions
- library browsing
- collection browsing
- title detail with contributors and metadata
- local SQLite-backed Jellyfin connection settings, with `.env` support

## Development

```bash
pnpm install
pnpm dev
```

Fathom runs on `http://localhost:3000`.

## Configuration

Fathom supports the same connection model as other Coral modules:

```bash
JELLYFIN_URL=http://your-server:8096
JELLYFIN_API_KEY=your-api-key
JELLYFIN_USER_ID=your-user-id
JELLYFIN_USERNAME=optional-username
JELLYFIN_PASSWORD=optional-password
```

If those environment variables are present, Fathom can skip initial homepage onboarding. You can still edit and save local overrides through `/setup`.

By default, local settings are stored in:

```bash
./data/fathom.sqlite
```

Override the data directory with:

```bash
FATHOM_DATA_DIR=/path/to/data
```

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm typecheck
pnpm test
pnpm check
```

## Part Of Coral

Fathom is part of the [Coral](https://getcoral.dev) ecosystem. Shared Jellyfin API work belongs in [`/Users/elian/Documents/code/coral/Jellyfin`](/Users/elian/Documents/code/coral/Jellyfin), while Fathom-specific reading workflows stay in this repo.
