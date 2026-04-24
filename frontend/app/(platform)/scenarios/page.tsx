"use client";

import { NotebookPageLayout } from "@/components/notebook/notebook-page-layout";
import { ScenariosHomeContent } from "@/components/notebook/scenarios-home-content";

export default function ScenariosPage() {
  return (
    <NotebookPageLayout
      title="Сценарии"
      subtitle="Список аналитических сценариев (NL→SQL): запуск, переименование и создание новых ноутбуков."
    >
      <ScenariosHomeContent />
    </NotebookPageLayout>
  );
}
