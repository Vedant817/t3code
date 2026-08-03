import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { UsageSettingsContent } from "./UsageSettingsPanel";

describe("UsageSettingsContent", () => {
  it("renders the contribution grid and model reasoning breakdown", () => {
    const html = renderToStaticMarkup(
      <UsageSettingsContent
        data={{
          fromDate: "2026-01-01",
          toDate: "2026-01-03",
          timeZone: "UTC",
          trackingStartedAt: "2026-01-02T00:00:00.000Z",
          days: [
            {
              date: "2026-01-03",
              metrics: {
                inputTokens: 100,
                cachedInputTokens: 20,
                outputTokens: 50,
                reasoningOutputTokens: 10,
                totalTokens: 150,
              },
              provenance: "exact",
              breakdown: [
                {
                  provider: "codex",
                  model: "gpt-5.4",
                  reasoningLevel: "high",
                  metrics: {
                    inputTokens: 100,
                    cachedInputTokens: 20,
                    outputTokens: 50,
                    reasoningOutputTokens: 10,
                    totalTokens: 150,
                  },
                  metricsProvenance: "exact",
                  modelProvenance: "inferred",
                  reasoningProvenance: "inferred",
                },
              ],
            },
          ],
        }}
        error={null}
        isPending={false}
        refresh={vi.fn()}
        range={{
          fromDate: "2026-01-01",
          toDate: "2026-01-03",
          dates: ["2026-01-01", "2026-01-02", "2026-01-03"],
        }}
        timeZone="UTC"
      />,
    );

    expect(html).toContain("Daily token usage");
    expect(html.match(/role="row"/g)).toHaveLength(7);
    expect(html.match(/role="gridcell"/g)).toHaveLength(3);
    expect(html).toContain("150 tokens, exact");
    expect(html).toContain("gpt-5.4");
    expect(html).toContain("high");
    expect(html).toContain("UTC");
  });
});
