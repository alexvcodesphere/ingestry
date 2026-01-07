"use client";

/**
 * Ingestry Spark Sidebar (AI SDK v6)
 * 
 * A conversational AI assistant for data transformations using
 * Vercel AI SDK v6's useChat hook with streaming and tool visualization.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
    Sparkles, Send, Undo2, Brain, Search, Wand2, CheckCircle2, 
    User, RotateCcw, X, Loader2, 
    ArrowRight, RefreshCw, HelpCircle
} from "lucide-react";

export interface SparkCompletionResult {
    sessionId: string;
    patchedIds: string[];
    patchedFields: string[];
    triggerRegeneration: boolean;
    summary: string;
    /** Full updated items for optimistic grid updates */
    items?: Array<{ id: string; data: Record<string, unknown> }>;
}

interface IngestrySparkProps {
    orderId: string;
    selectedIds?: string[];
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSparkComplete: (result: SparkCompletionResult) => void;
    onProcessingChange: (isProcessing: boolean) => void;
    onRegeneratingChange?: (ids: Set<string>) => void;
    /** Callback for immediate optimistic updates from tool results */
    onOptimisticUpdate?: (items: Array<{ id: string; data: Record<string, unknown> }>) => void;
}

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
        <div className="relative h-4 w-4 flex items-center justify-center">
            <Icon className="h-4 w-4 absolute animate-in fade-in zoom-in duration-300" key={iconIndex} />
        </div>
    );
}

/**
 * Catalog suggestion card with Accept button
 */
function CatalogSuggestionCard({ 
    suggestion, 
    callId 
}: { 
    suggestion: { catalog_key: string; value: string; suggested_canonical: string; reason?: string };
    callId: string;
}) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleAccept = async () => {
        setStatus('loading');
        setErrorMessage('');
        
        try {
            const res = await fetch('/api/catalogs/alias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    catalog_key: suggestion.catalog_key,
                    alias_value: suggestion.value,
                    canonical_name: suggestion.suggested_canonical,
                }),
            });
            
            const result = await res.json();
            
            if (result.success) {
                setStatus('success');
            } else {
                setStatus('error');
                setErrorMessage(result.error || 'Failed to add alias');
            }
        } catch (error) {
            setStatus('error');
            setErrorMessage('Network error');
        }
    };

    return (
        <motion.div
            key={callId}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-xl border p-3 ring-1 ring-inset ${
                status === 'success' 
                    ? 'bg-gradient-to-br from-emerald-50/80 to-green-50/50 dark:from-emerald-950/30 dark:to-green-950/20 ring-emerald-200/50 dark:ring-emerald-800/30'
                    : status === 'error'
                    ? 'bg-gradient-to-br from-red-50/80 to-rose-50/50 dark:from-red-950/30 dark:to-rose-950/20 ring-red-200/50 dark:ring-red-800/30'
                    : 'bg-gradient-to-br from-violet-50/80 to-purple-50/50 dark:from-violet-950/30 dark:to-purple-950/20 ring-violet-200/50 dark:ring-violet-800/30'
            }`}
        >
            <div className="flex items-start gap-2">
                {status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                    <Sparkles className={`h-4 w-4 mt-0.5 shrink-0 ${status === 'error' ? 'text-red-500' : 'text-violet-600 dark:text-violet-400'}`} />
                )}
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                        status === 'success' 
                            ? 'text-emerald-800 dark:text-emerald-200' 
                            : status === 'error'
                            ? 'text-red-800 dark:text-red-200'
                            : 'text-violet-800 dark:text-violet-200'
                    }`}>
                        {status === 'success' ? 'Alias Added' : status === 'error' ? 'Failed to Add' : 'Catalog Suggestion'}
                    </p>
                    <p className={`text-xs mt-1 ${
                        status === 'success' 
                            ? 'text-emerald-600 dark:text-emerald-400' 
                            : status === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-violet-600 dark:text-violet-400'
                    }`}>
                        {status === 'error' ? errorMessage : (
                            <>Add &quot;{suggestion.value}&quot; as alias for &quot;{suggestion.suggested_canonical}&quot;</>
                        )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        in {suggestion.catalog_key} catalog
                    </p>
                </div>
                {status === 'idle' && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-xs text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                        onClick={handleAccept}
                    >
                        Accept
                    </Button>
                )}
                {status === 'loading' && (
                    <div className="h-7 px-2.5 flex items-center">
                        <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                    </div>
                )}
            </div>
        </motion.div>
    );
}

