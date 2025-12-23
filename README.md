# Ingestry

**Intelligent Product Data Ingestion Platform**

A Next.js application for extracting, normalizing, and managing product data from order confirmation PDFs. Built for fashion retail workflows with AI-powered extraction, configurable processing profiles, and multi-shop-system export.

## Features

- **AI-Powered PDF Extraction**: Uses GPT-4o Vision to extract product data from order confirmations
- **Dynamic Processing Profiles**: Fully configurable field extraction, normalization, and SKU generation
- **Lookup-Based Normalization**: Fuzzy matching with aliases for colors, categories, brands, and custom fields
- **Template-Based SKU Generation**: Configurable SKU templates with variable substitution
- **Multi-Shop Export**: Adapters for Shopware 6, Xentral ERP, and Shopify
- **Multi-Tenant Architecture**: Full tenant isolation with Supabase RLS

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── documents/      # PDF upload & analysis
│   │   ├── draft-orders/   # Order processing endpoints
│   │   ├── jobs/           # Background job status
│   │   └── lookups/        # Normalization testing
│   ├── dashboard/          # Main application UI
│   │   ├── orders/         # Order management
│   │   ├── products/       # Product catalog
│   │   └── settings/       # Configuration pages
│   └── login/              # Authentication
│
├── components/             # React components
│   ├── orders/flow/        # Draft order grid & editing
│   ├── ui/                 # shadcn/ui components
│   └── validation/         # Validation display
│
├── lib/                    # Core business logic
│   ├── adapters/           # Shop system integrations
│   ├── azure/              # Azure Document Intelligence
│   ├── gpt/                # OpenAI GPT extraction
│   ├── modules/processing/ # Processing pipeline
│   ├── services/           # Business services
│   └── supabase/           # Database client
│
└── types/                  # TypeScript definitions
```

## Processing Pipeline

The core data flow for processing uploaded documents:

```
┌─────────────┐     ┌───────────────┐     ┌─────────────┐     ┌────────────┐
│ PDF Upload  │ ──▶ │ GPT Extraction│ ──▶ │ Normalizer  │ ──▶ │  Enricher  │
└─────────────┘     └───────────────┘     └─────────────┘     └────────────┘
                           │                     │                    │
                           │                     │                    │
                    Uses Processing        Uses code_lookups    Category rules
                       Profile              for field values     (if template)
                           │                     │                    │
                           ▼                     ▼                    ▼
                    ┌─────────────────────────────────────────────────────┐
                    │                  Draft Order                         │
                    │   (line_items with raw_data + normalized_data)      │
                    └─────────────────────────────────────────────────────┘
                                              │
                                              ▼
                    ┌─────────────────────────────────────────────────────┐
                    │              Human Validation UI                     │
                    │     (edit, approve, regenerate SKUs)                │
                    └─────────────────────────────────────────────────────┘
                                              │
                                              ▼
                    ┌─────────────────────────────────────────────────────┐
                    │              Shop System Export                      │
                    │     (Shopware / Xentral / Shopify adapters)         │
                    └─────────────────────────────────────────────────────┘
```

## Key Modules

### Processing Module (`lib/modules/processing/`)

| File | Purpose |
|------|---------|
| `pipeline.ts` | Orchestrates the full processing flow |
| `normalizer.ts` | Transforms raw GPT output using profile fields and lookups |
| `enricher.ts` | Adds category/gender based on template rules (fallback detection) |

### Services (`lib/services/`)

| File | Purpose |
|------|---------|
| `template-engine.ts` | Parses and evaluates SKU templates with `{variable}` syntax |
| `lookup-normalizer.ts` | Fuzzy matching engine for value normalization |
| `draft-order.service.ts` | CRUD operations for draft orders |
| `sku-generator.ts` | High-level SKU generation using templates |
| `tenant.service.ts` | Multi-tenant context management |

### Adapters (`lib/adapters/`)

| File | Purpose |
|------|---------|
| `shopware.adapter.ts` | Shopware 6 Admin API integration |
| `xentral.adapter.ts` | Xentral ERP API integration |
| `shopify.adapter.ts` | Shopify Admin API integration (mock mode) |

## Configuration

### Processing Profiles

Processing profiles define:
- **Fields to extract**: Which data points to get from PDFs
- **Normalization rules**: Which lookup type to use for each field
- **Template fields**: Computed values using `{variable}` syntax
- **SKU generation**: Template and whether to auto-generate

Profiles are managed via **Settings → Processing Profiles**.

### Code Lookups

Lookups provide canonical values with code mappings:
- **Name**: The canonical value (e.g., "Navy")
- **Code**: Short code for SKU generation (e.g., "07")
- **Aliases**: Alternative spellings that normalize to this entry

Lookups support:
- Exact matching
- Alias matching
- Fuzzy matching (for typos)
- Compound value splitting (e.g., "WHITE/PEARL" → "White")

Managed via **Settings → Code Lookups**.

### SKU Templates

Template syntax: `{variable}` or `{variable:length}`

| Variable | Description |
|----------|-------------|
| `{brand}` | Brand name |
| `{brand:2}` | Brand code (2 chars) |
| `{category}` | Category name |
| `{category:2}` | Category code |
| `{color}` | Color name |
| `{color:2}` | Color code |
| `{gender}` | Gender (M/W/U) |
| `{season}` | Season type code |
| `{size}` | Size value |
| `{sequence}` | Sequential number |
| `{sequence:3}` | Padded to 3 digits |
| `{year}` | 2-digit year |
| `{ean}` | EAN barcode |

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Organization accounts |
| `tenant_members` | User-tenant membership |
| `draft_orders` | Processing orders with metadata |
| `draft_line_items` | Individual products in orders |
| `processing_profiles` | Extraction & normalization config |
| `code_lookups` | Normalization values with codes |
| `sku_templates` | SKU generation templates |
| `jobs` | Background job tracking |

### Row-Level Security

All tables use Supabase RLS with tenant isolation:
```sql
CREATE POLICY "Tenant isolation" ON table_name
    FOR ALL USING (tenant_id = get_user_tenant_id());
```

## API Routes

### Draft Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/draft-orders` | List orders with pagination |
| POST | `/api/draft-orders` | Create order (upload + process) |
| GET | `/api/draft-orders/[id]` | Get order details |
| PATCH | `/api/draft-orders/[id]` | Update order status |
| POST | `/api/draft-orders/[id]/line-items` | Update line items |
| POST | `/api/draft-orders/[id]/submit` | Export to shop system |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents/analyze` | Analyze PDF with Azure DI |

### Lookups

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/lookups/test` | Test normalization matching |

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# OpenAI (for GPT-4o Vision extraction)
OPENAI_API_KEY=sk-...

# Azure Document Intelligence (optional)
AZURE_DOCUMENT_ENDPOINT=https://xxx.cognitiveservices.azure.com
AZURE_DOCUMENT_KEY=xxx

# Shop Systems
SHOPWARE_API_URL=https://shop.example.com/api
SHOPWARE_ACCESS_KEY=xxx
XENTRAL_API_URL=https://xxx.xentral.com/api
XENTRAL_API_TOKEN=xxx

# Optional
MOCK_EXTERNAL_APIS=true  # Use mock adapters
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Components**: shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4o Vision
- **Document Analysis**: Azure Document Intelligence

## License

Private - All rights reserved.
