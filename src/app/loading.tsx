import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function Loading() {
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </header>
      <main className="container mx-auto space-y-6 px-4 py-6">
        <Card className="border-border/40">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-16 w-48" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-6 w-40" />
          </CardContent>
        </Card>

        <div>
          <Skeleton className="mb-4 h-6 w-24" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card key={i} className="border-border/40">
                <CardContent className="space-y-3 p-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-2 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <Skeleton className="mb-4 h-6 w-32" />
          <Card className="border-border/40">
            <CardContent className="p-4">
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
