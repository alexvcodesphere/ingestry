# Gemini Project: Ingestry

This document provides a comprehensive overview of the "Ingestry" project, an intelligent product data ingestion platform. It's designed to be a quick reference for developers and contributors, outlining the project's architecture, key features, and development practices.

## Project Overview

Ingestry is a Next.js application built to streamline fashion retail workflows. It extracts, normalizes, and manages product data from order confirmation PDFs. The platform leverages AI for data extraction, offers configurable processing profiles, and supports exporting to multiple e-commerce systems.

### Core Features

*   **AI-Powered PDF Extraction**: Utilizes GPT-4o Vision to extract product data from order confirmations.
*   **Dynamic Processing Profiles**: Allows for configurable field extraction, normalization, and SKU generation.
*   **Lookup-Based Normalization**: Employs fuzzy matching with aliases for various product attributes.
*   **Template-Based SKU Generation**: Provides configurable SKU templates with variable substitution.
*   **Multi-Shop Export**: Includes adapters for Shopware 6, Xentral ERP, and Shopify.
*   **Multi-Tenant Architecture**: Ensures complete tenant isolation using Supabase Row-Level Security.

### Tech Stack

*   **Framework**: Next.js 16 (App Router)
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS 4
*   **Components**: shadcn/ui
*   **Database**: Supabase (PostgreSQL)
*   **AI**: OpenAI GPT-4o Vision
*   **Document Analysis**: Azure Document Intelligence

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
