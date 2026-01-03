# Gemini Project: Ingestry

This document provides a comprehensive overview of the "Ingestry" project, an intelligent product data ingestion platform. It's designed to be a quick reference for developers and contributors, outlining the project's architecture, key features, and development practices.

## Project Overview

Ingestry is a Next.js application built to streamline fashion retail workflows. It extracts, normalizes, and manages product data from order confirmation PDFs. The platform leverages AI for data extraction, offers configurable processing profiles, and supports exporting to multiple e-commerce systems.

### Core Features

- **AI-Powered PDF Extraction**: Utilizes GPT-4o Vision to extract product data from order confirmations.
- **Dynamic Processing Profiles**: Allows for configurable field extraction, normalization, and SKU generation.
- **Lookup-Based Normalization**: Employs fuzzy matching with aliases for various product attributes.
- **Template-Based SKU Generation**: Provides configurable SKU templates with variable substitution.
- **Multi-Shop Export**: Includes adapters for Shopware 6, Xentral ERP, and Shopify.
- **Multi-Tenant Architecture**: Ensures complete tenant isolation using Supabase Row-Level Security.

### Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Components**: shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4o Vision
- **Document Analysis**: Azure Document Intelligence

## Building and Running

The following commands are essential for developing and running the Ingestry application.

### Installation

To install the project dependencies, run the following command:

```bash
npm install
```

### Development

To run the application in a development environment, use the following command:

```bash
npm run dev
```

### Build

To build the application for production, run:

```bash
npm run build
```

### Start

To start the production server, use:

```bash
npm run start
```

## Development Conventions

The project follows standard TypeScript and Next.js development conventions.

### Linting

The project uses ESLint for code quality and consistency. To run the linter, use the following command:

```bash
npm run lint
```

### Code Style

The project uses Tailwind CSS for styling, with components from shadcn/ui. Please adhere to the existing coding style and conventions when contributing to the project.

### Styling & Design System

Custom DLS extending shadcn/ui with "Modern App" aesthetics and Layered Design System.

#### Spatial Philosophy (3 Levels)

| Level | Name    | Styling                                                                    |
| ----- | ------- | -------------------------------------------------------------------------- |
| 0     | Canvas  | `bg-gradient-to-br from-background to-muted/40`                            |
| 1     | Surface | `bg-card/60 backdrop-blur-md ring-1 ring-inset ring-border/50 rounded-2xl` |
| 2     | Overlay | `bg-card/95 backdrop-blur-sm shadow-xl ring-1 ring-border/50 rounded-xl`   |

> **Never stack Level 1 surfaces.** Nested cards use `bg-muted/30` or `bg-muted/50`.

#### Mandatory Rules

- **Soft Ring Rule**: `border` must always be paired with `ring-1 ring-inset ring-border/50`
- **No Hex Codes**: Use only Tailwind theme variables (`text-primary`, `bg-violet/10`)
- **Tactile Feedback**: All clickable elements: `active:scale-[0.98]`
- **Consistent Blur**: Always use `backdrop-blur-md` for glass surfaces

#### Form Elements (Glassmorphic)

```
bg-muted/40 border-border/40 focus:bg-background
focus-visible:ring-2 focus-visible:ring-primary/40
```

#### Lineage Color System

| Type        | Backgrounds (light/dark)               | Badges (light/dark)                  |
| ----------- | -------------------------------------- | ------------------------------------ |
| Source (S)  | `bg-blue-50/30` / `bg-blue-950/20`     | `bg-blue-100` / `bg-blue-900/80`     |
| Virtual (V) | `bg-purple-50/30` / `bg-purple-950/20` | `bg-purple-100` / `bg-purple-900/80` |

#### oklch Color Values

```css
/* Primary (violet) */
--primary: oklch(0.55 0.22 295); /* light */
--primary: oklch(0.68 0.22 295); /* dark */

/* Virtual fields */
--violet: oklch(0.55 0.18 295); /* light */
--violet: oklch(0.65 0.18 295); /* dark */
```
