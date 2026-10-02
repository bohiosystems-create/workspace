import { describeUpload as coreDescribe, type Described } from "./core/describe";
import { serverLlm } from "./llmConfig";

export type { Described };
export function describeUpload(buf: Buffer, mime: string, name: string): Promise<Described | null> {
  return coreDescribe(serverLlm(), new Uint8Array(buf), mime, name);
}
