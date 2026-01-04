/**
 * Profile Suggestion API Route
 * Accepts a document upload and returns suggested field definitions
 */

import { NextRequest, NextResponse } from "next/server";
import { suggestProfileFromDocument } from "@/lib/extraction/profile-guesser";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 }
            );
        }

        // Validate file type
        const allowedTypes = [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
        ];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: "Invalid file type. Supported: PDF, PNG, JPEG, WebP" },
                { status: 400 }
            );
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`[Profile Suggest API] Processing ${file.name} (${file.type})`);

        // Get suggested fields from AI
        const suggestedFields = await suggestProfileFromDocument(buffer, file.type);

        return NextResponse.json({
            success: true,
            fields: suggestedFields,
        });
    } catch (error) {
        console.error("[Profile Suggest API] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to analyze document" },
            { status: 500 }
        );
    }
}
