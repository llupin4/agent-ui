import { Playground } from "@/components/Playground";
import { modelInfo } from "@/lib/server/model";

// Reads server env at request time; only non-secret labels reach the browser.
export const dynamic = "force-dynamic";

export default function Page() {
  const info = modelInfo();
  return (
    <Playground
      config={{
        modelLabel: info.label,
        fixture: info.fixture,
        hasCredentials: info.hasCredentials,
        keyEnv: info.keyEnv,
      }}
    />
  );
}
