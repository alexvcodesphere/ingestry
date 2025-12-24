# Environment Variables

Copy this file to `.env.local` and fill in the values.

## Supabase

# Note: Use the new API key format (sb*publishable* and sb*secret*)

# See: https://github.com/orgs/supabase/discussions/29260

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
SUPABASE_SECRET_KEY=sb_secret_your-key

## Azure Document Intelligence

AZURE_DOCUMENT_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_DOCUMENT_KEY=your-azure-key

## OpenAI (for GPT-based extraction)

OPENAI_API_KEY=your-openai-key

## Gemini (alternative vision model)

GEMINI_API_KEY=your-gemini-key

## Feature Flags

MOCK_EXTERNAL_APIS=true

## Xentral (mocked by default)

XENTRAL_API_URL=https://your-xentral.xentral.biz/api/
XENTRAL_API_KEY=your-xentral-key

## Shopware (mocked by default)

SHOPWARE_API_URL=https://your-shopware.com/api/
SHOPWARE_API_KEY=your-shopware-key
