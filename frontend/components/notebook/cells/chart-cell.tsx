import type { ChartCellProps } from "@/lib/notebook/block-types";
import { ChartContainer } from "@/components/notebook/chart-container";
import { ChartRenderer } from "@/components/notebook/chart-renderer";

export function ChartCell({ block, onTypeChange }: ChartCellProps) {
  return (
    <ChartContainer block={block} onTypeChange={onTypeChange} body={<ChartRenderer block={block} />} />
  );
}
