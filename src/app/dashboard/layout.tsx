import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="flex h-screen">
            <div className="w-64 shrink-0">
                <Sidebar />
            </div>
            <main className="flex-1 overflow-auto bg-gradient-to-br from-background to-muted/40 p-8">{children}</main>
        </div>
    );
}
