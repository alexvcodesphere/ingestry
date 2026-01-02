"use client";

/**
 * Ingestry Spark Component
 * A floating "magic" command input with premium AI entry animations.
 * Features: Full-screen glow effect with smooth enter/exit animations.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, X, Undo2, Brain, Search, Wand2, CheckCircle2 } from "lucide-react";

export interface SparkCompletionResult {
    sessionId: string;
    patchedIds: string[];
    patchedFields: string[];
    triggerRegeneration: boolean;
    summary: string;
}

interface IngestrySparkProps {
    orderId: string;
    selectedIds?: string[];
    onSparkComplete: (result: SparkCompletionResult) => void;
    onProcessingChange: (isProcessing: boolean) => void;
    disabled?: boolean;
}

type SparkState = "idle" | "processing" | "success" | "ambiguous" | "error";

// Conversation message for memory
interface ConversationMessage {
    role: "user" | "assistant";
    content: string;
}

// Loading icons that cycle
const LOADING_ICONS = [Brain, Search, Wand2, CheckCircle2];

function LoadingIcon() {
    const [iconIndex, setIconIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setIconIndex((prev) => (prev + 1) % LOADING_ICONS.length);
        }, 1200);
        return () => clearInterval(interval);
    }, []);

    const Icon = LOADING_ICONS[iconIndex];

    return (
        <div className="relative h-3 w-3 mr-2 flex items-center justify-center">
            <Icon 
                className="h-3 w-3 absolute animate-in fade-in zoom-in duration-300" 
                key={iconIndex} 
            />
        </div>
    );
}



export function IngestrySpark({
    orderId,
    selectedIds = [],
    onSparkComplete,
    onProcessingChange,
    disabled = false,
}: IngestrySparkProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [instruction, setInstruction] = useState("");
    const [state, setState] = useState<SparkState>("idle");
    const [response, setResponse] = useState<string | null>(null);
    const [lastSessionId, setLastSessionId] = useState<string | null>(null);
    const [undoing, setUndoing] = useState(false);
    const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);



    useEffect(() => {
        if (isOpen && textareaRef.current) {
            // Slight delay to allow animation to start
            setTimeout(() => textareaRef.current?.focus(), 300);
        }
    }, [isOpen]);

    const handleUndo = async () => {
        if (!lastSessionId || undoing) return;
        setUndoing(true);
        setResponse("Reverting...");
        try {
            const res = await fetch(`/api/draft-orders/${orderId}/spark`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: lastSessionId }),
            });
            const result = await res.json();
            if (result.success) {
                setResponse(`✓ Reverted ${result.data.revertedCount} changes`);
                setLastSessionId(null);
                onSparkComplete({
                    sessionId: "",
                    patchedIds: [],
                    patchedFields: [],
                    triggerRegeneration: false,
                    summary: "Reverted",
                });
            } else {
                setResponse("Failed to undo");
            }
        } catch {
            setResponse("Failed to undo changes");
        } finally {
            setUndoing(false);
        }
    };

    const handleSubmit = async () => {
        if (!instruction.trim() || state === "processing") return;

        setState("processing");
        setResponse(null);
        onProcessingChange(true);

        try {
            const res = await fetch(`/api/draft-orders/${orderId}/spark`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction: instruction.trim(),
                    lineItemIds: selectedIds.length > 0 ? selectedIds : undefined,
                    conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
                }),
            });

            const result = await res.json();

            if (!res.ok || !result.success) {
                throw new Error(result.error || 'Spark failed');
            }

            const { data } = result;

            if (data.status === "ambiguous") {
                setState("ambiguous");
                setResponse(data.clarification_needed || "I need more details. Could you clarify?");
                setConversationHistory(prev => [
                    ...prev,
                    { role: "user", content: instruction.trim() },
                    { role: "assistant", content: data.clarification_needed || "I need more details." },
                ]);
                return;
            }

            if (data.status === "no_changes" || data.patchedCount === 0) {
                setState("success");
                setResponse("No changes needed for your request.");
                setInstruction("");
                return;
            }

            setState("success");
            setResponse(data.summary);
            setLastSessionId(data.sessionId);

            onSparkComplete({
                sessionId: data.sessionId,
                patchedIds: data.patchedIds || [],
                patchedFields: data.patchedFields || [],
                triggerRegeneration: data.triggerRegeneration || false,
                summary: data.summary || 'Changes applied',
            });

            setConversationHistory([]);
            setInstruction("");
        } catch (e) {
            setState("error");
            setResponse(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            onProcessingChange(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') {
            if (state !== "processing") {
                setIsOpen(false);
                setState("idle");
                setResponse(null);
            }
        }
    };

    const handleClose = () => {
        if (state !== "processing") {
            setIsOpen(false);
            setState("idle");
            setResponse(null);
        }
    };

    // Button always renders, AnimatePresence handles the popup animations
    return (
        <>
            {/* Trigger button - always visible, disabled when open */}
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                disabled={disabled || isOpen}
                className="gap-2 transition-all"
            >
                <Sparkles className="h-4 w-4" />
                Spark
            </Button>

            {/* Animated popup - AnimatePresence enables exit animations */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Full-screen AI glow backdrop - pointer-events-none allows scrolling */}
                        <motion.div
                            className="fixed inset-0 z-40 pointer-events-none"
                            initial={{ opacity: 0, scale: 1.1 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.1 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                        >
                            {/* Elegant radial glow from bottom - layered for depth */}
                            <div 
                                className="absolute inset-0"
                                style={{
                                    background: `
                                        radial-gradient(ellipse 120% 40% at 50% 105%, 
                                            oklch(0.55 0.18 132 / 0.25) 0%, 
                                            oklch(0.55 0.18 132 / 0.12) 25%,
                                            transparent 55%),
                                        radial-gradient(ellipse 80% 30% at 50% 100%, 
                                            oklch(0.6 0.18 160 / 0.15) 0%, 
                                            transparent 50%)`
                                }}
                            />
                            {/* Subtle inner glow accent */}
                            <div 
                                className="absolute inset-0"
                                style={{
                                    background: `radial-gradient(ellipse 60% 20% at 50% 100%, 
                                        oklch(0.65 0.18 132 / 0.08) 0%, 
                                        transparent 40%)`
                                }}
                            />
                        </motion.div>

                        {/* Main popup with premium effects */}
                        <motion.div
                            className="fixed bottom-20 left-1/2 z-50 w-full max-w-xl px-4"
                            initial={{ 
                                opacity: 0, 
                                y: 40, 
                                x: "-50%",
                                scale: 0.95 
                            }}
                            animate={{ 
                                opacity: 1, 
                                y: 0, 
                                x: "-50%",
                                scale: 1 
                            }}
                            exit={{ 
                                opacity: 0, 
                                y: 20, 
                                x: "-50%",
                                scale: 0.98 
                            }}
                            transition={{ 
                                duration: 0.4, 
                                ease: [0.16, 1, 0.3, 1]
                            }}
                        >
                            {/* Popup container with subtle glow */}
                            <div className="relative">
                                {/* Soft ambient glow behind popup */}
                                <motion.div
                                    className="absolute -inset-3 rounded-xl blur-xl"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 0.6 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    style={{
                                        background: `radial-gradient(circle, 
                                            oklch(0.55 0.18 132 / 0.35) 0%, 
                                            oklch(0.6 0.18 160 / 0.15) 50%,
                                            transparent 75%)`
                                    }}
                                />

                                {/* Main card */}
                                <div className="relative bg-background border shadow-2xl rounded-lg overflow-hidden">
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <Sparkles className="h-4 w-4 text-primary" />
                                            <span>Ingestry Spark</span>
                                            {selectedIds.length > 0 && (
                                                <span className="text-muted-foreground text-xs">
                                                    ({selectedIds.length} selected)
                                                </span>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={handleClose}
                                            disabled={state === "processing"}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {/* Response area */}
                                    <AnimatePresence mode="wait">
                                        {response && (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className={`overflow-hidden border-b ${
                                                    state === "error" ? "bg-destructive/10 text-destructive" :
                                                    state === "ambiguous" ? "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200" :
                                                    "bg-primary/5 text-foreground"
                                                }`}
                                            >
                                                <div className="px-4 py-3 text-sm">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p>{response}</p>
                                                        {lastSessionId && state === "success" && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="shrink-0 h-7 px-2"
                                                                onClick={handleUndo}
                                                                disabled={undoing}
                                                            >
                                                                {undoing ? (
                                                                    <div className="h-3 w-3 mr-1 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                                ) : (
                                                                    <Undo2 className="h-3 w-3 mr-1" />
                                                                )}
                                                                {undoing ? "Undoing..." : "Undo"}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Input area */}
                                    <div className="p-3">
                                        <Textarea
                                            ref={textareaRef}
                                            placeholder="What would you like me to do?"
                                            value={instruction}
                                            onChange={(e) => setInstruction(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            disabled={state === "processing"}
                                            className="min-h-[60px] resize-none border-0 focus-visible:ring-0 shadow-none p-0 text-sm"
                                        />
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20">
                                        <span className="text-xs text-muted-foreground">
                                            ⌘+Enter to send
                                        </span>
                                        <Button
                                            size="sm"
                                            onClick={handleSubmit}
                                            disabled={!instruction.trim() || state === "processing"}
                                            className="h-7"
                                        >
                                            {state === "processing" ? (
                                                <>
                                                    <LoadingIcon />
                                                    Thinking...
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="h-3 w-3 mr-1" />
                                                    Send
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}

