"use client";
import { Card, CardContent } from "@omnitech/ui";
export default function NoaMemoryPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <Card>
        <CardContent className="p-6 text-sm text-seal-gray-500 dark:text-slate-400">
          Page mémoire Noa — en cours de finalisation. Backend opérationnel
          (extract/store/recall via Ollama, endpoints /api/v1/noa/memory).
        </CardContent>
      </Card>
    </div>
  );
}
