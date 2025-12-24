export default function ProductsPage() {
    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Products</h2>
                <p className="text-muted-foreground">
                    View and edit extracted product data
                </p>
            </div>
            <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
                <p className="text-muted-foreground">
                    Products will appear here after processing order confirmations
                </p>
            </div>
        </div>
    );
}
