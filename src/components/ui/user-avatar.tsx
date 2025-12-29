"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TenantUserProfile } from "@/types";

interface UserAvatarProps {
    user?: TenantUserProfile;
    /** Fallback text when user is not found */
    fallbackName?: string;
}

export function UserAvatar({ user, fallbackName = "Unknown" }: UserAvatarProps) {
    const name = user?.full_name || user?.email || fallbackName;
    const initial = (name[0] || "?").toUpperCase();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground border border-border cursor-help">
                    {user?.avatar_url ? (
                        <img 
                            src={user.avatar_url} 
                            alt={name} 
                            className="h-full w-full rounded-full object-cover" 
                        />
                    ) : (
                        <span>{initial}</span>
                    )}
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <p>{name}</p>
            </TooltipContent>
        </Tooltip>
    );
}
