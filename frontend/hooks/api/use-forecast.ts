"use client";

import { useMutation } from "@tanstack/react-query";
import { runForecast, runForecastAutoMLBacktest } from "@/lib/api/forecast";
import type { AutoMLBacktestRequestDto, ForecastRunRequestDto } from "@/types/api/forecast";

export function useRunForecast() {
  return useMutation({
    mutationFn: (body: ForecastRunRequestDto) => runForecast(body)
  });
}

export function useRunForecastAutoMLBacktest() {
  return useMutation({
    mutationFn: (body: AutoMLBacktestRequestDto) => runForecastAutoMLBacktest(body)
  });
}
