import { requestJson } from "@/lib/api/request";
import { mockForecastAutoMLBacktest, mockForecastRun } from "@/lib/api/mocks";
import type {
  AutoMLBacktestRequestDto,
  AutoMLBacktestResponseDto,
  ForecastRunRequestDto,
  ForecastRunResponseDto
} from "@/types/api/forecast";

export async function runForecast(body: ForecastRunRequestDto): Promise<ForecastRunResponseDto> {
  return requestJson({
    path: "/api/v1/forecast/run",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: () => mockForecastRun()
  });
}

export async function runForecastAutoMLBacktest(body: AutoMLBacktestRequestDto): Promise<AutoMLBacktestResponseDto> {
  return requestJson({
    path: "/api/v1/forecast/automl-backtest",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: () => mockForecastAutoMLBacktest(body)
  });
}
