The overlap you identified was that Spark (the AI assistant) was unaware of the strict field templates (like `{brand.code}-{sequence}`) defined in your Processing Profiles. This meant Spark might hallucinate values or break strict formatting rules when asked to modify data.

I have fixed this by injecting your template definitions directly into Spark's system prompt.

**Changes made:**

1.  **Spark Client (`src/lib/extraction/spark-client.ts`)**:
    *   Updated `sparkAudit` to accept rich `FieldConfig` metadata (not just a simple schema).
    *   Modified the prompt generator to add a **"## Field Rules & Templates"** section.
    *   This section explicitly tells the AI: *"Field [x] MUST be formed as [template]. variables like {brand.code} mean..."*

2.  **API Route (`src/app/api/draft-orders/[id]/spark/route.ts`)**:
    *   Updated the API to pass the full `profileFields` (which contain the template logic) to the Spark engine.

Now, if a user asks Spark to "fix the SKUs", Spark will see the rule: `sku: MUST be formed as "{brand.code}-{sequence}"` and generates the correct format instead of guessing.