/**
 * Render a single message part based on AI SDK v6 format
 */
function MessagePart({ 
    part, 
    index,
    onUndo,
    undoState,
}: { 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    part: any; 
    index: number;
    onUndo?: (sessionId: string) => void;
    undoState?: { undoing: string | null; undone: Set<string> };
}) {
    // Text parts
    if (part.type === 'text') {
        return (
            <div key={index} className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                <ReactMarkdown>{part.text}</ReactMarkdown>
            </div>
        );
    }
    
    // Tool parts use dynamic type names like 'tool-patch_items'
    if (part.type?.startsWith('tool-')) {
        const toolName = part.type.replace('tool-', '');
        const callId = part.toolCallId;
        const state = part.state; // 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
        
        // patch_items tool
        if (toolName === 'patch_items') {
            switch (state) {
                case 'input-streaming':
                case 'input-available':
                    return (
                        <motion.div 
                            key={callId}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 backdrop-blur-sm rounded-xl px-3 py-2 ring-1 ring-inset ring-border/30"
                        >
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span>Applying changes...</span>
                        </motion.div>
                    );
                case 'output-available': {
                    const output = part.output || {};
                    return (
                        <motion.div
                            key={callId}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="rounded-xl border bg-gradient-to-br from-emerald-50/80 to-green-50/50 dark:from-emerald-950/30 dark:to-green-950/20 p-3 ring-1 ring-inset ring-emerald-200/50 dark:ring-emerald-800/30"
                        >
                            <div className="flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                                        Updated {output.count} item{output.count !== 1 ? 's' : ''}
                                    </p>
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                                        {output.field} <ArrowRight className="inline h-3 w-3 mx-1" /> {String(output.value)}
                                    </p>
                                </div>
                                {output.sessionId && onUndo && undoState && (
                                    undoState.undone.has(output.sessionId) ? (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Undone
                                        </span>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                                            onClick={() => onUndo(output.sessionId)}
                                            disabled={undoState.undoing === output.sessionId}
                                        >
                                            {undoState.undoing === output.sessionId ? (
                                                <>
                                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                    Undoing...
                                                </>
                                            ) : (
                                                <>
                                                    <Undo2 className="h-3 w-3 mr-1" />
                                                    Undo
                                                </>
                                            )}
                                        </Button>
                                    )
                                )}
                            </div>
                        </motion.div>
                    );
                }
                case 'output-error':
                    return (
                        <div key={callId} className="text-red-500 text-sm">
                            Error: {part.errorText}
                        </div>
                    );
            }
        }
        
        // recalculate_fields tool
        if (toolName === 'recalculate_fields') {
            switch (state) {
                case 'input-streaming':
                case 'input-available':
                    return (
                        <motion.div 
                            key={callId}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 backdrop-blur-sm rounded-xl px-3 py-2 ring-1 ring-inset ring-border/30"
                        >
                            <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                            <span>Recalculating fields...</span>
                        </motion.div>
                    );
                case 'output-available': {
                    const output = part.output || {};
                    return (
                        <motion.div
                            key={callId}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="rounded-xl border bg-gradient-to-br from-blue-50/80 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/20 p-3 ring-1 ring-inset ring-blue-200/50 dark:ring-blue-800/30"
                        >
                            <div className="flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                <div>
                                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                                        Recalculated {output.count} item{output.count !== 1 ? 's' : ''}
                                    </p>
                                    {output.fields?.length > 0 && (
                                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                                            Fields: {output.fields.join(', ')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    );
                }
                case 'output-error':
                    return <div key={callId} className="text-red-500 text-sm">Error: {part.errorText}</div>;
            }
        }
        
        // query_order_data tool
        if (toolName === 'query_order_data') {
            switch (state) {
                case 'input-streaming':
                case 'input-available':
                    return (
                        <motion.div 
                            key={callId}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 backdrop-blur-sm rounded-xl px-3 py-2 ring-1 ring-inset ring-border/30"
                        >
                            <Search className="h-4 w-4 animate-pulse text-amber-500" />
                            <span>Analyzing data...</span>
                        </motion.div>
                    );
                case 'output-available': {
                    const output = part.output || {};
                    return (
                        <motion.div
                            key={callId}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="rounded-xl border bg-gradient-to-br from-amber-50/80 to-yellow-50/50 dark:from-amber-950/30 dark:to-yellow-950/20 p-3 ring-1 ring-inset ring-amber-200/50 dark:ring-amber-800/30"
                        >
                            <div className="flex items-center gap-2">
                                <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                    {output.summary}
                                </p>
                            </div>
                        </motion.div>
                    );
                }
                case 'output-error':
                    return <div key={callId} className="text-red-500 text-sm">Error: {part.errorText}</div>;
            }
        }
        
        // suggest_catalog_alias tool
        if (toolName === 'suggest_catalog_alias') {
            switch (state) {
                case 'input-streaming':
                case 'input-available':
                    return (
                        <motion.div 
                            key={callId}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 backdrop-blur-sm rounded-xl px-3 py-2 ring-1 ring-inset ring-border/30"
                        >
                            <Sparkles className="h-4 w-4 animate-pulse text-violet-500" />
                            <span>Analyzing catalog values...</span>
                        </motion.div>
                    );
                case 'output-available': {
                    const output = part.output || {};
                    const suggestion = output.suggestion || {};
                    return (
                        <CatalogSuggestionCard 
                            key={callId}
                            callId={callId}
                            suggestion={suggestion}
                        />
                    );
                }
                case 'output-error':
                    return <div key={callId} className="text-red-500 text-sm">Error: {part.errorText}</div>;
            }
        }
        
        // Generic tool fallback
        return (
            <div key={callId} className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                Tool: {toolName} ({state})
            </div>
        );
    }
    
    return null;
}

/**
 * Individual message component with tool visualization
 */
function SparkMessage({ 
    message, 
    onUndo,
    undoState,
}: { 
    message: UIMessage; 
    onUndo?: (sessionId: string) => void;
    undoState?: { undoing: string | null; undone: Set<string> };
}) {
    const isUser = message.role === "user";
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
        >
            {/* Avatar */}
            <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center border ${
                isUser 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "bg-primary/10 text-primary border-primary/20"
            }`}>
                {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            </div>
            
            {/* Content */}
            <div className="max-w-[85%] space-y-2">
                {isUser ? (
                    // User messages - just render text
                    <div className="rounded-xl px-3 py-2 text-sm bg-gradient-to-br from-primary/20 to-primary/10 text-foreground ring-1 ring-inset ring-primary/30">
                        <p className="whitespace-pre-wrap">
                            {message.parts.map((part, i) => 
                                part.type === 'text' ? part.text : null
                            ).join('')}
                        </p>
                    </div>
                ) : (
                    // Assistant messages - render all parts
                    <>
                        {message.parts.map((part, index) => (
                            <MessagePart
                                key={index}
                                part={part}
                                index={index}
                                onUndo={onUndo}
                                undoState={undoState}
                            />
                        ))}
                    </>
                )}
            </div>
        </motion.div>
    );
}

// Separate toggle button component for use in toolbar
export function SparkToggleButton({ 
    onClick, 
    disabled,
    selectedCount = 0
}: { 
    onClick: () => void; 
    disabled?: boolean;
    selectedCount?: number;
}) {
    return (
        <Button
            variant="outline"
            size="sm"
            onClick={onClick}
            disabled={disabled}
            className="gap-2 spark-shimmer"
        >
            <Sparkles className="h-4 w-4" />
            Spark
            {selectedCount > 0 && (
                <span className="text-xs text-muted-foreground">({selectedCount})</span>
            )}
        </Button>
    );
}

export function IngestrySpark({
    orderId,
    selectedIds = [],
    isOpen,
    onOpenChange,
    onSparkComplete,
    onProcessingChange,
    onOptimisticUpdate,
}: IngestrySparkProps) {
    const [lastSessionId, setLastSessionId] = useState<string | null>(null);
    const [undoingSession, setUndoingSession] = useState<string | null>(null);
    const [undoneSessions, setUndoneSessions] = useState<Set<string>>(new Set());
    const [inputValue, setInputValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Create transport with dynamic body based on selectedIds
    const transport = useMemo(() => new DefaultChatTransport({
        api: `/api/draft-orders/${orderId}/spark`,
        body: {
            lineItemIds: selectedIds.length > 0 ? selectedIds : undefined,
        },
    }), [orderId, selectedIds]);

    // Use the AI SDK v6 useChat hook
    const { 
        messages, 
        sendMessage,
        status,
        setMessages,
    } = useChat({
        transport,
        onFinish: ({ message }) => {
            // Process tool parts for completion callbacks
            for (const part of message.parts) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const p = part as any;
                if (p.type?.startsWith('tool-') && p.state === 'output-available') {
                    const toolName = p.type.replace('tool-', '');
                    const output = p.output || {};
                    
                    if (toolName === 'patch_items' && output.success) {
                        setLastSessionId(output.sessionId);
                        // Optimistic UI update
                        if (onOptimisticUpdate && output.items?.length > 0) {
                            onOptimisticUpdate(output.items);
                        }
                        onSparkComplete({
                            sessionId: output.sessionId,
                            patchedIds: output.items?.map((i: { id: string }) => i.id) || [],
                            patchedFields: [output.field],
                            triggerRegeneration: false,
                            summary: `Updated ${output.count} items`,
                            items: output.items,
                        });
                    }
                    
                    if (toolName === 'recalculate_fields' && output.success) {
                        // Optimistic UI update
                        if (onOptimisticUpdate && output.items?.length > 0) {
                            onOptimisticUpdate(output.items);
                        }
                        onSparkComplete({
                            sessionId: '',
                            patchedIds: output.items?.map((i: { id: string }) => i.id) || [],
                            patchedFields: output.fields || [],
                            triggerRegeneration: true,
                            summary: `Recalculated ${output.count} items`,
                            items: output.items,
                        });
                    }
                }
            }
        },
        onError: (error: Error) => {
            console.error('[Spark] Chat error:', error);
        },
    });

    const isLoading = status === 'streaming' || status === 'submitted';

    // Update parent processing state
    useEffect(() => {
        onProcessingChange(isLoading);
    }, [isLoading, onProcessingChange]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [messages]);

    // Focus textarea when opened
    useEffect(() => {
        if (isOpen && textareaRef.current) {
            setTimeout(() => textareaRef.current?.focus(), 200);
        }
    }, [isOpen]);

    // Handle undo
    const handleUndo = useCallback(async (sessionId: string) => {
        if (undoingSession) return;
        setUndoingSession(sessionId);
        
        try {
            const res = await fetch(`/api/draft-orders/${orderId}/spark`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            });
            
            const result = await res.json();
            
            if (result.success) {
                // Mark session as undone
                setUndoneSessions(prev => new Set(prev).add(sessionId));
                
                // Optimistic update with reverted data
                if (onOptimisticUpdate && result.data?.items) {
                    onOptimisticUpdate(result.data.items);
                }
                
                setLastSessionId(null);
                
                onSparkComplete({
                    sessionId: '',
                    patchedIds: [],
                    patchedFields: [],
                    triggerRegeneration: false,
                    summary: 'Reverted changes',
                    items: result.data?.items,
                });
            }
        } catch (error) {
            console.error('[Spark] Undo error:', error);
        } finally {
            setUndoingSession(null);
        }
    }, [orderId, undoingSession, onOptimisticUpdate, onSparkComplete]);

    const handleNewConversation = () => {
        setMessages([]);
        setLastSessionId(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;
        
        sendMessage({ text: inputValue });
        setInputValue("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
        }
    };

    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 360, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ 
                        width: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
                        opacity: { duration: 0.25, delay: 0.15 }
                    }}
                    className="self-stretch max-h-[800px]"
                    style={{ overflow: 'clip' }}
                >
                    <Card className="w-full min-w-[360px] h-full flex flex-col overflow-hidden">
                        {/* Clean header */}
                        <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between shrink-0">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                Spark
                                {selectedIds.length > 0 && (
                                    <span className="text-xs text-muted-foreground font-normal">
                                        ({selectedIds.length} selected)
                                    </span>
                                )}
                            </CardTitle>
                            <div className="flex items-center gap-1">
                                {messages.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={handleNewConversation}
                                        title="New conversation"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => onOpenChange(false)}
                                    disabled={isLoading}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                            {/* Messages area */}
                            <div className={`flex-1 p-3 space-y-3 ${messages.length > 0 ? 'overflow-y-auto' : 'overflow-hidden'}`}>
                                {messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full py-8 text-center px-4">
                                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                                            <Sparkles className="h-5 w-5 text-primary" />
                                        </div>
                                        <h4 className="font-medium text-sm mb-0.5">How can I help?</h4>
                                        <p className="text-xs text-muted-foreground mb-4">
                                            Transform, analyze, or fix your data
                                        </p>
                                        
                                        {/* Quick actions grid */}
                                        <div className="w-full max-w-[240px] space-y-2">
                                            <button
                                                onClick={() => sendMessage({ text: "Do a sanity check on my data. Check for any values that don't match the catalog and suggest fixes." })}
                                                disabled={isLoading}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left ring-1 ring-inset ring-border/30 active:scale-[0.98]"
                                            >
                                                <Search className="h-4 w-4 text-primary shrink-0" />
                                                <span>Sanity check</span>
                                            </button>
                                            <button
                                                onClick={() => sendMessage({ text: "Find any empty or missing required fields in the data" })}
                                                disabled={isLoading}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left ring-1 ring-inset ring-border/30 active:scale-[0.98]"
                                            >
                                                <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" />
                                                <span>Find missing values</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {messages.map((msg) => (
                                            <SparkMessage 
                                                key={msg.id} 
                                                message={msg}
                                                onUndo={handleUndo}
                                                undoState={{ undoing: undoingSession, undone: undoneSessions }}
                                            />
                                        ))}
                                        
                                        {/* Loading indicator when streaming */}
                                        {isLoading && messages[messages.length - 1]?.role === 'user' && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="flex gap-2.5"
                                            >
                                                <div className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center border bg-primary/10 text-primary border-primary/20">
                                                    <Sparkles className="h-3.5 w-3.5" />
                                                </div>
                                                <div className="bg-muted/40 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2 ring-1 ring-inset ring-border/30">
                                                    <LoadingIcon />
                                                    <span className="text-sm text-muted-foreground">Thinking...</span>
                                                </div>
                                            </motion.div>
                                        )}
                                    </>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input area */}
                            <div className="border-t p-3 shrink-0">
                                <form onSubmit={handleSubmit} className="flex items-end gap-2">
                                    <Textarea
                                        ref={textareaRef}
                                        placeholder="Ask anything..."
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        disabled={isLoading}
                                        className="min-h-[40px] max-h-[100px] flex-1 resize-none text-sm border-0 shadow-none focus-visible:ring-0 focus-visible:bg-transparent p-2 bg-muted/30 rounded-lg"
                                        rows={1}
                                    />
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={!inputValue.trim() || isLoading}
                                        className="h-9 w-9 shrink-0 rounded-full"
                                    >
                                        {isLoading ? (
                                            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4" />
                                        )}
                                    </Button>
                                </form>
                            </div>
                            <p className="text-[10px] text-muted-foreground/50 text-center py-2 border-t">Spark can make mistakes. Verify important changes.</p>
                        </CardContent>
                    </Card>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
