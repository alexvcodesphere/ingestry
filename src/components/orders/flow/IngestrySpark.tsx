"use client";

/**
 * Ingestry Spark Sidebar
 * A conversational AI assistant for data transformations.
 * Renders as a collapsible sidebar card with smooth animations.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
    Sparkles, Send, Undo2, Brain, Search, Wand2, CheckCircle2, 
    User, Bot, Wrench, Info, RotateCcw, HelpCircle, X, MessageSquare
} from "lucide-react";

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
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSparkComplete: (result: SparkCompletionResult) => void;
    onProcessingChange: (isProcessing: boolean) => void;
}

type SparkState = "idle" | "processing" | "success" | "ambiguous" | "error";

interface ChatMessage {
    id: string;
    type: "user" | "assistant" | "tool" | "system";
    content: string;
    metadata?: {
        patchedCount?: number;
        patchedFields?: string[];
        sessionId?: string;
    };
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

function SparkMessage({ 
    message, 
    onUndo, 
    canUndo, 
    isUndoing, 
    onEnableQuestions 
}: { 
    message: ChatMessage; 
    onUndo?: () => void;
    canUndo?: boolean;
    isUndoing?: boolean;
    onEnableQuestions?: () => void;
}) {
    const isUser = message.type === "user";
    const isTool = message.type === "tool";
    const isSystem = message.type === "system";
    const isQuestionPrompt = isSystem && message.content.includes("question about your data");
    const isThinking = message.content === "thinking";
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
        >
            <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center border ${
                isUser ? "bg-primary text-primary-foreground border-primary" :
                isTool ? "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" :
                isQuestionPrompt ? "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800" :
                isSystem ? "bg-muted text-muted-foreground border-border" :
                "bg-primary/10 text-primary border-primary/20"
            }`}>
                {isUser ? <User className="h-3.5 w-3.5" /> :
                 isTool ? <Wrench className="h-3.5 w-3.5" /> :
                 isQuestionPrompt ? <HelpCircle className="h-3.5 w-3.5" /> :
                 isSystem ? <Info className="h-3.5 w-3.5" /> :
                 <Sparkles className="h-3.5 w-3.5" />}
            </div>
            
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                isUser ? "bg-primary/10 text-foreground border border-primary/20" :
                isTool ? "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800" :
                isQuestionPrompt ? "bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800" :
                isSystem ? "bg-muted/50 text-muted-foreground text-xs" :
                "bg-muted"
            }`}>
                {isThinking ? (
                    <div className="flex items-center gap-2">
                        <LoadingIcon />
                        <span className="text-muted-foreground">Thinking...</span>
                    </div>
                ) : isUser ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-2">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                )}
                
                {isQuestionPrompt && onEnableQuestions && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 mt-2 text-xs border-blue-300 dark:border-blue-700"
                        onClick={onEnableQuestions}
                    >
                        <HelpCircle className="h-3 w-3 mr-1.5" />
                        Enable for this session
                    </Button>
                )}
                
                {isTool && message.metadata?.patchedFields && message.metadata.patchedFields.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {message.metadata.patchedFields.map(field => (
                            <span key={field} className="text-xs bg-amber-200/50 dark:bg-amber-800/30 px-1.5 py-0.5 rounded">
                                {field}
                            </span>
                        ))}
                    </div>
                )}
                
                {isTool && canUndo && onUndo && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 mt-1.5 text-xs"
                        onClick={onUndo}
                        disabled={isUndoing}
                    >
                        {isUndoing ? (
                            <div className="h-3 w-3 mr-1.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Undo2 className="h-3 w-3 mr-1.5" />
                        )}
                        {isUndoing ? "Undoing..." : "Undo"}
                    </Button>
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
            className="gap-2"
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
}: IngestrySparkProps) {
    const [instruction, setInstruction] = useState("");
    const [state, setState] = useState<SparkState>("idle");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [lastSessionId, setLastSessionId] = useState<string | null>(null);
    const [undoing, setUndoing] = useState(false);
    const [allowQuestions, setAllowQuestions] = useState(false);
    const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [messages]);

    useEffect(() => {
        if (isOpen && textareaRef.current) {
            setTimeout(() => textareaRef.current?.focus(), 200);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && selectedIds.length > 0 && messages.length === 0) {
            setMessages([{
                id: `system-${Date.now()}`,
                type: "system",
                content: `Working with ${selectedIds.length} selected item${selectedIds.length > 1 ? "s" : ""}`
            }]);
        }
    }, [isOpen, selectedIds.length, messages.length]);

    const addMessage = (msg: Omit<ChatMessage, "id">) => {
        setMessages(prev => [...prev, { ...msg, id: `${msg.type}-${Date.now()}` }]);
    };

    const handleUndo = async () => {
        if (!lastSessionId || undoing) return;
        setUndoing(true);
        try {
            const res = await fetch(`/api/draft-orders/${orderId}/spark`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: lastSessionId }),
            });
            const result = await res.json();
            if (result.success) {
                addMessage({ type: "system", content: `✓ Reverted ${result.data.revertedCount} changes` });
                setLastSessionId(null);
                onSparkComplete({
                    sessionId: "", patchedIds: [], patchedFields: [],
                    triggerRegeneration: false, summary: "Reverted",
                });
            } else {
                addMessage({ type: "system", content: "Failed to undo" });
            }
        } catch {
            addMessage({ type: "system", content: "Failed to undo changes" });
        } finally {
            setUndoing(false);
        }
    };

    const handleSubmit = async () => {
        if (!instruction.trim() || state === "processing") return;

        const userMessage = instruction.trim();
        addMessage({ type: "user", content: userMessage });
        setInstruction("");
        setState("processing");
        onProcessingChange(true);
        
        const thinkingMsgId = `thinking-${Date.now()}`;
        setMessages(prev => [...prev, { id: thinkingMsgId, type: "system" as const, content: "thinking" }]);

        const conversationHistory = messages
            .filter(m => m.type === "user" || m.type === "assistant")
            .map(m => ({ role: m.type as "user" | "assistant", content: m.content }));

        try {
            const res = await fetch(`/api/draft-orders/${orderId}/spark`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction: userMessage,
                    lineItemIds: selectedIds.length > 0 ? selectedIds : undefined,
                    conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
                    allowQuestions,
                }),
            });

            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || 'Spark failed');

            const { data } = result;

            if (data.status === "ambiguous") {
                setMessages(prev => prev.filter(m => !m.id.startsWith('thinking-')));
                setState("ambiguous");
                addMessage({ type: "assistant", content: data.clarification_needed || "I need more details." });
                return;
            }

            if (data.status === "question") {
                setMessages(prev => prev.filter(m => !m.id.startsWith('thinking-')));
                setState("success");
                if (data.answer) {
                    addMessage({ type: "tool", content: `Analyzed ${data.recordsAnalyzed || "all"} records` });
                    addMessage({ type: "assistant", content: data.answer });
                } else {
                    setPendingQuestion(userMessage);
                    addMessage({ type: "system", content: data.summary || "This looks like a question about your data." });
                }
                return;
            }

            setMessages(prev => prev.filter(m => !m.id.startsWith('thinking-')));

            if (data.status === "no_changes" || data.patchedCount === 0) {
                setState("success");
                addMessage({ type: "assistant", content: "No changes needed for your request." });
                return;
            }

            addMessage({
                type: "tool",
                content: `Updated ${data.patchedCount} item${data.patchedCount > 1 ? "s" : ""}`,
                metadata: { patchedCount: data.patchedCount, patchedFields: data.patchedFields, sessionId: data.sessionId }
            });
            addMessage({ type: "assistant", content: data.summary });

            setState("success");
            setLastSessionId(data.sessionId);
            onSparkComplete({
                sessionId: data.sessionId,
                patchedIds: data.patchedIds || [],
                patchedFields: data.patchedFields || [],
                triggerRegeneration: data.triggerRegeneration || false,
                summary: data.summary || 'Changes applied',
            });

        } catch (e) {
            setMessages(prev => prev.filter(m => !m.id.startsWith('thinking-')));
            setState("error");
            addMessage({ type: "assistant", content: e instanceof Error ? e.message : 'Something went wrong' });
        } finally {
            onProcessingChange(false);
        }
    };

    const handleNewConversation = () => {
        setMessages([]);
        setLastSessionId(null);
        setState("idle");
        setAllowQuestions(false);
        if (selectedIds.length > 0) {
            setMessages([{
                id: `system-${Date.now()}`,
                type: "system",
                content: `Working with ${selectedIds.length} selected item${selectedIds.length > 1 ? "s" : ""}`
            }]);
        }
    };

    const handleEnableQuestions = () => {
        setAllowQuestions(true);
        addMessage({ type: "system", content: "✓ Question mode enabled. Ask me anything about your data!" });
        if (pendingQuestion) {
            setInstruction(pendingQuestion);
            setPendingQuestion(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: 360 }}
                    exit={{ width: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="self-stretch max-h-[800px]"
                    style={{ overflow: 'clip' }}
                >
                    <Card className="w-[360px] h-full flex flex-col overflow-hidden border border-border rounded-2xl">
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
                                    disabled={state === "processing"}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                            {/* Messages area */}
                            <div className={`flex-1 p-3 space-y-3 ${messages.length > 0 ? 'overflow-y-auto' : 'overflow-hidden'}`}>
                                {messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                            <Sparkles className="h-6 w-6 text-primary" />
                                        </div>
                                        <h4 className="font-medium text-sm mb-1">How can I help?</h4>
                                        <p className="text-sm text-muted-foreground max-w-[200px]">
                                            Transform, analyze, or fix your data
                                        </p>
                                        <div className="mt-4 flex flex-wrap gap-1.5 justify-center max-w-[280px]">
                                            <span className="text-xs bg-muted px-2 py-1 rounded-full">&quot;Set all years to 2025&quot;</span>
                                            <span className="text-xs bg-muted px-2 py-1 rounded-full">&quot;How many colors?&quot;</span>
                                            <span className="text-xs bg-muted px-2 py-1 rounded-full">&quot;Fix missing SKUs&quot;</span>
                                        </div>
                                    </div>
                                ) : (
                                    messages.map((msg) => (
                                        <SparkMessage 
                                            key={msg.id} 
                                            message={msg}
                                            onUndo={msg.metadata?.sessionId === lastSessionId ? handleUndo : undefined}
                                            canUndo={msg.metadata?.sessionId === lastSessionId && !!lastSessionId}
                                            isUndoing={undoing}
                                            onEnableQuestions={!allowQuestions ? handleEnableQuestions : undefined}
                                        />
                                    ))
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input area */}
                            <div className="border-t p-3 shrink-0">
                                <div className="relative">
                                    <Textarea
                                        ref={textareaRef}
                                        placeholder="Ask anything..."
                                        value={instruction}
                                        onChange={(e) => setInstruction(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        disabled={state === "processing"}
                                        className="min-h-[40px] max-h-[100px] resize-none text-sm pr-10 border-0 shadow-none focus-visible:ring-0 p-0 bg-transparent"
                                        rows={1}
                                    />
                                    <Button
                                        size="sm"
                                        onClick={handleSubmit}
                                        disabled={!instruction.trim() || state === "processing"}
                                        className="h-7 w-7 p-0 rounded-full absolute top-0 right-0"
                                    >
                                        {state === "processing" ? (
                                            <LoadingIcon />
                                        ) : (
                                            <Send className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground/50 text-center py-2 border-t">Spark can make mistakes. Verify important changes.</p>
                        </CardContent>
                    </Card>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
