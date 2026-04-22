import { PageHeader } from "@/components/layout/page-header";

export function PlaceholderPage({
  title,
  subtitle
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} subtitle={subtitle} />
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Заглушка. Подключенная бизнес-логика будет добавлена на следующем этапе.
      </section>
    </div>
  );
}
